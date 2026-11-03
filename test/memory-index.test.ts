// add-memory-engine 2.1 to 2.3: the index core on synthetic PROBE- units. Terms, BM25, filters (project
// isolation above all), add/replace/remove, vectors with bit-code prefilter, fusion on hand-built lists
// with a known expected order, neighbour expansion, confidence, and the snapshot codec.

import assert from "node:assert/strict";
import { test } from "node:test";
import { SNAPSHOT_FORMAT, SnapshotError, decodeShard, encodeShard } from "../src/index-snapshot.ts";
import { type Hit, MemoryIndex, type MemoryUnit, bitCode, shardOf } from "../src/memory-index.ts";
import { PEOPLE_BOOST, RRF_K, confident, expand, fuse, neighbourIds } from "../src/recall-fusion.ts";
import { fold, terms } from "../src/terms.ts";

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 3, 15);

const unit = (id: string, text: string, extra: Partial<MemoryUnit> = {}): MemoryUnit => ({ id, kind: "segment", at: T, text, ...extra });

function sample(): MemoryIndex {
  const idx = new MemoryIndex();
  idx.add(unit("s2026-11-02:1", "PROBE-Ana Ruiz: The marketing budget for the launch is 18,000 dollars.", { projectId: "orion", speakers: ["PROBE-Ana Ruiz"], at: T - DAY }));
  idx.add(unit("s2026-11-02:2", "PROBE-Tom Becker: Good, that covers the referral campaign too.", { projectId: "orion", speakers: ["PROBE-Tom Becker"], at: T - DAY + 30_000 }));
  idx.add(unit("s2026-11-03:1", "PROBE-Sofía: Decidimos abrir la beta el 20 de noviembre con 50 usuarios.", { projectId: "atlas", speakers: ["PROBE-Sofía Herrera"] }));
  idx.add(unit("s2026-11-03:2", "Revisemos el presupuesto del piloto antes de seguir.", { projectId: "atlas", at: T + 30_000 }));
  idx.add(unit("d2026-11-03:1", "Una pizarra con tres columnas: Ahora, Siguiente y Después.", { kind: "seen", at: T + 60_000 }));
  return idx;
}

test("terms: folded, without stopwords, plurals folded, thousands joined in both languages", () => {
  assert.deepEqual(terms("¿Qué dijo Ana sobre el PRESUPUESTO de marketing?"), ["ana", "presupuesto", "marketing"]);
  assert.deepEqual(terms("18,000 dollars"), terms("18.000 dollar"));
  assert.deepEqual(terms("las reuniones y los presupuestos"), ["reunion", "presupuesto"]);
  assert.equal(fold("Lucía Méndez"), "lucia mendez");
});

test("BM25 ranks the unit with the rarer, repeated terms first and reports how much of the query it covers", () => {
  const idx = sample();
  const hits = idx.lexical(terms("marketing budget 18000"));
  assert.equal(hits[0]!.unit.id, "s2026-11-02:1");
  assert.equal(hits[0]!.coverage, 1);
  assert.deepEqual(idx.lexical(terms("nada de esto existe")), []);
});

test("a project filter isolates: no unit from another project or without one comes back", () => {
  const idx = sample();
  const atlas = idx.lexical(terms("presupuesto budget marketing beta pizarra"), { projectId: "atlas" });
  assert.ok(atlas.length > 0);
  assert.ok(atlas.every((h) => h.unit.projectId === "atlas"));
  assert.deepEqual(idx.recent({ projectId: "orion" }).map((h) => h.unit.id).sort(), ["s2026-11-02:1", "s2026-11-02:2"]);
  assert.ok(idx.people([fold("Ana")], { projectId: "atlas" }).length === 0);
});

test("time, kind, person and validity filters", () => {
  const idx = sample();
  assert.deepEqual(idx.recent({ from: T - 1, to: T + DAY }).map((h) => h.unit.id), ["d2026-11-03:1", "s2026-11-03:2", "s2026-11-03:1"]);
  assert.deepEqual(idx.recent({ kinds: ["seen"] }).map((h) => h.unit.id), ["d2026-11-03:1"]);
  assert.deepEqual(idx.people([fold("sofia")]).map((h) => h.unit.id), ["s2026-11-03:1"]);
  idx.add(unit("cE1:1", "El lanzamiento es el 20.", { kind: "card", validFrom: T - 3 * DAY, validTo: T }));
  idx.add(unit("cE2:1", "El lanzamiento es el 27.", { kind: "card", validFrom: T }));
  assert.deepEqual(idx.lexical(terms("lanzamiento"), { validAt: T + 1 }).map((h) => h.unit.id), ["cE2:1"]);
  assert.deepEqual(idx.lexical(terms("lanzamiento"), { validAt: T - DAY }).map((h) => h.unit.id), ["cE1:1"]);
});

