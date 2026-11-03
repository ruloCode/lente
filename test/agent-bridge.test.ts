// add-agent-bridge 4.3: the bridge's pure parts, then the bridge itself against the real hub
// (laptop mode) with a fake agent that records how it was called and exits with 0 or 1.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { EXIT_NOT_RUN, EXIT_TIMEOUT, agentCommand, agentEnv, parseConfig, resolveFolder, sseEvents, summarize } from "../src/agent-bridge.ts";

const HOME = "/Users/probe";

test("parseConfig: folders must be absolute project folders; the default must be one of them", () => {
  const ok = parseConfig(JSON.stringify({ hub: "https://hub.example", folders: { lente: "~/dev/lente", site: "/srv/site/" }, default: "site" }), HOME);
  assert.ok(!("error" in ok));
  assert.deepEqual([...ok.folders], [["lente", "/Users/probe/dev/lente"], ["site", "/srv/site"]]);
  assert.equal(ok.defaultFolder, "site");
  assert.deepEqual(ok.commands, { claude: "claude", codex: "codex" });
  assert.equal(ok.timeoutMs, 15 * 60_000);
  for (const [bad, why] of [["{", /not JSON/], [JSON.stringify({}), /needs "folders"/], [JSON.stringify({ folders: {} }), /no folders/], [JSON.stringify({ folders: { a: "dev/x" } }), /absolute/], [JSON.stringify({ folders: { a: "/" } }), /not \/ or your home/], [JSON.stringify({ folders: { a: "~" } }), /absolute|home/], [JSON.stringify({ folders: { a: "/x" }, default: "b" }), /default folder b/], [JSON.stringify({ folders: { a: "/x" }, commands: { gpt: "gpt" } }), /unknown agent/], [JSON.stringify({ folders: { a: "/x" }, timeoutMs: 20 * 60_000 }), /timeoutMs/]] as const) {
    const out = parseConfig(bad, HOME);
    assert.ok("error" in out && why.test(out.error), `${bad} → ${JSON.stringify(out)}`);
  }
});

test("resolveFolder: by name or exact path from the list, nothing else", () => {
  const config = parseConfig(JSON.stringify({ folders: { lente: "~/dev/lente", site: "/srv/site" } }), HOME) as Exclude<ReturnType<typeof parseConfig>, { error: string }>;
  assert.deepEqual(resolveFolder(config, undefined, HOME), { ok: true, name: "lente", path: "/Users/probe/dev/lente" });
  assert.deepEqual(resolveFolder(config, "site", HOME), { ok: true, name: "site", path: "/srv/site" });
  assert.deepEqual(resolveFolder(config, "/srv/site/", HOME), { ok: true, name: "site", path: "/srv/site" });
  for (const bad of ["/srv", "/srv/site/../../etc", "~", "/Users/probe/dev/lente/sub", "other"]) assert.equal(resolveFolder(config, bad, HOME).ok, false, bad);
});

test("agentCommand: the restrictive flags, the instruction after --", () => {
  const commands = { claude: "claude", codex: "codex" };
  assert.deepEqual(agentCommand({ agent: "claude", instruction: "--dangerously-skip-permissions" }, "/srv/site", commands, "/tmp/m.txt"), {
    file: "claude",
    args: ["-p", "--restricted", "--permission-mode", "acceptEdits", "--permission-prompts", "none", "--strict-mcp-config", "--no-session-persistence", "--disallowedTools", "WebSearch", "--output-format", "text", "--", "--dangerously-skip-permissions"],
    cwd: "/srv/site",
  });
  const codex = agentCommand({ agent: "codex", instruction: "PROBE" }, "/srv/site", commands, "/tmp/m.txt");
  assert.deepEqual(codex.args, ["exec", "--sandbox", "workspace-write", "--cd", "/srv/site", "--ephemeral", "--output-last-message", "/tmp/m.txt", "--", "PROBE"]);
  assert.equal(codex.lastMessageFile, "/tmp/m.txt");
});

test("agentEnv keeps no key, token or Lente variable", () => {
  const env = agentEnv({ PATH: "/bin", HOME: "/h", LANG: "es", LENTE_TOKEN: "t", ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", MODEL_API_KEY: "k", GITHUB_TOKEN: "g", AWS_SECRET_ACCESS_KEY: "s" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/h", LANG: "es" });
});

