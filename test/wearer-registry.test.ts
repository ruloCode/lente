import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_IDLE_MS, WearerRegistry } from "../src/wearer-registry.ts";

function fake(userId: string, log: string[]) {
  let busy = false;
  return { userId, setBusy: (b: boolean) => (busy = b), busy: () => busy, close: async () => void log.push(`close ${userId}`) };
}

test("a runtime is created on first use and reused after", () => {
  const made: string[] = [];
  const reg = new WearerRegistry((id) => (made.push(id), fake(id, [])));
  assert.equal(reg.get("a"), reg.get("a"));
  reg.get("b");
  assert.deepEqual(made, ["a", "b"]);
  assert.equal(reg.size, 2);
});

test("an idle runtime is evicted after 30 minutes, closed first, then its key forgotten", async () => {
  let now = 0;
  const log: string[] = [];
  const reg = new WearerRegistry((id) => fake(id, log), { now: () => now, onEvict: (id) => log.push(`forget ${id}`) });
  reg.get("a");
  assert.deepEqual(await reg.evictIdle(), []);
  now += RUNTIME_IDLE_MS - 1;
  assert.deepEqual(await reg.evictIdle(), []);
  now += 1;
  assert.deepEqual(await reg.evictIdle(), ["a"]);
  assert.deepEqual(log, ["close a", "forget a"]);
  assert.equal(reg.has("a"), false);
});

test("a busy runtime is never evicted, and its idle clock restarts when it stops being busy", async () => {
  let now = 0;
  const reg = new WearerRegistry((id) => fake(id, []), { now: () => now });
  const a = reg.get("a");
  await reg.evictIdle();
  a.setBusy(true);
  now += RUNTIME_IDLE_MS * 2;
  assert.deepEqual(await reg.evictIdle(), []);
  a.setBusy(false);
  assert.deepEqual(await reg.evictIdle(), []);
  now += RUNTIME_IDLE_MS;
  assert.deepEqual(await reg.evictIdle(), ["a"]);
});

test("using a runtime resets its idle clock; the pinned owner is never evicted", async () => {
  let now = 0;
  const reg = new WearerRegistry((id) => fake(id, []), { now: () => now, pinned: ["owner"] });
  reg.get("owner");
  reg.get("a");
  await reg.evictIdle();
  now += RUNTIME_IDLE_MS - 10;
  reg.get("a");
  await reg.evictIdle();
  now += RUNTIME_IDLE_MS - 10;
  assert.deepEqual(await reg.evictIdle(), []);
  now += RUNTIME_IDLE_MS * 5;
  assert.deepEqual(await reg.evictIdle(), ["a"]);
  assert.ok(reg.has("owner"));
});
