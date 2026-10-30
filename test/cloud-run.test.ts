import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { childEnv, cloudEligible } from "../scripts/auto/cloud.ts";
import { cloudApi, cloudRound, startSession, watchRound } from "../scripts/auto/cloud-run.ts";
import { readGithubToken, readKey } from "../scripts/auto/cloud-setup.ts";
import { initialState } from "../scripts/auto/cloud.ts";

const KEY = "sk-ant-test-0000";
const ROOT = "/repo/.claude/worktrees/auto";
const SHA = "a".repeat(40);
const GOOD_PATCH = "diff --git a/src/x.ts b/src/x.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/x.ts\n@@ -0,0 +1 @@\n+export {};\n";
const BAD_PATCH = "diff --git a/firmware/lente-clip/secrets.h b/firmware/lente-clip/secrets.h\nnew file mode 100644\n--- /dev/null\n+++ b/firmware/lente-clip/secrets.h\n@@ -0,0 +1 @@\n+x\n";

const ev = (id: string, type: string, extra: object = {}) => ({ id, type, ...extra });
const idle = (id: string, reason: string) => ev(id, "session.status_idle", { stop_reason: { type: reason } });
const sseBody = (events: object[], hang?: AbortSignal) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (!hang) c.close();
      else hang.addEventListener("abort", () => c.error(new Error("aborted")));
    },
  });

type Script = { streams: (object[] | "hang")[]; listed?: object[][]; files?: object[][]; contents?: Record<string, string | number>; flakyDownloads?: number };

/** A fake Managed Agents API: scripted streams, event lists and file lists, a log of every call. */
function fake(script: Script) {
  const calls: { method: string; path: string; body?: any; key?: string }[] = [];
  let stream = 0, list = 0, files = 0;
  const f: typeof fetch = async (url, init) => {
    const path = String(url).replace("https://api.anthropic.com/v1", "");
    const method = init?.method ?? "GET";
    const hs = init?.headers as Record<string, string>;
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined, key: hs["x-api-key"] });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (method === "POST" && path === "/sessions") return json({ id: "sess_1" });
    if (method === "POST") return json({});
    if (path.endsWith("/events/stream")) {
      const s = script.streams[Math.min(stream++, script.streams.length - 1)];
      return new Response(sseBody(s === "hang" ? [] : s, s === "hang" ? init?.signal ?? undefined : undefined));
    }
    if (path.endsWith("/events")) return json({ data: script.listed?.[Math.min(list++, script.listed.length - 1)] ?? [] });
    if (path.startsWith("/files?")) return json({ data: script.files?.[Math.min(files++, script.files.length - 1)] ?? [] });
    const m = /^\/files\/(.+)\/content$/.exec(path);
    if (m) {
      if (script.flakyDownloads) { script.flakyDownloads--; return new Response("busy", { status: 503 }); }
      const c = script.contents?.[m[1]!];
      return typeof c === "number" ? new Response("busy", { status: c }) : new Response(c ?? "", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const api = cloudApi({ fetch: f, getKey: () => KEY, sleep: async () => {} });
  return { api, calls };
}
const session = () => ({ id: "sess_1", state: initialState(), known: new Set<string>() });
const outputs = (patchId = "f1", resultId = "f2") => [{ id: patchId, filename: "node.patch", created_at: "2026-10-30T10:00:00Z" }, { id: resultId, filename: "result.json", created_at: "2026-10-30T10:00:01Z" }];
const RESULT = JSON.stringify({ commit_message: "x", tasks: [] });

test("a session is created with the budget in cents, the read-only mount, and the key only in the header", async () => {
  const { api, calls } = fake({ streams: [[]] });
  const s = await startSession(api, { agentId: "agent_1", environmentId: "env_1", sha: SHA, githubToken: "ghp_x", budgetUsd: 6, title: "t", node: "c/g" });
  assert.equal(s.id, "sess_1");
  const body = calls[0]!.body;
  assert.deepEqual(body.budget, { type: "limit", max_list_cost: { amount: "600", currency: "USD" } });
  assert.deepEqual(body.resources[0].checkout, { type: "commit", sha: SHA });
  assert.equal(calls[0]!.key, KEY);
  assert.ok(!JSON.stringify(body).includes(KEY));
});

test("a round follows the stream to end_turn, downloads the outputs and checks the patch", async () => {
  const { api, calls } = fake({
    streams: [[ev("e1", "session.status_running"), ev("e2", "agent.tool_use", { name: "bash" }), ev("e3", "session.usage", { list_cost: { amount: "123" } }), idle("e4", "end_turn")]],
    files: [[], outputs()],
    contents: { f1: GOOD_PATCH, f2: RESULT },
  });
  const s = session();
  const seen: number[] = [];
  const r = await cloudRound(api, s, "build it", ROOT, (st) => seen.push(st.listCostUsd));
  assert.equal(r.error, undefined);
  assert.equal(r.patch, GOOD_PATCH);
  assert.deepEqual(r.result, { commit_message: "x", tasks: [] });
  assert.equal(s.state.listCostUsd, 1.23);
  assert.deepEqual(s.state.tools, ["bash"]);
  assert.equal(calls.filter((c) => c.path === "/files?scope_id=sess_1").length, 2, "retried until the index caught up");
});

test("a dropped stream reopens, catches up from the event list and dedupes by id", async () => {
  const { api, calls } = fake({
    streams: [[ev("e1", "session.status_running"), ev("e2", "agent.tool_use", { name: "bash" })], [ev("e2", "agent.tool_use", { name: "bash" })]],
    listed: [[ev("e1", "session.status_running")], [ev("e1", "session.status_running"), ev("e2", "agent.tool_use", { name: "bash" }), idle("e3", "end_turn")]],
  });
  const r = await watchRound(api, "sess_1", initialState());
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, "idle");
  assert.deepEqual(r.state.tools, ["bash"], "the repeated tool call counts once");
  assert.equal(calls.filter((c) => c.path.endsWith("/stream")).length, 2);
});

