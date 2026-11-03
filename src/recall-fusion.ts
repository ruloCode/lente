// Fusing the index's ranked lists into one (add-memory-engine decision 2): reciprocal rank fusion
// across the lexical, vector and people lists, a boost for units that name a person the question
// names, a small recency prior that is off when the question names a time, the ±1 neighbours of each
// segment so a quote keeps its question and its reply, and whether retrieval is confident enough to
// answer on the fast path. Pure.

import { fold } from "./terms.ts";
import type { Hit, MemoryUnit } from "./memory-index.ts";

/** Reciprocal rank fusion's k: a unit at rank r in a list adds 1 / (k + r). */
export const RRF_K = 60;
/** The recency prior halves every 30 days, and at most adds this share to a fused score. */
export const RECENCY_HALF_LIFE_DAYS = 30;
export const RECENCY_WEIGHT = 0.15;
/** Units that name a person the question names: their fused score is multiplied by this. */
export const PEOPLE_BOOST = 1.5;
/**
 * The fast path answers when the best units carry this much evidence: a lexical hit containing at
 * least this share of the question's terms, or a vector hit at least `VECTOR_MIN_SIMILARITY` close.
 */
export const RECALL_MIN_SCORE = 0.5;
export const VECTOR_MIN_SIMILARITY = 0.55;
/** How many of the top units are checked for evidence. */
const EVIDENCE_TOP = 3;
const DAY_MS = 86_400_000;

export interface RankedList {
  /** `time`: what a named time range holds (notes, cards, facts first). */
  name: "lexical" | "vector" | "people" | "time";
  hits: Hit[];
}

export interface Fused {
  unit: MemoryUnit;
  score: number;
  /** The lists it came from. */
  lists: RankedList["name"][];
}

export interface FuseOptions {
  now: number;
  /** The question named a time: no recency prior. */
  timeNamed?: boolean;
  /** Folded names the question names. */
  people?: readonly string[];
}

export function fuse(lists: readonly RankedList[], opts: FuseOptions): Fused[] {
  const byId = new Map<string, Fused>();
  for (const list of lists) {
    list.hits.forEach((h, rank) => {
      const f = byId.get(h.unit.id) ?? { unit: h.unit, score: 0, lists: [] };
      f.score += 1 / (RRF_K + rank + 1);
      if (!f.lists.includes(list.name)) f.lists.push(list.name);
      byId.set(h.unit.id, f);
    });
  }
  const people = opts.people ?? [];
  for (const f of byId.values()) {
    if (people.length) {
      const names = [...(f.unit.speakers ?? []), ...(f.unit.people ?? [])].map(fold);
      if (people.some((p) => names.some((n) => n.includes(p)))) f.score *= PEOPLE_BOOST;
    }
    if (!opts.timeNamed) {
      const ageDays = Math.max(0, (opts.now - (f.unit.to ?? f.unit.at)) / DAY_MS);
      f.score *= 1 + RECENCY_WEIGHT * 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score || b.unit.at - a.unit.at);
}

/** `s2026-11-03:12` (or `sm…:12` in a meeting) → segments 11 and 13 of the same run; nothing for other units. */
export function neighbourIds(id: string): { before?: string; after?: string } {
  const m = /^(s[^:]+):(\d+)$/.exec(id);
  if (!m) return {};
  const n = Number(m[2]);
  return { ...(n > 1 ? { before: `${m[1]}:${n - 1}` } : {}), after: `${m[1]}:${n + 1}` };
}

/**
 * The top units with each segment's neighbours around it (when `get` finds them and `keep` allows
 * them), without repeats, in at most `limit` units.
 */
export function expand(fused: readonly Fused[], get: (id: string) => MemoryUnit | undefined, keep: (u: MemoryUnit) => boolean, limit: number): MemoryUnit[] {
  const out: MemoryUnit[] = [];
  const seen = new Set<string>();
  const push = (u: MemoryUnit | undefined) => {
    if (!u || seen.has(u.id) || out.length >= limit || !keep(u)) return;
    seen.add(u.id);
    out.push(u);
  };
  for (const f of fused) {
    if (out.length >= limit) break;
    const { before, after } = neighbourIds(f.unit.id);
    // The neighbour before only when there is room for the unit itself too.
    if (out.length + 1 < limit) push(before ? get(before) : undefined);
    push(f.unit);
    push(after ? get(after) : undefined);
  }
  return out;
}

/** Whether the fast path may answer: enough evidence in the top units, or a person or time the question named matched. */
export function confident(lexical: readonly Hit[], vector: readonly Hit[], fused: readonly Fused[], matched: { person: boolean; time: boolean }): boolean {
  if (matched.person || matched.time) return fused.length > 0;
  const top = new Set(fused.slice(0, EVIDENCE_TOP).map((f) => f.unit.id));
  const lex = lexical.some((h) => top.has(h.unit.id) && (h.coverage ?? 0) >= RECALL_MIN_SCORE);
  const vec = vector.some((h) => top.has(h.unit.id) && h.score >= VECTOR_MIN_SIMILARITY);
  return lex || vec;
}