test("adding an id again replaces it; remove and removeWhere tombstone units in every list", () => {
  const idx = sample();
  idx.add(unit("s2026-11-03:2", "Ahora habla del cronograma.", { projectId: "atlas", at: T + 30_000 }));
  assert.equal(idx.lexical(terms("presupuesto piloto")).length, 0);
  assert.equal(idx.size, 5);
  assert.ok(idx.remove("s2026-11-02:1"));
  assert.ok(!idx.remove("s2026-11-02:1"));
  assert.equal(idx.lexical(terms("marketing budget")).length, 0);
  assert.deepEqual(idx.removeWhere((u) => u.id.startsWith("s2026-11-03")).sort(), ["s2026-11-03:1", "s2026-11-03:2"]);
  assert.deepEqual(idx.recent().map((h) => h.unit.id).sort(), ["d2026-11-03:1", "s2026-11-02:2"]);
});

test("units land in their month's shard", () => {
  const idx = new MemoryIndex();
  idx.add(unit("a", "uno", { at: Date.UTC(2026, 9, 31, 23) }));
  idx.add(unit("b", "dos", { at: Date.UTC(2026, 10, 1, 1) }));
  assert.deepEqual([...idx.shards.keys()].sort(), ["2026-10", "2026-11"]);
  assert.equal(shardOf(Date.UTC(2026, 10, 1)), "2026-11");
  assert.deepEqual(idx.recent({ from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 2) }).map((h) => h.unit.id), ["b"]);
});

test("vectors: the bit-code prefilter then int8 rescoring finds the nearest units; a wrong dimension is refused", () => {
  const dim = 16;
  const idx = new MemoryIndex(dim);
  const v = (...xs: number[]) => Int8Array.from({ length: dim }, (_, i) => xs[i % xs.length]!);
  idx.add(unit("near", "a"), v(100, 90, -80, 70));
  idx.add(unit("mid", "b"), v(100, -90, -80, 70));
  idx.add(unit("far", "c"), v(-100, -90, 80, -70));
  idx.add(unit("none", "d"));
  const hits = idx.vector(v(110, 80, -90, 60));
  assert.deepEqual(hits.map((h) => h.unit.id), ["near", "mid", "far"]);
  assert.ok(hits[0]!.score > 0.95);
  assert.throws(() => idx.add(unit("bad", "e"), new Int8Array(8)), /8 dimensions/);
  assert.equal(bitCode(Int8Array.from([1, -1, 0, 5, 0, 0, 0, 0, 9])).join(","), "9,1");
});

const hit = (id: string, extra: Partial<MemoryUnit> = {}, score = 1, coverage?: number): Hit => ({ unit: unit(id, id, extra), score, ...(coverage === undefined ? {} : { coverage }) });

test("fusion: reciprocal ranks add across lists; a unit in two lists beats a first place in one", () => {
  const fused = fuse(
    [
      { name: "lexical", hits: [hit("a"), hit("b"), hit("c")] },
      { name: "vector", hits: [hit("c"), hit("d")] },
    ],
    { now: T, timeNamed: true },
  );
  assert.deepEqual(fused.map((f) => f.unit.id), ["c", "a", "b", "d"]);
  assert.ok(Math.abs(fused[0]!.score - (1 / (RRF_K + 3) + 1 / (RRF_K + 1))) < 1e-12);
  assert.deepEqual(fused[0]!.lists, ["lexical", "vector"]);
});

test("fusion: a named person boosts units that name them; the recency prior favours newer units unless a time was named", () => {
  const lists = [{ name: "lexical" as const, hits: [hit("old", { at: T - 60 * DAY }), hit("ana", { at: T - 60 * DAY, speakers: ["PROBE-Ana Ruiz"] })] }];
  const boosted = fuse(lists, { now: T, timeNamed: true, people: ["ana"] });
  assert.deepEqual(boosted.map((f) => f.unit.id), ["ana", "old"]);
  assert.ok(Math.abs(boosted[0]!.score - PEOPLE_BOOST / (RRF_K + 2)) < 1e-12);
  const recency = [{ name: "lexical" as const, hits: [hit("older", { at: T - 90 * DAY }), hit("newer", { at: T })] }];
  assert.deepEqual(fuse(recency, { now: T }).map((f) => f.unit.id), ["newer", "older"]);
  assert.deepEqual(fuse(recency, { now: T, timeNamed: true }).map((f) => f.unit.id), ["older", "newer"]);
});

