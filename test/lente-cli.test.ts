// add-agent-bridge 3.1: the `lente` CLI against the real hub (laptop mode, no model key), run as a
// subprocess so stdout, stderr and exit codes are what a script sees. Synthetic text only.

import assert from "node:assert/strict";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { EXIT, parseCommand } from "../scripts/lente.ts";

let hub: ChildProcess | undefined;
let base = "";
let writer = "";
let reader = "";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

/** Runs the CLI the way a script would. */
const lente = (args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> =>
  new Promise((resolve) => {
    execFile(process.execPath, ["scripts/lente.ts", ...args], { env: { PATH: process.env.PATH!, LENTE_HUB: base, ...env } }, (error, out, err) => {
      resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, out, err });
    });
  });

before(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-cli-")) },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/health`).then((r) => r.status > 0, () => false)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const make = async (scopes: string[]) => ((await (await fetch(`${base}/devices`, { method: "POST", body: JSON.stringify({ kind: "mcp", label: "CLI", scopes }) })).json()) as { token: string }).token;
  writer = await make(["read", "tasks.write"]);
  reader = await make(["read"]);
});

after(async () => {
  if (!hub) return;
  const gone = new Promise((r) => hub!.once("exit", r));
  hub.kill();
  await gone;
});

test("parseCommand: the four commands and their usage errors", () => {
  assert.deepEqual(parseCommand(["ask", "¿Qué", "quedó?", "--project", "Lente"]), { tool: "ask_lente", args: { question: "¿Qué quedó?", project: "Lente" }, json: false });
  assert.deepEqual(parseCommand(["tasks", "--who", "lente", "--all", "--json"]), { tool: "list_tasks", args: { who: "lente", open: false }, json: true });
  assert.deepEqual(parseCommand(["task", "add", "Enviar", "la", "cotización", "--who", "other", "--other", "Ana"]), { tool: "create_task", args: { title: "Enviar la cotización", who: "other", other_name: "Ana" }, json: false });
  assert.deepEqual(parseCommand(["task", "done", "k1"]), { tool: "complete_task", args: { id: "k1" }, json: false });
  assert.deepEqual(parseCommand(["task", "add", "--", "--literal title"]), { tool: "create_task", args: { title: "--literal title" }, json: false });
  for (const bad of [[], ["ask"], ["tasks", "x"], ["task", "done"], ["task", "add", "x", "--project", "p"], ["ask", "x", "--nope"], ["deploy"], ["ask", "x", "--who"]]) {
    assert.ok("error" in parseCommand(bad), bad.join(" "));
  }
});

test("--json: one document on stdout; a task added by the CLI is listed and completed", async () => {
  const added = await lente(["task", "add", "PROBE-cli-task", "--who", "lente", "--json"], { LENTE_TOKEN: writer });
  assert.equal(added.code, 0, added.err);
  assert.equal(added.err, "");
  const task = (JSON.parse(added.out) as { task: { id: string; title: string; who: string } }).task;
  assert.deepEqual([task.title, task.who], ["PROBE-cli-task", "lente"]);

  const listed = await lente(["tasks", "--who", "lente", "--json"], { LENTE_TOKEN: reader });
  assert.equal(listed.code, 0);
  assert.deepEqual((JSON.parse(listed.out) as { tasks: { id: string }[] }).tasks.map((t) => t.id), [task.id]);

  const done = await lente(["task", "done", task.id], { LENTE_TOKEN: writer });
  assert.equal(done.code, 0);
  assert.equal(done.out.trim(), "Hecha: PROBE-cli-task");
  assert.deepEqual(JSON.parse((await lente(["tasks", "--json"], { LENTE_TOKEN: reader })).out), { tasks: [] });
  assert.match((await lente(["tasks", "--all"], { LENTE_TOKEN: reader })).out, /^\[x\] PROBE-cli-task {2}\(lente\)/);
});

test("exit codes: 5 not found, 2 no permission, 3 hub error, 1 usage; errors only on stderr", async () => {
  const missing = await lente(["task", "done", "k-none", "--json"], { LENTE_TOKEN: writer });
  assert.equal(missing.code, EXIT.notFound);
  assert.equal(missing.out, "");
  assert.equal((JSON.parse(missing.err) as { error: string }).error, "not_found");

  const readOnly = await lente(["task", "add", "PROBE-nope"], { LENTE_TOKEN: reader });
  assert.equal(readOnly.code, EXIT.unauthorized);
  assert.match(readOnly.err, /^lente: unauthorized: /);
  assert.equal((await lente(["tasks"], { LENTE_TOKEN: "bogus-token" })).code, EXIT.unauthorized);
  assert.equal((await lente(["tasks"])).code, EXIT.unauthorized, "no token at all");

  // No model key on this hub: ask_lente is unavailable, a hub error.
  const ask = await lente(["ask", "¿PROBE?", "--json"], { LENTE_TOKEN: reader });
  assert.equal(ask.code, EXIT.hub);
  assert.equal((JSON.parse(ask.err) as { error: string }).error, "unavailable");
  assert.equal((await lente(["tasks"], { LENTE_TOKEN: reader, LENTE_HUB: "http://127.0.0.1:9" })).code, EXIT.hub);
  assert.equal((await lente(["task", "add", "x", "--who", "boss"], { LENTE_TOKEN: writer })).code, EXIT.usage);
  const usage = await lente(["nope"], { LENTE_TOKEN: reader });
  assert.equal(usage.code, EXIT.usage);
  assert.match(usage.err, /usage:/);
});
