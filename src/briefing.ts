// What Lente remembers, as text a model can read, and the briefing built from it. The memory
// is a stable prefix (phrases, glossary, then meetings oldest first) so prompt caching keeps
// repeated calls cheap; the briefing is checked in code so every claim has a meeting behind it.
// Pure: the hub gathers the data and makes the model call.

import { toCue } from "./clip-protocol.ts";
import { type GlossaryEntry, termKey } from "./language-profile.ts";
import type { Meeting } from "./meetings.ts";

/** Oldest meetings fall out of the prefix first once it grows past this. */
export const MEMORY_MAX_CHARS = 24_000;
const MAX_GLOSSARY_IN_MEMORY = 60;
const MAX_PER_KIND = { owed: 5, open: 5, term: 6, phrase: 3 } as const;

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Meetings that have notes the model can lean on. */
export const rememberedMeetings = (meetings: Meeting[]): Meeting[] => meetings.filter((m) => m.status === "done" && m.notes);

function meetingBlock(m: Meeting): string {
  const n = m.notes!;
  const lines = [`[${m.id} · ${day(m.startedAt)}${m.title ? ` · "${m.title}"` : ""}] ${n.summary}`];
  for (const d of n.decisions) lines.push(`- decision: ${d.text}`);
  for (const c of n.commitments) lines.push(`- commitment (${c.owner === "you" ? "the wearer" : c.owner}${c.due ? `, due ${c.due}` : ""}): ${c.what}`);
  for (const q of n.openQuestions) lines.push(`- open: ${q.text}`);
  return lines.join("\n");
}

/**
 * The memory as one block, or "" when there is nothing yet. It only changes when a meeting ends
 * or is deleted, so the bytes stay identical across the replies of a meeting.
 */
export function memoryPrefix(input: { phrases: string[]; glossary: GlossaryEntry[]; meetings: Meeting[] }): string {
  const blocks = rememberedMeetings(input.meetings).map(meetingBlock);
  const glossary = input.glossary.slice(0, MAX_GLOSSARY_IN_MEMORY);
  if (!blocks.length && !glossary.length && !input.phrases.length) return "";
  const head = ["WHAT LENTE REMEMBERS ABOUT THE WEARER (the person wearing the glasses)"];
  if (input.phrases.length) head.push(`Phrases they often say: ${input.phrases.map((p) => `"${p}"`).join("; ")}`);
  if (glossary.length) head.push(`Terms they looked up: ${glossary.map((g) => `${g.term} = ${g.meaning}`).join("; ")}`);
  let budget = MEMORY_MAX_CHARS - head.join("\n").length;
  const kept: string[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    budget -= blocks[i].length + 1;
    if (budget < 0) break;
    kept.unshift(blocks[i]);
  }
  if (kept.length) head.push("Earlier meetings, oldest first:", ...kept);
  return head.join("\n");
}

/** Memory first, task after it: the shared start is what the cache can reuse across tasks. */
export const withMemory = (memory: string, task: string): string => (memory ? `${memory}\n\n${task}` : task);

// --- Reply ----------------------------------------------------------------------------------------

/** Marks the line that carries the Spanish meaning of the sentence. */
export const MEANING_MARK = "ES:";
export const REPLY_MAX_CHARS = 90;

export const SAY_THIS_PROMPT =
  "You help a Spanish speaker answer in a live meeting. Given the conversation and the " +
  "question just asked, write ONE natural sentence they can say right now. Under 90 characters, " +
  "in the language of the question, no quotes, no preamble. If the question is not in Spanish, add a second line " +
  `starting with "${MEANING_MARK} " and what the sentence means in Spanish, under 90 characters. ` +
  "If the question is in Spanish, write only the sentence.";
const MEMORY_HINT =
  " Where it fits, use the words and phrasings the wearer already says (listed in the memory above) " +
  "and what the memory says they promised or decided; never state anything the memory and the conversation do not support.";

/** The reply prompt: memory first (cacheable), then the task, then what was just said. */
export function replyMessages(memory: string, conversation: string, question: string) {
  return [
    { role: "system" as const, content: withMemory(memory, SAY_THIS_PROMPT + (memory ? MEMORY_HINT : "")) },
    { role: "user" as const, content: `Conversation so far:\n${conversation}\n\nQuestion just asked: ${question}` },
  ];
}

export interface Reply {
  /** The sentence to say, in the language of the question. */
  text: string;
  /** Its meaning in Spanish; absent for a Spanish question or when the model gave none. */
  meaning?: string;
}

const SPANISH_WORDS = new Set("que qué el la los las una es está están por para con del al pero como cómo cuándo dónde quién lo se su sus puedes podemos tienes tengo hay ya sí también nos le les te eso esto este esta mañana".split(" "));
const ENGLISH_WORDS = new Set("the an is are you we to of and can could will would do does did it that this what when how where who have has for on in with be your our by".split(" "));

/** Inverted marks or more common Spanish words than English ones; an accented name alone doesn't count. */
export function looksSpanish(text: string): boolean {
  if (/[¿¡]/.test(text)) return true;
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const es = words.filter((w) => SPANISH_WORDS.has(w)).length;
  const en = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return es > en;
}