test("a fix round goes to the same session and takes only the new patch", async () => {
  const { api, calls } = fake({
    streams: [[ev("e1", "session.status_running"), idle("e2", "end_turn")], [ev("e3", "session.status_running"), idle("e4", "end_turn")]],
    listed: [[], [ev("e1", "session.status_running"), idle("e2", "end_turn")]],
    files: [outputs("f1", "f2"), [...outputs("f1", "f2"), ...outputs("f3", "f4")]],
    contents: { f1: GOOD_PATCH, f2: RESULT, f3: GOOD_PATCH + "+// round 2\n", f4: RESULT },
  });
  const s = session();
  const one = await cloudRound(api, s, "build", ROOT);
  assert.equal(one.patch, GOOD_PATCH);
  const two = await cloudRound(api, s, "gate smoke failed", ROOT);
  assert.equal(two.error, undefined);
  assert.ok(two.patch?.endsWith("// round 2\n"), "the stale idle did not end round two and the old file was skipped");
  const sends = calls.filter((c) => c.method === "POST");
  assert.deepEqual(sends.map((c) => c.path), ["/sessions/sess_1/events", "/sessions/sess_1/events"]);
  assert.equal(sends[1]!.body.events[0].content[0].text, "gate smoke failed");
});

test("budget_reached fails the node with the reason", async () => {
  const { api } = fake({ streams: [[ev("e1", "session.status_running"), idle("e2", "budget_reached")]] });
  const r = await cloudRound(api, session(), "go", ROOT);
  assert.equal(r.error, "cloud budget reached");
});

test("requires_action interrupts the session and fails", async () => {
  const { api, calls } = fake({ streams: [[ev("e1", "session.status_running"), idle("e2", "requires_action")]] });
  const r = await cloudRound(api, session(), "go", ROOT);
  assert.match(r.error ?? "", /tool confirmation/);
  assert.ok(calls.some((c) => c.body?.events?.[0]?.type === "user.interrupt"));
});

test("session.error fails with the error text", async () => {
  const { api } = fake({ streams: [[ev("e1", "session.status_running"), ev("e2", "session.error", { error: { message: "container crashed" } })]] });
  const r = await cloudRound(api, session(), "go", ROOT);
  assert.equal(r.error, "cloud session error: container crashed");
});

test("the wall clock ends a round that never goes idle", async () => {
  const { api, calls } = fake({ streams: ["hang"] });
  const r = await watchRound(api, "sess_1", initialState(), { timeoutMs: 40 });
  assert.match(r.error ?? "", /timed out/);
  assert.ok(calls.some((c) => c.body?.events?.[0]?.type === "user.interrupt"), "the session is interrupted so it stops spending");
});

test("a patch that touches a secret is refused naming the path", async () => {
  const { api } = fake({ streams: [[idle("e1", "end_turn")]], files: [outputs()], contents: { f1: BAD_PATCH, f2: RESULT } });
  const r = await cloudRound(api, session(), "go", ROOT);
  assert.match(r.error ?? "", /firmware\/lente-clip\/secrets\.h/);
  assert.equal(r.patch, undefined);
});

test("a download that fails once is retried, and gives up after three tries", async () => {
  const once = fake({ streams: [[]], contents: { f1: "body" }, flakyDownloads: 1 });
  assert.equal(await once.api.download("f1"), "body");
  assert.equal(once.calls.filter((c) => c.path === "/files/f1/content").length, 2);
  const never = fake({ streams: [[]], contents: { f1: 503 } });
  await assert.rejects(never.api.download("f1"), /503/);
  assert.equal(never.calls.filter((c) => c.path === "/files/f1/content").length, 3);
});

test("with no outputs the round fails instead of waiting forever", async () => {
  const { api } = fake({ streams: [[idle("e1", "end_turn")]], files: [[]] });
  const r = await cloudRound(api, session(), "go", ROOT);
  assert.match(r.error ?? "", /node\.patch/);
});

test("the key file is read per call and errors name the path only", () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-key-"));
  try {
    const file = join(dir, "k");
    assert.throws(() => readKey(file), (e: Error) => e.message === `Claude Platform key file missing at ${file}`);
    writeFileSync(file, `${KEY}\n`);
    assert.equal(readKey(file), KEY);
    writeFileSync(file, "sk-ant-rotated\n");
    assert.equal(readKey(file), "sk-ant-rotated", "no caching: a rotated key is picked up");
    assert.throws(() => readGithubToken(join(dir, "none")), /GitHub read token file missing at .*none$/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("local claude children never get the Anthropic keys", () => {
  const env = childEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "x", ANTHROPIC_AUTH_TOKEN: "y", HOME: "/h" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/h" });
});

test("only bench-free nodes are cloud-eligible", () => {
  assert.ok(cloudEligible([{ tags: [] }, { tags: [] }]));
  for (const tag of ["hw", "phone", "human", "key:BASETEN_API_KEY"]) assert.ok(!cloudEligible([{ tags: [] }, { tags: [tag] }]), tag);
  assert.ok(!cloudEligible([]));
});
