// The wearer's memory index (add-memory-engine decisions 2 and 3): units of memory (segments of speech,
// camera descriptions, meeting notes, cards, facts, digests) in month shards, ranked by BM25 over
// folded terms and, when a unit carries one, by an int8 vector with a 1-bit code for a brute-force
// prefilter. Hard filters (project, time, validity, kind) apply before ranking. Pure: no I/O, no
// clock; the runtime feeds it what it already decrypted and persists shards as sealed snapshots.

import { fold, terms } from "./terms.ts";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
/** Units the bit-code prefilter keeps for exact int8 rescoring. */
export const VECTOR_PREFILTER = 200;

export type UnitKind = "segment" | "seen" | "notes" | "card" | "fact" | "digest" | "practice";

export interface MemoryUnit {
  /** An id today's chips understand: `s<day>:<n>`, `d<day>:<n>`, `m…`, `c<episode>:<n>`, `F<id>`, `day:…`. */
  id: string;
  kind: UnitKind;
  /** Start and end, ms since the epoch. */
  at: number;
  to?: number;
  projectId?: string;
  speakers?: string[];
  /** People the unit names (cards, notes). */
  people?: string[];
  /** For card facts: when the fact became true and when a later fact closed it. */
  validFrom?: number;
  validTo?: number;
  /** For a segment: the meeting or episode and turn ids it covers (`m…:t5–t9`). */
  refs?: string;
  /** The meeting's title, for labels and prompt lines. */
  title?: string;
  text: string;
}

export interface IndexFilter {
  projectId?: string;
  /** [from, to): a unit matches when its span overlaps it. */
  from?: number;
  to?: number;
  /** Facts closed at or before this instant (or not yet true) are hidden: "now" questions. */
  validAt?: number;
  kinds?: readonly UnitKind[];
  /** Folded names; a unit matches when one of its speakers or people contains one of them. */
  people?: readonly string[];
}

export interface Hit {
  unit: MemoryUnit;
  score: number;
  /** Lexical hits: the share of distinct query terms the unit contains (0–1). */
  coverage?: number;
}

const MONTH_KEY = /^\d{4}-\d{2}$/;
export const isMonthShard = (key: string): boolean => MONTH_KEY.test(key);

/** `YYYY-MM` in UTC: the shard a unit lives in. */
export const shardOf = (at: number): string => new Date(at).toISOString().slice(0, 7);

/** Bytes of the 1-bit code for a vector of `dim` int8 values. */
export const codeBytes = (dim: number): number => Math.ceil(dim / 8);

/** The sign bits of an int8 vector, packed. */
export function bitCode(vector: Int8Array): Uint8Array {
  const code = new Uint8Array(codeBytes(vector.length));
  for (let i = 0; i < vector.length; i++) if (vector[i]! > 0) code[i >> 3]! |= 1 << (i & 7);
  return code;
}

const POPCOUNT = Uint8Array.from({ length: 256 }, (_, i) => {
  let n = 0;
  for (let v = i; v; v >>= 1) n += v & 1;
  return n;
});

export interface Posting {
  docs: number[];
  tfs: number[];
}

/** One month of units with its postings and vectors. Documents are slots; removed ones are tombstoned. */
export class Shard {
  readonly key: string;
  readonly units: (MemoryUnit | undefined)[] = [];
  readonly lengths: number[] = [];
  readonly postings = new Map<string, Posting>();
  /** Live documents per term, kept as units come and go. */
  private readonly dfs = new Map<string, number>();
  /** Folded speakers and people per slot, for the people list and filter. */
  readonly names: string[][] = [];
  vectors: Int8Array;
  codes: Uint8Array;
  readonly hasVector: boolean[] = [];
  private readonly slotOf = new Map<string, number>();
  /** What the shard was built from (meeting id → change signature), so a runtime opening a snapshot replays only what changed. */
  readonly sources = new Map<string, string>();
  /** Changed since it was last written to a snapshot. */
  dirty = false;
  private live = 0;
  private totalLength = 0;
  readonly dim: number;

  constructor(key: string, dim = 0) {
    this.key = key;
    this.dim = dim;
    this.vectors = new Int8Array(0);
    this.codes = new Uint8Array(0);
  }

