import assert from "node:assert/strict";
import { test } from "node:test";
import { DB_CHECK_TTL_MS, DatabaseHealth, dbFailing, dbStateOf } from "../src/db-health.ts";
import { SupabaseError, SupabaseRest } from "../src/supabase-rest.ts";

const restAnswering = (status: number) =>
  new SupabaseRest({ url: "https://ref.supabase.co", secretKey: "sb_secret_test", sleep: async () => {}, fetch: async () => ({ status, ok: status < 300, text: async () => (status < 300 ? "[]" : '{"code":"x"}') }) });

test("a quick answer is ok, a slow one is slow, and the time is reported", async () => {
  let t = 0;
  const quick = new DatabaseHealth(async () => void (t += 40), () => t);
  assert.deepEqual(await quick.check(), { state: "ok", ms: 40, at: 40 });
  let u = 0;
  const slow = new DatabaseHealth(async () => void (u += 1500), () => u);
  assert.equal((await slow.check()).state, "slow");
});

test("a ping that never answers is unreachable after the timeout", async () => {
  const hung = new DatabaseHealth(() => new Promise(() => {}), Date.now, 30);
  const result = await hung.check();
  assert.equal(result.state, "unreachable");
  assert.equal(result.ms, undefined);
});

test("503 (and 540) read as paused through the real client; 401 as refused; network failure as unreachable", async () => {
  assert.equal((await new DatabaseHealth(() => restAnswering(503).system.ping()).check()).state, "paused");
  assert.equal((await new DatabaseHealth(() => restAnswering(540).system.ping()).check()).state, "paused");
  assert.equal((await new DatabaseHealth(() => restAnswering(401).system.ping()).check()).state, "refused");
  const down = new SupabaseRest({ url: "https://ref.supabase.co", secretKey: "k", fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.equal((await new DatabaseHealth(() => down.system.ping()).check()).state, "unreachable");
  assert.equal(dbStateOf(new SupabaseError("accounts", 500, undefined, "x")), "unreachable");
});

test("results are reused within the TTL, and concurrent checks share one ping", async () => {
  let pings = 0;
  let now = 0;
  const h = new DatabaseHealth(async () => void pings++, () => now);
  await Promise.all([h.check(), h.check(), h.check()]);
  assert.equal(pings, 1);
  now += DB_CHECK_TTL_MS - 1;
  await h.check();
  assert.equal(pings, 1);
  now += 1;
  await h.check();
  assert.equal(pings, 2);
  assert.equal(h.peek()?.state, "ok");
});

test("only paused, unreachable and refused count as failing", () => {
  assert.deepEqual((["ok", "slow", "paused", "unreachable", "refused"] as const).map(dbFailing), [false, false, true, true, true]);
});