test("summarize and sseEvents", () => {
  assert.equal(summarize({ exitCode: 0, stdout: " PROBE done \n", stderr: "noise" }), "PROBE done");
  assert.equal(summarize({ exitCode: 0, lastMessage: "final", stdout: "chatter", stderr: "" }), "final");
  assert.equal(summarize({ exitCode: 1, stdout: "", stderr: "boom" }), "stderr: boom");
  assert.equal(summarize({ exitCode: 3, stdout: "", stderr: "" }), "Salió con código 3, sin salida.");
  const long = summarize({ exitCode: 0, stdout: `${"x".repeat(5000)}END`, stderr: "" });
  assert.equal(long.length, 2000);
  assert.ok(long.startsWith("…") && long.endsWith("END"));
  assert.deepEqual(sseEvents('data: {"a":1}\n\n: keep-alive\n\ndata: {"b"'), { events: ['{"a":1}'], rest: 'data: {"b"' });
});

// --- The bridge against the hub ---------------------------------------------------------------

let hub: ChildProcess | undefined;
let bridge: ChildProcess | undefined;
let base = "";
let folder = "";
let other = "";
let bridgeLog = "";
let bridgeToken = "";

const FAKE_AGENT = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const instruction = process.argv.at(-1);
appendFileSync("runs.jsonl", JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), env: Object.keys(process.env) }) + "\\n");
if (instruction.includes("PROBE-sleep")) setTimeout(() => {}, 60_000);
else {
  console.log("PROBE-summary of " + instruction);
  if (instruction.includes("PROBE-fail")) console.error("PROBE-error");
  process.exit(instruction.includes("PROBE-fail") ? 1 : 0);
}
`;

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const until = async (check: () => boolean | Promise<boolean>, ms = 8000): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) if (await check()) return true;
  return check();
};
const runs = (dir = folder): { args: string[]; cwd: string; env: string[] }[] =>
  existsSync(join(dir, "runs.jsonl")) ? readFileSync(join(dir, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];

/** The actions event the phone gets (laptop hub: no sign-in). */
async function actionsEvent(): Promise<{ pending: { id: string; tool: string; args: Record<string, unknown> }[]; decided: { id: string; status: string; job?: { state: string; summary: string; exitCode: number | null } }[]; tasks: { id: string; done: boolean }[] }> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("no actions event");
      buffer += new TextDecoder().decode(value);
      for (const chunk of buffer.split("\n\n")) if (chunk.startsWith("data: ") && chunk.includes('"kind":"actions"')) return JSON.parse(chunk.slice(6));
    }
  } finally {
    ctrl.abort();
  }
}
const job = async (id: string) => (await actionsEvent()).decided.find((d) => d.id === id);

before(async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lente-bridge-test-")));
  folder = join(dir, "project");
  other = join(dir, "not-allowed");
  mkdirSync(folder);
  mkdirSync(other);
  const agent = join(dir, "fake-agent.mjs");
  writeFileSync(agent, FAKE_AGENT);
  chmodSync(agent, 0o755);
  const port = await freePort();
  base = `http://localhost:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: join(dir, "data") }, stdio: "ignore" });
  assert.ok(await until(() => fetch(`${base}/health`).then((r) => r.status > 0, () => false)), "the hub started");

  const token = ((await (await post("/devices", { kind: "mcp", label: "Puente", scopes: ["agent.run"] })).json()) as { token: string }).token;
  bridgeToken = token;
  const config = join(dir, "agents.json");
  writeFileSync(config, JSON.stringify({ hub: base, folders: { project: folder }, commands: { claude: agent, codex: agent }, timeoutMs: 1500 }));
  bridge = spawn(process.execPath, ["scripts/agent-bridge.ts", "--config", config], { env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_TOKEN: token, PROBE_SECRET_KEY: "PROBE-must-not-leak" }, stdio: ["ignore", "pipe", "pipe"] });
  bridge.stdout!.on("data", (c) => (bridgeLog += c));
  bridge.stderr!.on("data", (c) => (bridgeLog += c));
  assert.ok(await until(() => bridgeLog.includes("following")), `the bridge connected: ${bridgeLog}`);
});

after(async () => {
  for (const p of [bridge, hub]) {
    if (!p || p.exitCode !== null) continue;
    const gone = new Promise((r) => p.once("exit", r));
    p.kill();
    await gone;
  }
});

