// Memory cards (add-memory-engine decisions 5 and 6): what an episode leaves for later, written by the
// same structured call as its notes (a window card every 10 minutes in a long episode is its own call).
// A card holds the people, facts with the turns behind them and when they became true, and short search
// keys in Spanish and English, so a Spanish question finds an English meeting with no model call at
// question time. Facts are append-only: a new fact that names an earlier one in `supersedes` closes the
// earlier one's validity; nothing is deleted, and a fact the wearer kept is never offered for it.
// Pure: the call, the clock and the stores stay in the hub.

import type { Meeting } from "./meetings.ts";
import type { MemoryUnit } from "./memory-index.ts";

/** Search keys per language. */
export const MAX_KEYS = 12;
export const MAX_CARD_FACTS = 8;
/** Existing facts shown to the call so it can say which one a new fact replaces. */
export const SHOWN_FACTS = 5;
/** A long episode gets a card for each window of this much wall time that had speech. */
export const WINDOW_MS = 10 * 60_000;
const MAX_FACT_CHARS = 200;

export interface CardFact {
  /** `c<episode id>:<n>`, numbered across the episode's cards. */
  id: string;
  text: string;
  /** People or the project it is about. */
  about: string[];
  evidence: string[];
  /** When it became true, ms (the day it was said when the speaker gave none). */
  validFrom: number;
  /** Set when a later fact superseded it. */
  validTo?: number;
  supersedes?: string;
  supersededBy?: string;
}

export interface MemoryCard {
  /** The window it covers, or the whole episode (`window: false`). */
  from: number;
  to: number;
  window: boolean;
  people: { name: string; role: string }[];
  facts: CardFact[];
  keysEs: string[];
  keysEn: string[];
}

/** An existing fact shown to the call, by id. */
export interface ShownFact {
  id: string;
  text: string;
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strs = (v: unknown, max: number, each = 60) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, each)).filter(Boolean))].slice(0, max) : []);

/** The card fields' schema, added to the notes call's (or alone, for a window card). */
export function cardSchemaFields(turnIds: string[], shownIds: string[]) {
  const evidence = { type: "array", items: turnIds.length ? { type: "string", enum: turnIds } : { type: "string" } };
  return {
    people: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "role"], properties: { name: { type: "string" }, role: { type: "string" } } } },
    card_facts: {
      type: "array",
      maxItems: MAX_CARD_FACTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "about", "evidence", "valid_from", "supersedes"],
        properties: {
          text: { type: "string" },
          about: { type: "array", items: { type: "string" } },
          evidence,
          valid_from: { type: "string" },
          supersedes: { type: "string", enum: ["", ...shownIds] },
        },
      },
    },
    keys_es: { type: "array", maxItems: MAX_KEYS, items: { type: "string" } },
    keys_en: { type: "array", maxItems: MAX_KEYS, items: { type: "string" } },
  } as const;
}

export const CARD_FIELDS = ["people", "card_facts", "keys_es", "keys_en"] as const;

/** A window card's own schema. */
export function windowCardSchema(turnIds: string[], shownIds: string[]) {
  return { type: "object", additionalProperties: false, required: [...CARD_FIELDS], properties: cardSchemaFields(turnIds, shownIds) };
}