  /** A shard from its stored parts (the snapshot codec): slots are dense, postings already built. */
  static restore(key: string, dim: number, parts: { units: MemoryUnit[]; lengths: number[]; postings: Map<string, Posting>; vectors?: Int8Array; hasVector: boolean[]; sources?: Map<string, string> }): Shard {
    const s = new Shard(key, dim);
    for (const [k, v] of parts.sources ?? []) s.sources.set(k, v);
    for (const [slot, u] of parts.units.entries()) {
      s.units.push(u);
      s.lengths.push(parts.lengths[slot]!);
      s.names.push([...(u.speakers ?? []), ...(u.people ?? [])].map(fold));
      s.slotOf.set(u.id, slot);
      s.hasVector.push(parts.hasVector[slot]!);
      s.totalLength += parts.lengths[slot]!;
    }
    s.live = parts.units.length;
    for (const [t, p] of parts.postings) (s.postings.set(t, p), s.dfs.set(t, p.docs.length));
    if (dim && parts.vectors) {
      s.vectors = parts.vectors;
      const cb = codeBytes(dim);
      s.codes = new Uint8Array(parts.units.length * cb);
      for (let i = 0; i < parts.units.length; i++) if (s.hasVector[i]) s.codes.set(bitCode(parts.vectors.subarray(i * dim, (i + 1) * dim)), i * cb);
    }
    return s;
  }

  get size(): number {
    return this.live;
  }
  get avgLength(): number {
    return this.live ? this.totalLength / this.live : 0;
  }
  has(id: string): boolean {
    return this.slotOf.has(id);
  }
  slot(id: string): number | undefined {
    return this.slotOf.get(id);
  }

  /** Adds or replaces a unit; `vector` must have the shard's dimension. */
  add(unit: MemoryUnit, vector?: Int8Array): void {
    if (this.slotOf.has(unit.id)) this.remove(unit.id);
    this.dirty = true;
    const slot = this.units.length;
    const counts = new Map<string, number>();
    const words = terms(unit.text);
    for (const t of words) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, tf] of counts) {
      let p = this.postings.get(t);
      if (!p) this.postings.set(t, (p = { docs: [], tfs: [] }));
      p.docs.push(slot);
      p.tfs.push(tf);
      this.dfs.set(t, (this.dfs.get(t) ?? 0) + 1);
    }
    this.units.push(unit);
    this.lengths.push(words.length);
    this.names.push([...(unit.speakers ?? []), ...(unit.people ?? [])].map(fold));
    this.slotOf.set(unit.id, slot);
    this.live++;
    this.totalLength += words.length;
    this.hasVector.push(false);
    if (vector) this.setVector(slot, vector);
  }

  /** Attaches a vector to a unit already in the shard (embeddings arrive in batches). */
  setVector(slot: number, vector: Int8Array): void {
    if (vector.length !== this.dim) throw new Error(`memory index: vector has ${vector.length} dimensions, shard ${this.key} uses ${this.dim}`);
    const cb = codeBytes(this.dim);
    if (this.vectors.length < (slot + 1) * this.dim) {
      const capacity = Math.max(slot + 1, this.units.length, Math.ceil((this.vectors.length / Math.max(this.dim, 1)) * 1.5) + 64);
      const grown = new Int8Array(capacity * this.dim);
      grown.set(this.vectors);
      this.vectors = grown;
      const codes = new Uint8Array(capacity * cb);
      codes.set(this.codes);
      this.codes = codes;
    }
    this.vectors.set(vector, slot * this.dim);
    this.codes.set(bitCode(vector), slot * cb);
    this.hasVector[slot] = true;
    this.dirty = true;
  }

  /** Tombstones a unit; its postings are skipped and dropped at the next snapshot. */
  remove(id: string): boolean {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return false;
    this.dirty = true;
    this.slotOf.delete(id);
    for (const t of new Set(terms(this.units[slot]!.text))) this.dfs.set(t, (this.dfs.get(t) ?? 1) - 1);
    this.units[slot] = undefined;
    this.hasVector[slot] = false;
    this.live--;
    this.totalLength -= this.lengths[slot]!;
    return true;
  }

  /** Live units, in slot order. */
  *liveUnits(): Generator<[number, MemoryUnit]> {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u) yield [i, u];
    }
  }

  /** Document frequency of a term among live units. */
  df(term: string): number {
    return this.dfs.get(term) ?? 0;
  }
}

export function matches(unit: MemoryUnit, names: readonly string[], f: IndexFilter): boolean {
  if (f.projectId !== undefined && unit.projectId !== f.projectId) return false;
  if (f.kinds && !f.kinds.includes(unit.kind)) return false;
  const end = unit.to ?? unit.at;
  if (f.from !== undefined && end < f.from) return false;
  if (f.to !== undefined && unit.at >= f.to) return false;
  if (f.validAt !== undefined && ((unit.validTo !== undefined && unit.validTo <= f.validAt) || (unit.validFrom !== undefined && unit.validFrom > f.validAt))) return false;
  if (f.people?.length && !f.people.some((p) => names.some((n) => n.includes(p)))) return false;
  return true;
}

