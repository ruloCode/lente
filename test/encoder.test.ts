// add-memory-engine 8.3: the encoder interface with fake encoders. Quantizing keeps direction; the hub
// encoder adds the query/passage prefix and loads its runtime only when used (a missing one says what
// failed); the Modal encoder sends texts and kind, checks the shape it gets back and never puts a
// response body in an error. Synthetic text, no network.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HubEncoder, ModalEncoder, quantize } from "../src/encoder.ts";

test("quantize: the largest component becomes ±127 and the direction is kept", () => {
  assert.deepEqual([...quantize([0.1, -0.2, 0.05, 0])], [64, -127, 32, 0]);
  assert.deepEqual([...quantize([0, 0])], [0, 0]);
});

test("the hub encoder prefixes query and passage, quantizes, and loads its runtime lazily", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-fake-transformers-"));
  const mod = join(dir, "fake.mjs");
  writeFileSync(mod, `export const seen = []; export async function pipeline(task, model) { seen.push(task + " " + model); return async (texts) => { seen.push(...texts); return { tolist: () => texts.map((t) => Array.from({ length: 384 }, (_, i) => (i === t.length % 384 ? 1 : 0.01))) }; }; }`);
  const enc = new HubEncoder(mod);
  const [q] = await enc.embed(["¿Cuánta plata hay?"], "query");
  assert.equal(q!.length, 384);
  assert.equal(Math.max(...q!), 127);
  await enc.embed(["PROBE línea"], "passage");
  const { seen } = (await import(mod)) as { seen: string[] };
  assert.deepEqual(seen, ["feature-extraction Xenova/multilingual-e5-small", "query: ¿Cuánta plata hay?", "passage: PROBE línea"]);
  assert.deepEqual(await enc.embed([], "query"), []);
  await assert.rejects(new HubEncoder(join(dir, "missing.mjs")).embed(["x"], "query"), /the hub encoder needs .*missing\.mjs, which did not load/);
});

test("the Modal encoder: texts and kind out with the token, vectors of the right size back, errors without bodies", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  let next = reply(200, { vectors: [[0.5, -0.25, 0, 0], [0, 0, 1, 0]] });
  const fetcher = (async (url: string, init: RequestInit) => (calls.push({ url, init }), next)) as unknown as typeof fetch;
  const enc = new ModalEncoder({ url: "https://probe.example/embed", token: "probe-token", id: "probe-c", dim: 4, fetcher });
  const out = await enc.embed(["uno", "dos"], "passage");
  assert.deepEqual(out.map((v) => [...v]), [[127, -63, 0, 0], [0, 0, 127, 0]]);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { texts: ["uno", "dos"], kind: "passage" });
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer probe-token");
  next = reply(500, { detail: "PROBE-secreto en el cuerpo" });
  await assert.rejects(enc.embed(["x"], "query"), (e: Error) => e.message === "the Modal encoder answered 500");
  next = reply(200, { vectors: [[1, 2, 3]] });
  await assert.rejects(enc.embed(["x"], "query"), /vector 0 has 3 dimensions, not 4/);
  next = reply(200, { vectors: [] });
  await assert.rejects(enc.embed(["x"], "query"), /returned 0 vectors for 1 texts/);
});