/** What the call is told about the card fields, with the facts it may supersede. */
export function cardPrompt(shown: readonly ShownFact[], fromTurn?: string): string {
  return [
    "Also write the memory card:",
    "- `people`: who took part or was talked about, with their role as it was said (empty role if none).",
    `- \`card_facts\`: up to ${MAX_CARD_FACTS} facts worth finding later (decisions, numbers with their unit, dates, who owns what, what changed), each one sentence in Spanish keeping names, figures and quoted words exactly as said, with \`about\` (people or project), the supporting turn ids, \`valid_from\` (\`YYYY-MM-DD\` if the speaker said when it becomes true, else empty) and \`supersedes\`.`,
    shown.length
      ? `- \`supersedes\`: if a fact changes one of these earlier facts, its id; otherwise empty.\n${shown.map((f) => `  ${f.id}: ${f.text}`).join("\n")}`
      : "- `supersedes`: always empty.",
    `- \`keys_es\` and \`keys_en\`: up to ${MAX_KEYS} short search keys each, in Spanish and in English: names, topics, numbers with their unit, and the words someone would type to find this later («presupuesto de marketing» / "marketing budget").`,
    fromTurn ? `Earlier turns already have cards: card facts only from ${fromTurn} on.` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The card from the call's JSON: facts need a real turn (from `fromTurn` on when given) and drop
 * otherwise; `supersedes` must name a shown fact; ids continue after `firstN`. Returns the dropped count.
 */
export function validateCard(raw: unknown, ctx: { episodeId: string; turnIds: string[]; turnAt: ReadonlyMap<string, number>; shown: readonly ShownFact[]; from: number; to: number; window: boolean; firstN: number; fromTurn?: string; dayStart: (day: string) => number }): { card: MemoryCard; dropped: number } {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const startIndex = ctx.fromTurn ? ctx.turnIds.indexOf(ctx.fromTurn) : 0;
  const allowed = new Set(ctx.turnIds.slice(Math.max(0, startIndex)));
  const shown = new Set(ctx.shown.map((f) => f.id));
  let dropped = 0;
  let n = ctx.firstN;
  const facts: CardFact[] = [];
  for (const item of Array.isArray(input.card_facts) ? input.card_facts.slice(0, MAX_CARD_FACTS) : []) {
    const o = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const evidence = [...new Set((Array.isArray(o.evidence) ? o.evidence : []).map((e) => /^t\d+/.exec(str(e))?.[0]).filter((e): e is string => Boolean(e && allowed.has(e))))];
    const text = str(o.text, MAX_FACT_CHARS);
    if (!text || !evidence.length) {
      dropped++;
      continue;
    }
    const said = Math.min(...evidence.map((e) => ctx.turnAt.get(e) ?? ctx.from));
    const day = /^\d{4}-\d{2}-\d{2}$/.test(str(o.valid_from)) ? ctx.dayStart(str(o.valid_from)) : undefined;
    const supersedes = shown.has(str(o.supersedes)) ? str(o.supersedes) : undefined;
    if (str(o.supersedes) && !supersedes) dropped++;
    facts.push({ id: `c${ctx.episodeId}:${++n}`, text, about: strs(o.about, 6), evidence, validFrom: day ?? said, ...(supersedes ? { supersedes } : {}) });
  }
  const people = (Array.isArray(input.people) ? input.people : []).flatMap((p) => {
    const o = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
    return str(o.name, 80) ? [{ name: str(o.name, 80), role: str(o.role, 80) }] : [];
  });
  return { card: { from: ctx.from, to: ctx.to, window: ctx.window, people: people.slice(0, 20), facts, keysEs: strs(input.keys_es, MAX_KEYS), keysEn: strs(input.keys_en, MAX_KEYS) }, dropped };
}

/** Every card fact of every episode, oldest first, with its episode. */
export function allFacts(meetings: readonly Meeting[]): { meeting: Meeting; fact: CardFact }[] {
  return meetings.flatMap((m) => (m.cards ?? []).flatMap((c) => c.facts.map((fact) => ({ meeting: m, fact })))).sort((a, b) => a.fact.validFrom - b.fact.validFrom);
}

/**
 * Closes the validity of every fact the new card supersedes, at the new fact's `validFrom`. A fact
 * already closed keeps its earlier end. Returns the episodes whose cards changed (to save them).
 */
export function applySupersession(card: MemoryCard, meetings: readonly Meeting[]): Meeting[] {
  const changed = new Set<Meeting>();
  const byId = new Map(allFacts(meetings).map((x) => [x.fact.id, x]));
  for (const f of card.facts) {
    const old = f.supersedes ? byId.get(f.supersedes) : undefined;
    if (!old) continue;
    old.fact.validTo = Math.min(old.fact.validTo ?? Infinity, Math.max(f.validFrom, old.fact.validFrom));
    old.fact.supersededBy = f.id;
    changed.add(old.meeting);
  }
  return [...changed];
}

/** How many card facts an episode already has (the next id continues after it). */
export const factCount = (m: Meeting): number => (m.cards ?? []).reduce((n, c) => n + c.facts.length, 0);

/**
 * The window that is due now in a running episode, if any: the oldest 10-minute window since
 * `cardedUntil` that has closed, had speech, and was not held (idle pause or the silence gate).
 * Windows run on wall time from the episode's start.
 */
export function dueWindow(m: Pick<Meeting, "startedAt" | "turns">, cardedUntil: number, now: number, held: (from: number, to: number) => boolean): { from: number; to: number } | undefined {
  let from = Math.max(m.startedAt, cardedUntil);
  // Align to the episode's window grid.
  from = m.startedAt + Math.floor((from - m.startedAt) / WINDOW_MS) * WINDOW_MS;
  for (; from + WINDOW_MS <= now; from += WINDOW_MS) {
    const to = from + WINDOW_MS;
    if (to <= cardedUntil) continue;
    if (held(from, to)) continue;
    if (m.turns.some((t) => t.at >= from && t.at < to && t.text.trim())) return { from, to };
  }
  return undefined;
}

/** A card's facts as index units: one unit per fact, the card's keys and people with it, its validity. */
export function cardUnits(m: Meeting, projectId: string | undefined): MemoryUnit[] {
  return (m.cards ?? []).flatMap((c) =>
    c.facts.map((f): MemoryUnit => ({
      id: f.id,
      kind: "card",
      at: f.validFrom,
      ...(projectId ? { projectId } : {}),
      people: [...new Set([...c.people.map((p) => p.name), ...f.about])],
      validFrom: f.validFrom,
      ...(f.validTo !== undefined ? { validTo: f.validTo } : {}),
      refs: `${m.id}:${f.evidence[0] ?? ""}`,
      title: m.title || "Reunión",
      text: `${f.text}${f.supersedes ? " (cambia un dato anterior)" : ""} · ${[...c.keysEs, ...c.keysEn].join(", ")}`,
    })),
  );
}

/** The up to `SHOWN_FACTS` currently valid facts most like the new episode, by shared words. */
export function factsToShow(meetings: readonly Meeting[], score: (factText: string) => number): ShownFact[] {
  return allFacts(meetings)
    .filter((x) => x.fact.validTo === undefined)
    .map((x) => ({ id: x.fact.id, text: x.fact.text, s: score(x.fact.text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, SHOWN_FACTS)
    .map(({ id, text }) => ({ id, text }));
}

/** The notes call's schema with the card fields added (decision 5: one call per episode). */
export function withCardFields<S extends { required: readonly string[]; properties: Record<string, unknown> }>(schema: S, turnIds: string[], shownIds: string[]): S {
  return { ...schema, required: [...schema.required, ...CARD_FIELDS], properties: { ...schema.properties, ...cardSchemaFields(turnIds, shownIds) } };
}

/** Where the episode's cards end: the last window's end, or its start. */
export const cardedUntil = (m: Pick<Meeting, "startedAt" | "cards">): number => Math.max(m.startedAt, ...(m.cards ?? []).map((c) => c.to));

/** The first turn not yet covered by a window card, when the episode had any. */
export function firstUncarded(m: Pick<Meeting, "startedAt" | "cards" | "turns">): string | undefined {
  if (!(m.cards ?? []).some((c) => c.window)) return undefined;
  const until = cardedUntil(m);
  return m.turns.find((t) => t.at >= until)?.id;
}