/** All of a wearer's shards. The runtime decides which are loaded; this searches what it holds. */
export class MemoryIndex {
  readonly shards = new Map<string, Shard>();
  readonly dim: number;

  constructor(dim = 0) {
    this.dim = dim;
  }

  get size(): number {
    let n = 0;
    for (const s of this.shards.values()) n += s.size;
    return n;
  }

  shard(key: string): Shard {
    let s = this.shards.get(key);
    if (!s) this.shards.set(key, (s = new Shard(key, this.dim)));
    return s;
  }

  /** Adds a unit to its month's shard, or to `shardKey` (the runtime pins facts and digests to a shard of their own). */
  add(unit: MemoryUnit, vector?: Int8Array, shardKey = shardOf(unit.at)): void {
    // A unit that moved months (an edited time) leaves its old shard.
    for (const s of this.shards.values()) if (s.key !== shardKey && s.has(unit.id)) s.remove(unit.id);
    this.shard(shardKey).add(unit, vector);
  }

  remove(id: string): boolean {
    let removed = false;
    for (const s of this.shards.values()) removed = s.remove(id) || removed;
    return removed;
  }

  /** Removes every unit the predicate picks (forget a day, delete a meeting); returns their ids. */
  removeWhere(pick: (u: MemoryUnit) => boolean): string[] {
    const gone: string[] = [];
    for (const s of this.shards.values()) for (const [, u] of s.liveUnits()) if (pick(u)) (s.remove(u.id), gone.push(u.id));
    return gone;
  }

  get(id: string): MemoryUnit | undefined {
    for (const s of this.shards.values()) {
      const slot = s.slot(id);
      if (slot !== undefined) return s.units[slot];
    }
    return undefined;
  }

  /** A unit's vector (a copy), if it has one. */
  vectorOf(id: string): Int8Array | undefined {
    for (const s of this.shards.values()) {
      const slot = s.slot(id);
      if (slot !== undefined) return s.hasVector[slot] ? s.vectors.slice(slot * s.dim, (slot + 1) * s.dim) : undefined;
    }
    return undefined;
  }

  setVector(id: string, vector: Int8Array): boolean {
    for (const s of this.shards.values()) {
      const slot = s.slot(id);
      if (slot !== undefined) return (s.setVector(slot, vector), true);
    }
    return false;
  }

  /** Shards whose month can overlap [from, to); a unit can end a month after it starts, so the low side keeps one month of margin. */
  private inRange(f: IndexFilter): Shard[] {
    const lo = f.from === undefined ? "" : shardOf(f.from - 31 * 86_400_000);
    const hi = f.to === undefined ? "\uffff" : shardOf(f.to - 1);
    // A shard that is not a month (pinned facts and digests) is always searched; the filter still applies to its units.
    return [...this.shards.values()].filter((s) => !MONTH_KEY.test(s.key) || (s.key >= lo && s.key <= hi));
  }