const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Splits the reply into the sentence and its Spanish meaning, each one short line. The meaning is
 * dropped when it is missing or empty, when the question or the sentence is Spanish, or when it
 * only repeats the sentence: the card never waits or retries for it.
 */
export function parseReply(raw: string, question: string): Reply {
  const mark = new RegExp(`^\\s*${MEANING_MARK.replace(":", "")}\\s*[:\\-–]`, "i");
  const lines = raw.split("\n").filter((l) => l.trim());
  const meaningLine = lines.find((l) => mark.test(l));
  const text = toCue(lines.filter((l) => l !== meaningLine).join("\n"), REPLY_MAX_CHARS);
  const meaning = meaningLine ? toCue(meaningLine.replace(mark, ""), REPLY_MAX_CHARS) : "";
  const usable = /\p{L}/u.test(meaning) && text && !looksSpanish(question) && !looksSpanish(text) && !sameWords(meaning, text);
  return usable ? { text, meaning } : { text };
}

// --- Briefing -------------------------------------------------------------------------------------

export type BriefingKind = "owed" | "open" | "term" | "phrase";

export interface BriefingItem {
  kind: BriefingKind;
  text: string;
  /** Meeting ids behind the item; empty only for phrases, which are suggestions, not claims. */
  sources: string[];
}

export interface BriefingSource {
  id: string;
  title: string;
  startedAt: number;
}

export interface Briefing {
  title: string;
  names: string[];
  at: number;
  /** False when no earlier meeting had notes, so only generic phrases can be offered. */
  remembered: boolean;
  items: BriefingItem[];
  sources: BriefingSource[];
  /** Items the model proposed without a meeting or glossary term behind them. */
  dropped: number;
}

const KINDS: BriefingKind[] = ["owed", "open", "term", "phrase"];

export function briefingSchema(meetingIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "text", "sources"],
          properties: {
            kind: { type: "string", enum: KINDS },
            text: { type: "string" },
            sources: { type: "array", items: meetingIds.length ? { type: "string", enum: meetingIds } : { type: "string" } },
          },
        },
      },
    },
  };
}

export const BRIEFING_TASK =
  "Prepare the wearer for a meeting they are about to join, using only the memory above. Return items of these kinds: " +
  "`owed` (something the wearer promised the participants and has not delivered, from a commitment), " +
  "`open` (a question left open in an earlier meeting with them), " +
  "`term` (a term from the glossary likely to come up; text is exactly the term), " +
  "`phrase` (a short sentence the wearer may need in this meeting; exactly three, in English unless the memory shows another language, and preferring the wearer's own phrasings). " +
  "Write owed and open items in Spanish, one short line each. For owed and open, cite the meeting ids in `sources`; " +
  "leave `sources` empty for terms and phrases. Never invent commitments, people or facts: if the memory has nothing related to the title or the names, return only the three phrases.";

export function briefingMessages(memory: string, title: string, names: string[]) {
  const who = names.length ? `Participants: ${names.join(", ")}.` : "Participants: not given.";
  return [
    { role: "system" as const, content: withMemory(memory, BRIEFING_TASK) },
    { role: "user" as const, content: `Meeting: ${title ? `"${title}"` : "untitled"}. ${who}` },
  ];
}

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Keeps owed/open items whose sources are real meetings with notes, terms that are in the
 * glossary (sourced from where they were heard), and up to three phrases. The rest is dropped
 * and counted: this is where "grounded" is enforced.
 */
export function validateBriefing(raw: unknown, meetings: Meeting[], glossary: GlossaryEntry[]): { items: BriefingItem[]; dropped: number } {
  const known = new Set(rememberedMeetings(meetings).map((m) => m.id));
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as { items?: unknown };
  const list = Array.isArray(input.items) ? input.items : [];
  const items: BriefingItem[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const entry of list) {
    const o = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const kind = KINDS.find((k) => k === o.kind);
    const body = text(o.text).slice(0, 240);
    const dup = `${kind}:${body.toLowerCase()}`;
    if (!kind || !body || seen.has(dup)) {
      dropped++;
      continue;
    }
    seen.add(dup);
    if (kind === "phrase") {
      items.push({ kind, text: body, sources: [] });
    } else if (kind === "term") {
      const entry = glossary.find((g) => termKey(g.term) === termKey(body));
      const sources = [...new Set((entry?.sightings ?? []).map((s) => s.meeting).filter((id) => known.has(id)))];
      if (entry && sources.length) items.push({ kind, text: entry.term, sources });
      else dropped++;
    } else {
      const cited = Array.isArray(o.sources) ? o.sources : [];
      const sources = [...new Set(cited.filter((s): s is string => typeof s === "string" && known.has(s)))];
      if (sources.length) items.push({ kind, text: body, sources });
      else dropped++;
    }
  }
  const count: Record<BriefingKind, number> = { owed: 0, open: 0, term: 0, phrase: 0 };
  const capped = items.filter((i) => ++count[i.kind] <= MAX_PER_KIND[i.kind]);
  dropped += items.length - capped.length;
  return { items: capped.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)), dropped };
}

/** The meetings an item list cites, for the card's "from" lines. */
export function citedSources(items: BriefingItem[], meetings: Meeting[]): BriefingSource[] {
  const ids = new Set(items.flatMap((i) => i.sources));
  return meetings.filter((m) => ids.has(m.id)).map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt }));
}
