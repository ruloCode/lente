import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { type CanaryStore, KekCheckError, checkKekAtStart, keksFromEnv } from "../src/kek-check.ts";
import { parseKek } from "../src/seal.ts";

const b64 = () => randomBytes(32).toString("base64");
const memoryStore = (): CanaryStore & { rows: Map<number, Buffer> } => {
  const rows = new Map<number, Buffer>();
  return { rows, read: async (v) => rows.get(v), write: async (v, s) => void rows.set(v, s) };
};

test("setup seals a canary; the same KEK opens it on every later start", async () => {
  const key = b64();
  const store = memoryStore();
  assert.deepEqual(await checkKekAtStart([parseKek(key, 1)], store), { 1: "created" });
  assert.equal(store.rows.size, 1);
  assert.ok(!store.rows.get(1)!.includes(Buffer.from(key, "base64")));
  assert.deepEqual(await checkKekAtStart([parseKek(key, 1)], store), { 1: "ok" });
});

test("a different KEK refuses to start, naming the canary check and no key", async () => {
  const store = memoryStore();
  await checkKekAtStart([parseKek(b64(), 1)], store);
  const wrong = b64();
  await assert.rejects(checkKekAtStart([parseKek(wrong, 1)], store), (e: Error) => e instanceof KekCheckError && /canary check failed for version 1/.test(e.message) && !e.message.includes(wrong));
  assert.equal(store.rows.size, 1);
});

test("a tampered canary refuses to start", async () => {
  const kek = parseKek(b64(), 1);
  const store = memoryStore();
  await checkKekAtStart([kek], store);
  store.rows.get(1)![5] ^= 1;
  await assert.rejects(checkKekAtStart([kek], store), /canary check failed/);
});

test("during rotation both versions are checked; a previous KEK with no canary is refused", async () => {
  const k1 = parseKek(b64(), 1);
  const k2 = parseKek(b64(), 2);
  const store = memoryStore();
  await checkKekAtStart([k1], store);
  assert.deepEqual(await checkKekAtStart([k2, k1], store), { 2: "created", 1: "ok" });
  await assert.rejects(checkKekAtStart([k2, parseKek(b64(), 1)], store), /version 1/);
  await assert.rejects(checkKekAtStart([parseKek(b64(), 3), parseKek(b64(), 2)], memoryStore()), /no canary for the previous KEK version 2/);
});

test("keksFromEnv: current first, previous one version lower, and clear errors", () => {
  assert.throws(() => keksFromEnv({}), /LENTE_KEK is not set/);
  assert.deepEqual(keksFromEnv({ LENTE_KEK: b64() }).map((k) => k.version), [1]);
  assert.deepEqual(keksFromEnv({ LENTE_KEK: b64(), LENTE_KEK_VERSION: "3", LENTE_KEK_PREVIOUS: b64() }).map((k) => k.version), [3, 2]);
  assert.throws(() => keksFromEnv({ LENTE_KEK: b64(), LENTE_KEK_PREVIOUS: b64() }), /must be version 2 or later/);
});