  /** BM25 over the query's terms (already through `terms`), filtered, best first. */
  lexical(queryTerms: readonly string[], filter: IndexFilter = {}, limit = 50): Hit[] {
    const distinct = [...new Set(queryTerms)];
    if (!distinct.length) return [];
    const shards = this.inRange(filter);
    let n = 0;
    let lengthSum = 0;
    for (const s of shards) (n += s.size, (lengthSum += s.avgLength * s.size));
    if (!n) return [];
    const avg = lengthSum / n;
    const idf = new Map(distinct.map((t) => {
      const df = shards.reduce((sum, s) => sum + s.df(t), 0);
      return [t, Math.log(1 + (n - df + 0.5) / (df + 0.5))];
    }));
    const best = new TopK(limit);
    for (const s of shards) {
      const score = new Float64Array(s.units.length);
      const seen = new Uint8Array(s.units.length);
      const touched: number[] = [];
      for (const t of distinct) {
        const p = s.postings.get(t);
        if (!p) continue;
        const w = idf.get(t)!;
        const docs = p.docs;
        const tfs = p.tfs;
        for (let i = 0; i < docs.length; i++) {
          const d = docs[i]!;
          if (!s.units[d]) continue;
          const tf = tfs[i]!;
          if (seen[d] === 0) touched.push(d);
          seen[d]!++;
          score[d]! += (w * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * s.lengths[d]!) / (avg || 1)));
        }
      }
      for (const d of touched) {
        if (!best.wouldKeep(score[d]!)) continue;
        const unit = s.units[d]!;
        if (!matches(unit, s.names[d]!, filter)) continue;
        best.push({ unit, score: score[d]!, coverage: seen[d]! / distinct.length });
      }
    }
    return best.sorted();
  }

  /** Nearest units by vector: Hamming distance on the bit codes keeps `VECTOR_PREFILTER`, then exact int8 dot products. */
  vector(query: Int8Array, filter: IndexFilter = {}, limit = 50): Hit[] {
    if (!this.dim || query.length !== this.dim) return [];
    const qCode = bitCode(query);
    const cb = codeBytes(this.dim);
    const near: { s: Shard; d: number; dist: number }[] = [];
    let worst = Infinity;
    for (const s of this.inRange(filter)) {
      for (let d = 0; d < s.units.length; d++) {
        if (!s.hasVector[d] || !s.units[d]) continue;
        let dist = 0;
        const off = d * cb;
        for (let i = 0; i < cb; i++) dist += POPCOUNT[s.codes[off + i]! ^ qCode[i]!]!;
        if (near.length >= VECTOR_PREFILTER && dist >= worst) continue;
        if (!matches(s.units[d]!, s.names[d]!, filter)) continue;
        near.push({ s, d, dist });
        if (near.length >= VECTOR_PREFILTER * 2) {
          near.sort((a, b) => a.dist - b.dist);
          near.length = VECTOR_PREFILTER;
          worst = near.at(-1)!.dist;
        }
      }
    }
    near.sort((a, b) => a.dist - b.dist);
    near.length = Math.min(near.length, VECTOR_PREFILTER);
    let qNorm = 0;
    for (let i = 0; i < this.dim; i++) qNorm += query[i]! * query[i]!;
    const hits = near.map(({ s, d }) => {
      let dot = 0;
      let norm = 0;
      const off = d * this.dim;
      for (let i = 0; i < this.dim; i++) {
        const v = s.vectors[off + i]!;
        dot += v * query[i]!;
        norm += v * v;
      }
      return { unit: s.units[d]!, score: dot / (Math.sqrt(norm * qNorm) || 1) };
    });
    return top(hits, limit);
  }

  /** Units that name or were spoken by one of `people` (folded), newest first. */
  people(people: readonly string[], filter: IndexFilter = {}, limit = 50): Hit[] {
    if (!people.length) return [];
    const best = new TopK(limit);
    const f = { ...filter, people };
    for (const s of this.inRange(filter)) {
      for (const [d, unit] of s.liveUnits()) if (best.wouldKeep(unit.at) && matches(unit, s.names[d]!, f)) best.push({ unit, score: unit.at });
    }
    return best.sorted();
  }

  /** Every live unit that passes the filter (for a time question with no terms), newest first. */
  recent(filter: IndexFilter = {}, limit = 50): Hit[] {
    const best = new TopK(limit);
    for (const s of this.inRange(filter)) for (const [d, unit] of s.liveUnits()) if (best.wouldKeep(unit.at) && matches(unit, s.names[d]!, filter)) best.push({ unit, score: unit.at });
    return best.sorted();
  }
}

const better = (a: Hit, b: Hit) => b.score - a.score || b.unit.at - a.unit.at;

function top(hits: Hit[], limit: number): Hit[] {
  return hits.sort(better).slice(0, limit);
}

/** The best `k` hits seen so far, in a min-heap on score, so ranking 100k candidates sorts only k. */
class TopK {
  private readonly heap: Hit[] = [];
  private readonly k: number;
  constructor(k: number) {
    this.k = Math.max(0, k);
  }
  /** False when a hit with this score cannot enter (ties may; `push` decides them). */
  wouldKeep(score: number): boolean {
    return this.heap.length < this.k || score >= this.heap[0]!.score;
  }
  push(h: Hit): void {
    if (this.k === 0) return;
    const heap = this.heap;
    if (heap.length < this.k) {
      heap.push(h);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (better(heap[parent]!, heap[i]!) >= 0) break;
        [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
        i = parent;
      }
      return;
    }
    if (better(h, heap[0]!) >= 0) return;
    heap[0] = h;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let worst = i;
      if (l < heap.length && better(heap[l]!, heap[worst]!) > 0) worst = l;
      if (r < heap.length && better(heap[r]!, heap[worst]!) > 0) worst = r;
      if (worst === i) break;
      [heap[worst], heap[i]] = [heap[i]!, heap[worst]!];
      i = worst;
    }
  }
  sorted(): Hit[] {
    return [...this.heap].sort(better);
  }
}
