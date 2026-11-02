// add-agent-bridge 2.3: `/mcp` on the real hub in accounts mode, against the fake PostgREST over HTTP,
// with test-only keys and synthetic text. Tokens are per user and per scope, and a revoked one is out.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { servePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KEK = randomBytes(32).toString("base64");
let db: Awaited<ReturnType<typeof servePostgrest>>;
let hub: ChildProcess | undefined;
let base = "";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

const jwt = (sub: string, email: string) => {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${db.url}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
};
const ALICE_H = () => ({ Authorization: `Bearer ${jwt(ALICE, "alice@example.com")}` });
const BOB_H = () => ({ Authorization: `Bearer ${jwt(BOB, "bob@example.com")}` });
const post = (path: string, headers: Record<string, string>, body: unknown = {}) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

/** A new agent token for a signed-in user, as the app makes it. */
async function agentToken(headers: Record<string, string>, label: string, scopes?: string[]): Promise<{ id: string; token: string }> {
  const r = await post("/devices", headers, { kind: "mcp", label, ...(scopes ? { scopes } : {}) });
  assert.equal(r.status, 201);
  return (await r.json()) as { id: string; token: string };
}

let rpcId = 0;
/** One modern MCP request (2026-07-28) with the headers the transport requires. */
async function mcp(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "probe", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as { result?: Record<string, unknown>; error?: { code: number } } };
}
const call = async (token: string, name: string, args: Record<string, unknown> = {}) => (await mcp(token, "tools/call", { name, arguments: args })).json.result as { isError?: boolean; structuredContent: Record<string, unknown> };

async function events(headers: Record<string, string>, kind: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events`, { headers, signal: ctrl.signal });
  const reader = res.body!.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream ended before a ${kind} event`);
      buffer += new TextDecoder().decode(value);
      for (const chunk of buffer.split("\n\n")) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as Record<string, unknown>;
        if (event.kind === kind) return event;
      }
    }
  } finally {
    ctrl.abort();
  }
}

before(async () => {
  db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] });
  const port = await freePort();
  base = `http://localhost:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: KEK, LENTE_ALLOWED_EMAILS: "alice@example.com bob@example.com", PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-mcp-")) },
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
  db?.close();
});

test("a read token lists the read tools only, reads its own user's tasks, and is refused writes", async () => {
  assert.equal((await post("/tasks/add", ALICE_H(), { title: "PROBE-ALICE-task", who: "lente" })).status, 201);
  assert.equal((await post("/tasks/add", BOB_H(), { title: "PROBE-BOB-task", who: "me" })).status, 201);
  const reader = await agentToken(ALICE_H(), "Claude Code");

  const list = await mcp(reader.token, "tools/list");
  assert.equal(list.status, 200);
  assert.deepEqual((list.json.result!.tools as { name: string }[]).map((t) => t.name), ["ask_lente", "search_meetings", "get_meeting", "list_projects", "list_tasks"]);

  const tasks = (await call(reader.token, "list_tasks")).structuredContent.tasks as { title: string; who: string }[];
  assert.deepEqual(tasks.map((t) => [t.title, t.who]), [["PROBE-ALICE-task", "lente"]]);
  assert.equal((await call(reader.token, "create_task", { title: "PROBE-sneaky" })).structuredContent.error, "unauthorized");

  // The call is in Alice's day, by the token's label, with no content.
  const status = await events(ALICE_H(), "status");
  assert.ok(status);
  const day = db.fake.tables.get("day_entries") ?? [];
  assert.ok(day.some((r) => r.user_id === ALICE && r.kind === "agent"), "the call reached Alice's day");
  assert.ok(!day.some((r) => r.user_id === BOB && r.kind === "agent"));
});

test("another user's token sees none of Alice's data: not her tasks, not her meetings", async () => {
  assert.equal((await post("/meeting/start", ALICE_H(), { title: "PROBE-ALICE-meeting" })).status, 204);
  assert.equal((await post("/meeting/end", ALICE_H())).status, 204);
  const alicesMeeting = ((await events(ALICE_H(), "meetings")).items as { id: string }[])[0]!.id;
  const bobs = await agentToken(BOB_H(), "Bob's Codex", ["read", "tasks.write"]);

  const tasks = (await call(bobs.token, "list_tasks", { open: false })).structuredContent.tasks as { title: string }[];
  assert.deepEqual(tasks.map((t) => t.title), ["PROBE-BOB-task"]);
  assert.equal((await call(bobs.token, "get_meeting", { id: alicesMeeting })).structuredContent.error, "not_found");
  const found = (await call(bobs.token, "search_meetings", { query: "PROBE-ALICE" })).structuredContent.meetings as unknown[];
  assert.deepEqual(found, []);
  const aliceTaskId = ((await events(ALICE_H(), "actions")).tasks as { id: string }[])[0]!.id;
  assert.equal((await call(bobs.token, "complete_task", { id: aliceTaskId })).structuredContent.error, "not_found");

  // Alice's own token reads her meeting.
  const reader = await agentToken(ALICE_H(), "Alice reader");
  assert.equal((await call(reader.token, "get_meeting", { id: alicesMeeting })).structuredContent.title, "PROBE-ALICE-meeting");
});

test("a tasks.write token creates and completes a task the phone sees", async () => {
  const writer = await agentToken(ALICE_H(), "Cursor", ["read", "tasks.write"]);
  assert.equal(((await mcp(writer.token, "tools/list")).json.result!.tools as unknown[]).length, 8);
  const made = (await call(writer.token, "create_task", { title: "PROBE-from-agent", who: "lente" })).structuredContent.task as { id: string };
  let phone = (await events(ALICE_H(), "actions")).tasks as { id: string; title: string; source?: string; done: boolean }[];
  assert.equal(phone.find((t) => t.id === made.id)?.source, "agent");
  assert.equal(((await call(writer.token, "complete_task", { id: made.id })).structuredContent.task as { done: boolean }).done, true);
  phone = (await events(ALICE_H(), "actions")).tasks as typeof phone;
  assert.equal(phone.find((t) => t.id === made.id)?.done, true);
  assert.ok(!db.fake.dump().includes("PROBE-from-agent"), "the title is sealed in the database");
});

test("a revoked token, a clip token and a person's access token get 401 on /mcp", async () => {
  const agent = await agentToken(ALICE_H(), "Short-lived");
  assert.equal((await mcp(agent.token, "tools/list")).status, 200);
  assert.equal((await post("/devices/revoke", ALICE_H(), { id: agent.id })).status, 204);
  const revoked = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${agent.token}` }, body: "{}" });
  assert.equal(revoked.status, 401);
  assert.match(revoked.headers.get("www-authenticate") ?? "", /^Bearer/);

  const clip = (await (await post("/devices", ALICE_H(), { kind: "clip", label: "Clip" })).json()) as { token: string };
  assert.equal((await mcp(clip.token, "tools/list")).status, 401);
  assert.equal((await fetch(`${base}/mcp`, { method: "POST", headers: ALICE_H(), body: "{}" })).status, 401);
  assert.equal((await fetch(`${base}/mcp`, { method: "POST", body: "{}" })).status, 401);
  // And an agent token opens none of the phone's routes.
  assert.equal((await fetch(`${base}/facts`, { headers: { Authorization: `Bearer ${agent.token}` } })).status, 401);
});