test("a job that is pending or rejected never runs; approved, it runs once and closes its task", async () => {
  const task = (await (await post("/tasks/add", { title: "PROBE-task for the agent", who: "lente" })).json()) as { id: string };
  const made = await post("/agent/jobs", { taskId: task.id, agent: "claude" });
  assert.equal(made.status, 201);
  const { id } = (await made.json()) as { id: string; instruction: string };
  const rejected = ((await (await post("/agent/jobs", { instruction: "PROBE-rejected work" })).json()) as { id: string }).id;
  assert.ok((await actionsEvent()).pending.some((p) => p.id === id && p.tool === "run_agent"), "the job waits in Por aprobar");

  await new Promise((r) => setTimeout(r, 1200));
  assert.deepEqual(runs(), [], "nothing ran before approval");
  assert.equal((await post("/agent/jobs/" + id + "/claim", {})).status, 401, "a person cannot claim a job; only the bridge's token");

  assert.equal((await post("/actions/decide", { id: rejected, decision: "reject" })).status, 200);
  assert.equal((await post("/actions/decide", { id, decision: "approve" })).status, 200);
  assert.ok(await until(async () => (await job(id))?.job?.state === "done"), `the job finished: ${bridgeLog}`);
  const [run] = runs();
  assert.equal(runs().length, 1, "exactly one run, the approved one");
  assert.equal(run!.cwd, folder);
  assert.deepEqual(run!.args.slice(0, 3), ["-p", "--restricted", "--permission-mode"]);
  assert.equal(run!.args.at(-1), "PROBE-task for the agent");
  assert.ok(!run!.env.includes("LENTE_TOKEN") && !run!.env.includes("PROBE_SECRET_KEY"), `no key reached the agent: ${run!.env.join(",")}`);
  const finished = (await job(id))!.job!;
  assert.equal(finished.exitCode, 0);
  assert.equal(finished.summary, "PROBE-summary of PROBE-task for the agent");
  assert.equal((await actionsEvent()).tasks.find((t) => t.id === task.id)?.done, true, "exit 0 closes the task");
  assert.equal((await job(rejected))?.job, undefined, "the rejected job never queued");
});

test("an agent that exits 1 fails the job and leaves its task open", async () => {
  const task = (await (await post("/tasks/add", { title: "PROBE-fail this one", who: "lente" })).json()) as { id: string };
  const { id } = (await (await post("/agent/jobs", { taskId: task.id, agent: "codex" })).json()) as { id: string };
  await post("/actions/decide", { id, decision: "approve" });
  assert.ok(await until(async () => (await job(id))?.job?.state === "failed"), bridgeLog);
  const failed = (await job(id))!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.job!.exitCode, 1);
  assert.match(failed.job!.summary, /PROBE-summary of PROBE-fail this one[\s\S]*stderr: PROBE-error/);
  assert.equal(runs().at(-1)!.args[0], "exec", "codex's command line");
  assert.equal((await actionsEvent()).tasks.find((t) => t.id === task.id)?.done, false);
});

test("a folder outside the allow list fails without running the agent", async () => {
  const before = runs().length;
  const { id } = (await (await post("/agent/jobs", { instruction: "PROBE-elsewhere", workdir: other })).json()) as { id: string };
  await post("/actions/decide", { id, decision: "approve" });
  assert.ok(await until(async () => (await job(id))?.job?.state === "failed"), bridgeLog);
  assert.equal((await job(id))!.job!.exitCode, EXIT_NOT_RUN);
  assert.match((await job(id))!.job!.summary, /not in the bridge's allow list/);
  assert.equal(runs().length, before);
  assert.deepEqual(runs(other), []);
});

test("a job past its timeout is stopped and reported as failed", async () => {
  const { id } = (await (await post("/agent/jobs", { instruction: "PROBE-sleep forever" })).json()) as { id: string };
  await post("/actions/decide", { id, decision: "approve" });
  assert.ok(await until(async () => (await job(id))?.job?.state === "failed", 10_000), bridgeLog);
  assert.equal((await job(id))!.job!.exitCode, EXIT_TIMEOUT);
  assert.match((await job(id))!.job!.summary, /^Detenido/);
});

test("the bridge's stream carries jobs only; a token without agent.run gets 403", async () => {
  const readOnly = ((await (await post("/devices", { kind: "mcp", label: "Reader" })).json()) as { token: string }).token;
  assert.equal((await fetch(`${base}/events`, { headers: { Authorization: `Bearer ${readOnly}` } })).status, 403);
  assert.equal((await fetch(`${base}/events`, { headers: { Authorization: "Bearer bogus" } })).status, 401);

  // The stream opens with the queue and carries nothing of the phone's (status, turns, meetings).
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events`, { headers: { Authorization: `Bearer ${bridgeToken}` }, signal: ctrl.signal });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  let text = "";
  setTimeout(() => ctrl.abort(), 400);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
  } catch {
    // aborted after 400 ms
  }
  const kinds = sseEvents(text + "\n\n").events.map((e) => (JSON.parse(e) as { kind: string }).kind);
  assert.deepEqual(kinds, ["jobs"]);
});
