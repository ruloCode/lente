// A memory index shard as a compact binary (add-memory-engine decision 3): unit table, term
// dictionary with delta-coded postings, and optional int8 vectors. Only live units are written, so a
// snapshot also compacts tombstones. The bytes are content: the runtime seals them with the wearer's
// data key before they leave memory. A CRC-32 over the body catches truncation and corruption, and the
// caller rebuilds the shard from its records when decoding fails. Pure.

import { crc32 } from "node:zlib";
import { type MemoryUnit, type Posting, Shard, type UnitKind } from "./memory-index.ts";

const MAGIC = "LMIX";
/** Bumped when the layout changes; an older snapshot is rebuilt, never read. */
export const SNAPSHOT_FORMAT = 1;
/** Stored by position: a new kind goes at the end, so older snapshots still read. */
const KINDS: readonly UnitKind[] = ["segment", "seen", "notes", "card", "fact", "digest", "practice"];

export class SnapshotError extends Error {
  constructor(message: string) {
    super(`memory snapshot: ${message}`);
    this.name = "SnapshotError";
  }
}

class Writer {
  private buf = new Uint8Array(1 << 16);
  private len = 0;
  private reserve(n: number): void {
    if (this.len + n <= this.buf.length) return;
    const grown = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    grown.set(this.buf.subarray(0, this.len));
    this.buf = grown;
  }
  uint(n: number): void {
    this.reserve(10);
    let v = n;
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
  }
  /** Optional numbers: 0 means absent, else value + 1 (times are whole ms). */
  opt(n: number | undefined): void {
    this.uint(n === undefined ? 0 : n + 1);
  }
  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  str(s: string): void {
    const b = Buffer.from(s, "utf8");
    this.uint(b.length);
    this.bytes(b);
  }
  strs(list: readonly string[] | undefined): void {
    this.uint(list?.length ?? 0);
    for (const s of list ?? []) this.str(s);
  }
  done(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

class Reader {
  private pos = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) {
    this.buf = buf;
  }
  uint(): number {
    let v = 0;
    let mul = 1;
    for (;;) {
      if (this.pos >= this.buf.length) throw new SnapshotError("truncated");
      const b = this.buf[this.pos++]!;
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
  }
  opt(): number | undefined {
    const v = this.uint();
    return v === 0 ? undefined : v - 1;
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new SnapshotError("truncated");
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  str(): string {
    return Buffer.from(this.bytes(this.uint())).toString("utf8");
  }
  strs(): string[] {
    return Array.from({ length: this.uint() }, () => this.str());
  }
  get end(): boolean {
    return this.pos === this.buf.length;
  }
}

export interface SnapshotMeta {
  shard: string;
  /** The encoder's id, or `lexical` when the shard carries no vectors. */
  encoder: string;
  dim: number;
  /** The newest record the shard was built from, ms since the epoch. */
  builtThrough: number;
}

/** Shard → bytes: magic, format, body, CRC-32 of the body. */
export function encodeShard(shard: Shard, meta: Omit<SnapshotMeta, "shard" | "dim">): Uint8Array {
  const w = new Writer();
  w.str(shard.key);
  w.str(meta.encoder);
  w.uint(shard.dim);
  w.uint(Math.round(meta.builtThrough));
  const live = [...shard.liveUnits()];
  const dense = new Map(live.map(([slot], i) => [slot, i]));
  w.uint(live.length);
  for (const [slot, u] of live) {
    w.str(u.id);
    w.uint(KINDS.indexOf(u.kind));
    w.uint(Math.round(u.at));
    w.opt(u.to === undefined ? undefined : Math.round(u.to));
    w.str(u.projectId ?? "");
    w.strs(u.speakers);
    w.strs(u.people);
    w.opt(u.validFrom === undefined ? undefined : Math.round(u.validFrom));
    w.opt(u.validTo === undefined ? undefined : Math.round(u.validTo));
    w.str(u.refs ?? "");
    w.str(u.title ?? "");
    w.str(u.text);
    w.uint(shard.lengths[slot]!);
    const vec = shard.dim > 0 && shard.hasVector[slot];
    w.uint(vec ? 1 : 0);
    if (vec) w.bytes(new Uint8Array(shard.vectors.buffer, shard.vectors.byteOffset + slot * shard.dim, shard.dim));
  }
  const postings: [string, number[], number[]][] = [];
  for (const [term, p] of shard.postings) {
    const docs: number[] = [];
    const tfs: number[] = [];
    p.docs.forEach((d, i) => {
      const at = dense.get(d);
      if (at === undefined) return;
      docs.push(at);
      tfs.push(p.tfs[i]!);
    });
    if (docs.length) postings.push([term, docs, tfs]);
  }
  w.uint(postings.length);
  for (const [term, docs, tfs] of postings) {
    w.str(term);
    w.uint(docs.length);
    let prev = 0;
    for (const d of docs) (w.uint(d - prev), (prev = d));
    for (const tf of tfs) w.uint(tf);
  }
  w.uint(shard.sources.size);
  for (const [k, v] of shard.sources) (w.str(k), w.str(v));
  const body = w.done();
  const out = new Uint8Array(4 + 2 + body.length + 4);
  out.set(Buffer.from(MAGIC, "ascii"), 0);
  new DataView(out.buffer).setUint16(4, SNAPSHOT_FORMAT, true);
  out.set(body, 6);
  new DataView(out.buffer).setUint32(6 + body.length, crc32(body), true);
  return out;
}

/** Bytes → shard and its meta; throws `SnapshotError` on anything but a whole, current snapshot. */
export function decodeShard(bytes: Uint8Array): { shard: Shard; meta: SnapshotMeta } {
  if (bytes.length < 10 || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== MAGIC) throw new SnapshotError("not a memory snapshot");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(4, true);
  if (format !== SNAPSHOT_FORMAT) throw new SnapshotError(`format ${format}, this hub reads ${SNAPSHOT_FORMAT}`);
  const body = bytes.subarray(6, bytes.length - 4);
  if (crc32(body) !== view.getUint32(bytes.length - 4, true)) throw new SnapshotError("checksum mismatch (corrupt or truncated)");
  const r = new Reader(body);
  const key = r.str();
  const encoder = r.str();
  const dim = r.uint();
  const builtThrough = r.uint();
  const count = r.uint();
  const units: MemoryUnit[] = [];
  const lengths: number[] = [];
  const hasVector: boolean[] = [];
  const vectors = dim ? new Int8Array(count * dim) : undefined;
  for (let i = 0; i < count; i++) {
    const id = r.str();
    const kind = KINDS[r.uint()];
    if (!kind) throw new SnapshotError(`unit ${id} has an unknown kind`);
    const at = r.uint();
    const to = r.opt();
    const projectId = r.str();
    const speakers = r.strs();
    const people = r.strs();
    const validFrom = r.opt();
    const validTo = r.opt();
    const refs = r.str();
    const title = r.str();
    const text = r.str();
    lengths.push(r.uint());
    const vec = r.uint() === 1;
    hasVector.push(vec);
    if (vec) {
      if (!vectors) throw new SnapshotError(`unit ${id} carries a vector in a shard without dimensions`);
      vectors.set(new Int8Array(r.bytes(dim).slice().buffer), i * dim);
    }
    units.push({ id, kind, at, ...(to === undefined ? {} : { to }), ...(projectId ? { projectId } : {}), ...(speakers.length ? { speakers } : {}), ...(people.length ? { people } : {}), ...(validFrom === undefined ? {} : { validFrom }), ...(validTo === undefined ? {} : { validTo }), ...(refs ? { refs } : {}), ...(title ? { title } : {}), text });
  }
  const postings = new Map<string, Posting>();
  const termCount = r.uint();
  for (let i = 0; i < termCount; i++) {
    const term = r.str();
    const n = r.uint();
    const docs: number[] = [];
    let prev = 0;
    for (let j = 0; j < n; j++) docs.push((prev += r.uint()));
    const tfs = Array.from({ length: n }, () => r.uint());
    if (docs.some((d) => d >= count)) throw new SnapshotError(`term postings point past the ${count} units`);
    postings.set(term, { docs, tfs });
  }
  const sources = new Map<string, string>();
  const sourceCount = r.uint();
  for (let i = 0; i < sourceCount; i++) sources.set(r.str(), r.str());
  if (!r.end) throw new SnapshotError("trailing bytes");
  return { shard: Shard.restore(key, dim, { units, lengths, postings, vectors, hasVector, sources }), meta: { shard: key, encoder, dim, builtThrough } };
}
