import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { Query, RETRY_DELAYS_MS, SupabaseError, SupabaseRest, fromBytea, toBytea } from "../src/supabase-rest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const SECRET = "sb_secret_test_only";

type Call = { method: string; url: URL; headers: Record<string, string>; body?: unknown };

function fakeRest(answers: { status: number; body?: unknown }[] = []) {
  const calls: Call[] = [];
  const slept: number[] = [];
  const rest = new SupabaseRest({
    url: "https://ref.supabase.co/",
    secretKey: SECRET,
    sleep: async (ms) => void slept.push(ms),
    fetch: async (url, init) => {
      calls.push({ method: init.method, url: new URL(url), headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
      const a = answers.shift() ?? { status: 200, body: [] };
      return { status: a.status, ok: a.status < 300, text: async () => (a.body === undefined ? "" : JSON.stringify(a.body)) };
    },
  });
  return { rest, calls, slept };
}

test("a user's select carries user_id=eq.<id>, the secret key in apikey, and the filters and order asked", async () => {
  const { rest, calls } = fakeRest([{ status: 200, body: [{ id: "x" }] }]);
  const db = rest.forUser(ALICE);
  const rows = await db.select(db.query("meetings").gte("started_at", "2026-08-01T00:00:00Z").order("started_at", "desc").limit(20), "id,started_at");
  assert.deepEqual(rows, [{ id: "x" }]);
  const { url, headers, method } = calls[0]!;
  assert.equal(method, "GET");
  assert.equal(url.pathname, "/rest/v1/meetings");
  assert.equal(url.searchParams.get("user_id"), `eq.${ALICE}`);
  assert.equal(url.searchParams.get("started_at"), "gte.2026-08-01T00:00:00Z");
  assert.equal(url.searchParams.get("order"), "started_at.desc");
  assert.equal(url.searchParams.get("select"), "id,started_at");
  assert.equal(headers.apikey, SECRET);
  assert.equal(headers.Authorization, undefined);
});

test("no user, a non-uuid user, or a filter on user_id cannot build a query", () => {
  const { rest } = fakeRest();
  assert.throws(() => rest.forUser("").query("facts"), /needs a user id/);
  assert.throws(() => rest.forUser("local-owner").query("facts"), /needs a user id/);
  assert.throws(() => rest.forUser(ALICE).query("facts").eq("user_id", BOB), /set by the scope/);
  assert.throws(() => rest.forUser(ALICE).query("facts; drop table x"), /not an identifier/);
  assert.throws(() => rest.forUser(ALICE).query("facts").eq("id) or (1=1", "x"), /not an identifier/);
});

test("insert stamps the user's id on every row and refuses a row for another user", async () => {
  const { rest, calls } = fakeRest();
  const db = rest.forUser(ALICE);
  await db.insert("facts", [{ id: "f1", text_enc: toBytea(Buffer.from([1, 2])) }]);
  assert.deepEqual(calls[0]!.body, [{ id: "f1", text_enc: "\\x0102", user_id: ALICE }]);
  assert.equal(calls[0]!.headers.Prefer, "return=minimal");
  assert.throws(() => db.insert("facts", [{ id: "f2", user_id: BOB }]), /another user's id/);
  await db.insert("usage_daily", [{ day: "2026-11-01" }], { upsertOn: "user_id,day,provider,model" });
  assert.equal(calls[1]!.url.searchParams.get("on_conflict"), "user_id,day,provider,model");
  assert.match(calls[1]!.headers.Prefer!, /resolution=merge-duplicates/);
});

test("update and delete are scoped to the user; update cannot move a row to another user", async () => {
  const { rest, calls } = fakeRest();
  const db = rest.forUser(ALICE);
  await db.update(db.query("tasks").eq("id", "t1"), { done_at: "2026-11-01T10:00:00Z" });
  await db.remove(db.query("meetings").eq("id", "m1"));
  for (const c of calls) assert.equal(c.url.searchParams.get("user_id"), `eq.${ALICE}`);
  assert.deepEqual(calls.map((c) => c.method), ["PATCH", "DELETE"]);
  assert.throws(() => db.update(db.query("tasks"), { user_id: BOB }), /may not change user_id/);
});

test("rpc calls carry the user as p_user_id", async () => {
  const { rest, calls } = fakeRest([{ status: 200, body: { ok: true } }]);
  assert.deepEqual(await rest.forUser(ALICE).rpc("close_meeting", { p_meeting: "m1" }), { ok: true });
  assert.equal(calls[0]!.url.pathname, "/rest/v1/rpc/close_meeting");
  assert.deepEqual(calls[0]!.body, { p_meeting: "m1", p_user_id: ALICE });
});

test("in() quotes strings, so a value cannot add a filter", async () => {
  const { rest, calls } = fakeRest();
  const db = rest.forUser(ALICE);
  await db.select(db.query("meetings").in("id", ['a",b', "c"]));
  assert.equal(calls[0]!.url.searchParams.get("id"), 'in.("a\\",b","c")');
  assert.deepEqual(calls[0]!.url.searchParams.getAll("user_id"), [`eq.${ALICE}`]);
});

test("429 and 5xx are retried with backoff, then fail naming the table and status, without row content", async () => {
  const { rest, slept } = fakeRest([{ status: 503 }, { status: 429 }, { status: 200, body: [] }]);
  const db = rest.forUser(ALICE);
  assert.deepEqual(await db.select(db.query("facts")), []);
  assert.deepEqual(slept, RETRY_DELAYS_MS);

  const failing = fakeRest([{ status: 500 }, { status: 502 }, { status: 503, body: { code: "PGRST000", message: "x", details: "Failing row contains (secret words)" } }]);
  const fdb = failing.rest.forUser(ALICE);
  await assert.rejects(fdb.select(fdb.query("facts")), (e: Error) => e instanceof SupabaseError && e.message === "supabase facts: 503 PGRST000 failed after retries" && !e.message.includes("secret words"));
  assert.equal(failing.calls.length, 3);
});

test("4xx is not retried; a unique violation keeps only its code", async () => {
  const { rest, calls } = fakeRest([{ status: 409, body: { code: "23505", message: "duplicate key", details: "Key (token_hash)=(\\xabc) already exists." } }]);
  await assert.rejects(rest.forUser(ALICE).insert("devices", [{ id: "d" }]), (e: Error) => e instanceof SupabaseError && e.status === 409 && e.code === "23505" && !e.message.includes("abc"));
  assert.equal(calls.length, 1);
  const refused = fakeRest([{ status: 401, body: {} }]);
  await assert.rejects(refused.rest.system.ping(), /accounts: 401 refused the secret key/);
});

test("a network failure is retried, then reported as unreachable", async () => {
  let n = 0;
  const rest = new SupabaseRest({ url: "https://ref.supabase.co", secretKey: SECRET, sleep: async () => {}, fetch: async () => { n++; throw new TypeError("fetch failed"); } });
  const db = rest.forUser(ALICE);
  await assert.rejects(db.select(db.query("facts")), /facts: 0 unreachable: TypeError/);
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(rest.system.ping(), /accounts: 0 unreachable/);
  assert.equal(n, 1, "the health ping does not retry");
});

test("the cross-user lookups are the named ones only, by hash or version", async () => {
  const { rest, calls } = fakeRest([{ status: 200, body: [] }, { status: 200, body: [] }]);
  await rest.system.deviceByTokenHash(Buffer.from("ab", "hex"));
  await rest.system.canary(1);
  assert.equal(calls[0]!.url.searchParams.get("token_hash"), "eq.\\xab");
  assert.equal(calls[0]!.url.searchParams.get("user_id"), null);
  assert.equal(calls[1]!.url.searchParams.get("kek_version"), "eq.1");
});

test("bytea round-trips as \\x hex", () => {
  const bytes = Buffer.from([0, 1, 254, 255]);
  assert.equal(toBytea(bytes), "\\x0001feff");
  assert.deepEqual(fromBytea(toBytea(bytes)), bytes);
  assert.throws(() => fromBytea("0001"), /bytea/);
});

test("no module outside the client builds a query without a user: Query and system scopes live only in src/supabase-rest.ts", () => {
  const dir = new URL("../src/", import.meta.url);
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "supabase-rest.ts")
    .filter((f) => /new Query\(|system:\s*true|\/rest\/v1\//.test(readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(offenders, []);
  assert.ok(new Query("facts", { userId: ALICE }).search().startsWith(`user_id=eq.${ALICE}`));
});
