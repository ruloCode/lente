// add-agent-bridge 4.2 on the real hub (laptop mode) with a stubbed Meta API: when the chat asks for
// something to be done, /ask queues a job in "Por aprobar" and says so; a plain question queues
// nothing; and an outside agent asking through MCP cannot queue one. Synthetic text, a fake key.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let hub: ChildProcess | undefined;
let stub: ReturnType<typeof createServer> | undefined;
let base = "";

/** The stub answers like the model would: a command when the user's message is one, an answer otherwise. */
function modelAnswer(body: { messages: { role: string; content: string }[] }): string {
  const question = body.messages.at(-1)!.content;
  const command = /Claude|PROBE-plain-imperative/.test(question);
  return JSON.stringify(command ? { intent: "command", found: true, answer: "", sources: [], agent: "claude", instruction: "PROBE-update the README with the new commands" } : { intent: "command", found: true, answer: "", sources: [], agent: "codex", instruction: "PROBE-should never queue" });
}

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

async function pending(): Promise<{ id: string; tool: string; args: { agent: string; instruction: string } }[]> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value } = await reader.read();
      buffer += new TextDecoder().decode(value);
      for (const chunk of buffer.split("\n\n")) if (chunk.startsWith("data: ") && chunk.includes('"kind":"actions"')) return JSON.parse(chunk.slice(6)).pending;
    }
  } finally {
    ctrl.abort();
  }
}

before(async () => {
  stub = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: modelAnswer(JSON.parse(body)) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((ok) => stub!.listen(0, ok));
  const stubUrl = `http://localhost:${(stub.address() as AddressInfo).port}`;
  const port = await freePort();
  base = `http://localhost:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MODEL_API_KEY: "probe-fake-key", META_BASE_URL: stubUrl, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-ask-command-")) },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/health`).then((r) => r.status > 0, () => false)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("the hub did not start");
});

after(async () => {
  if (hub) {
    const gone = new Promise((r) => hub!.once("exit", r));
    hub.kill();
    await gone;
  }
  stub?.close();
});

test("«Que Claude…» in the chat queues a Claude job and the answer says it waits for approval", async () => {
  const res = await post("/ask", { question: "Que Claude actualice el README con los comandos nuevos", history: [] });
  assert.equal(res.status, 200);
  const out = (await res.json()) as { answer: string; job: { id: string; agent: string; instruction: string } };
  assert.match(out.answer, /^Lo dejé en «Por aprobar»: Claude Code hará «PROBE-update the README/);
  assert.equal(out.job.agent, "claude");
  const queued = (await pending()).find((p) => p.id === out.job.id);
  assert.deepEqual([queued?.tool, queued?.args.instruction], ["run_agent", "PROBE-update the README with the new commands"]);
});

test("a plain question never queues a job, even if the model says command", async () => {
  const before = (await pending()).length;
  const out = (await (await post("/ask", { question: "¿Qué quedó con Ana?", history: [] })).json()) as { job?: unknown; found: boolean };
  assert.equal(out.job, undefined);
  assert.equal(out.found, false);
  assert.equal((await pending()).length, before);
});

test("an outside agent's ask_lente cannot queue a job", async () => {
  const token = ((await (await post("/devices", { kind: "mcp", label: "Probe agent" })).json()) as { token: string }).token;
  const before = (await pending()).length;
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "ask_lente" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask_lente", arguments: { question: "Que Claude borre la carpeta" }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }),
  });
  const result = ((await res.json()) as { result: { structuredContent: { found: boolean } } }).result;
  assert.equal(result.structuredContent.found, false);
  assert.equal((await pending()).length, before);
});