test("paused by the wearer: tools answer paused_by_wearer until resumed", async () => {
  const reader = await agentToken(ALICE_H(), "Paused");
  assert.equal((await post("/agents/pause", ALICE_H())).status, 204);
  assert.equal((await call(reader.token, "list_tasks")).structuredContent.error, "paused_by_wearer");
  assert.deepEqual(await (await fetch(`${base}/agents`, { headers: ALICE_H() })).json(), { paused: true });
  assert.equal((await post("/agents/resume", ALICE_H())).status, 204);
  assert.equal((await call(reader.token, "list_tasks")).isError, undefined);
});

test("an initialize-era client works too", async () => {
  const reader = await agentToken(ALICE_H(), "Legacy");
  const headers = { Authorization: `Bearer ${reader.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const init = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "old", version: "1" } } }) });
  assert.equal(((await init.json()) as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");
  const list = await fetch(`${base}/mcp`, { method: "POST", headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
  assert.equal(((await list.json()) as { result: { tools: unknown[] } }).result.tools.length, 5);
  assert.equal((await fetch(`${base}/mcp`, { headers })).status, 405);
});

test("jobs belong to their user: Bob's bridge cannot claim Alice's approved job", async () => {
  const made = await post("/agent/jobs", ALICE_H(), { instruction: "PROBE-alice job", agent: "claude" });
  assert.equal(made.status, 201);
  const { id } = (await made.json()) as { id: string };
  assert.equal((await post("/actions/decide", ALICE_H(), { id, decision: "approve" })).status, 200);
  const bobsBridge = await agentToken(BOB_H(), "Bob's bridge", ["agent.run"]);
  const claim = (token: string) => fetch(`${base}/agent/jobs/${id}/claim`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await claim(bobsBridge.token)).status, 404);
  const alicesReader = await agentToken(ALICE_H(), "Reader");
  assert.equal((await claim(alicesReader.token)).status, 403, "read is not agent.run");
  const alicesBridge = await agentToken(ALICE_H(), "Alice's bridge", ["agent.run"]);
  assert.equal((await claim(alicesBridge.token)).status, 200);
  assert.equal((await claim(alicesBridge.token)).status, 409, "claimed once");
  assert.ok(!db.fake.dump().includes("PROBE-alice job"), "the instruction is sealed");
});