test("neighbour expansion keeps a quote's question and reply, without repeats and within the limit", () => {
  const idx = sample();
  idx.add(unit("s2026-11-02:3", "PROBE-Ana: and the rest goes to events.", { projectId: "orion", at: T - DAY + 60_000 }));
  assert.deepEqual(neighbourIds("s2026-11-02:2"), { before: "s2026-11-02:1", after: "s2026-11-02:3" });
  assert.deepEqual(neighbourIds("m20261102150000"), {});
  const fused = fuse([{ name: "lexical", hits: [hit("s2026-11-02:2"), hit("s2026-11-02:1")] }], { now: T });
  const out = expand(fused, (id) => idx.get(id), () => true, 10);
  assert.deepEqual(out.map((u) => u.id), ["s2026-11-02:1", "s2026-11-02:2", "s2026-11-02:3"]);
  assert.equal(expand(fused, (id) => idx.get(id), () => true, 2).length, 2);
  assert.deepEqual(expand(fused, (id) => idx.get(id), (u) => u.id !== "s2026-11-02:1", 10).map((u) => u.id), ["s2026-11-02:2", "s2026-11-02:3"]);
});

test("confidence: enough of the question's terms, a close vector, or a matched person or time", () => {
  const strong = [hit("a", {}, 3, 0.75)];
  const weak = [hit("a", {}, 3, 0.25)];
  const fused = fuse([{ name: "lexical", hits: strong }], { now: T });
  assert.equal(confident(strong, [], fused, { person: false, time: false }), true);
  assert.equal(confident(weak, [], fused, { person: false, time: false }), false);
  assert.equal(confident(weak, [hit("a", {}, 0.8)], fused, { person: false, time: false }), true);
  assert.equal(confident(weak, [], fused, { person: true, time: false }), true);
  assert.equal(confident([], [], [], { person: true, time: true }), false);
});

test("snapshot: a shard round-trips with its vectors, tombstones are compacted, and searches give the same answers", () => {
  const dim = 8;
  const idx = new MemoryIndex(dim);
  for (const [i, u] of [unit("s2026-11-03:1", "PROBE-Sofía: la beta abre el 20.", { projectId: "atlas", speakers: ["PROBE-Sofía"], refs: "m1:t1–t3" }), unit("cE:1", "El lanzamiento es el 27.", { kind: "card", validFrom: T, people: ["PROBE-Ana"] }), unit("gone", "borrar esto")].entries()) {
    idx.add(u, Int8Array.from({ length: dim }, (_, j) => (j === i ? 120 : -10)));
  }
  idx.add(unit("novec", "sin vector todavía beta", { to: T + 5000 }));
  idx.remove("gone");
  const shard = idx.shards.get("2026-11")!;
  const bytes = encodeShard(shard, { encoder: "probe-encoder", builtThrough: T + 1 });
  const { shard: back, meta } = decodeShard(bytes);
  assert.deepEqual(meta, { shard: "2026-11", encoder: "probe-encoder", dim, builtThrough: T + 1 });
  assert.equal(back.size, 3);
  assert.equal(back.units.length, 3, "the tombstone is not written");
  const again = new MemoryIndex(dim);
  again.shards.set(back.key, back);
  assert.deepEqual(again.lexical(terms("beta")).map((h) => [h.unit.id, h.score.toFixed(6)]), idx.lexical(terms("beta")).map((h) => [h.unit.id, h.score.toFixed(6)]));
  const q = Int8Array.from({ length: dim }, (_, j) => (j === 1 ? 100 : -5));
  assert.deepEqual(again.vector(q).map((h) => h.unit.id), idx.vector(q).map((h) => h.unit.id));
  assert.deepEqual(again.get("s2026-11-03:1"), idx.get("s2026-11-03:1"));
  assert.deepEqual(again.get("novec"), idx.get("novec"));
  // It keeps working after a restore: add and remove.
  again.add(unit("s2026-11-03:9", "otra beta"));
  assert.equal(again.lexical(terms("beta")).length, 3);
});

test("snapshot: corrupt, truncated, foreign or newer-format bytes are refused, so the caller rebuilds", () => {
  const idx = sample();
  const bytes = encodeShard(idx.shards.get("2026-11")!, { encoder: "lexical", builtThrough: T });
  const flipped = bytes.slice();
  flipped[40] = flipped[40]! ^ 0xff;
  assert.throws(() => decodeShard(flipped), SnapshotError);
  assert.throws(() => decodeShard(bytes.subarray(0, bytes.length - 7)), SnapshotError);
  assert.throws(() => decodeShard(new TextEncoder().encode("hello world, not a snapshot")), /not a memory snapshot/);
  const newer = bytes.slice();
  new DataView(newer.buffer).setUint16(4, SNAPSHOT_FORMAT + 1, true);
  assert.throws(() => decodeShard(newer), /format 2/);
});
