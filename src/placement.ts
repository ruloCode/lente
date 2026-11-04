// «¿Qué nivel tengo?» (add-language-coach design decision 4): the spoken placement's rules, the fluency
// numbers measured from the transcription's timing, the estimate's schema, the check that every quote
// is the wearer's own words, and the line Lente closes with. Pure: the hub keeps the clock and makes
// the one model call.

import type { Band, CoachLanguage } from "./coach.ts";

/** From here the tutor may close the placement. Policy constants, checked by the agreement bench (3.4). */
export const PLACEMENT_MIN_MS = 180_000;
/** Here the hub closes it. */
export const PLACEMENT_MAX_MS = 300_000;
/** With fewer words from the wearer, no band is given. */
export const PLACEMENT_MIN_WORDS = 60;
/** Fewer rungs answered than this, and the confidence is low whatever the model said. */
export const PLACEMENT_MIN_RUNGS = 3;
/** Quotes kept per part of the evidence. */
export const QUOTES_MAX = 3;

export const NOT_AN_EXAM = "No es un examen oficial.";

export const BANDS: readonly Band[] = ["A1", "A2", "B1", "B2", "C1"];
export type Confidence = "low" | "medium" | "high";

/** One answer of the wearer: its words and where it sits in the session audio. */
export interface PlacementTurn {
  text: string;
  /** Session audio ms of the turn's speech start and end, when the transcription sent them. */
  startMs?: number;
  endMs?: number;
  /** Session audio ms when the tutor's question before it had finished playing on the phone. */
  promptEndMs?: number;
}

export interface Fluency {
  words: number;
  turns: number;
  /** Words per minute while speaking, over the turns that have an audio span. */
  wordsPerMinute?: number;
  /** Median time from the end of the tutor's question to the wearer's speech start. */
  medianStartMs?: number;
  wordsPerTurn: number;
}

const wordCount = (text: string): number => (text.match(/\p{L}+/gu) ?? []).length;

const median = (values: number[]): number | undefined => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Timing measured, not judged: words per minute from audio spans, the median time to start answering, words per turn. */
export function fluency(turns: readonly PlacementTurn[]): Fluency {
  const words = turns.reduce((n, t) => n + wordCount(t.text), 0);
  let spokenMs = 0;
  let spokenWords = 0;
  const starts: number[] = [];
  for (const t of turns) {
    if (t.startMs !== undefined && t.endMs !== undefined && t.endMs > t.startMs) {
      spokenMs += t.endMs - t.startMs;
      spokenWords += wordCount(t.text);
    }
    if (t.startMs !== undefined && t.promptEndMs !== undefined && t.startMs >= t.promptEndMs) starts.push(t.startMs - t.promptEndMs);
  }
  const start = median(starts);
  return {
    words,
    turns: turns.length,
    ...(spokenMs > 0 ? { wordsPerMinute: Math.round((spokenWords / spokenMs) * 60_000) } : {}),
    ...(start !== undefined ? { medianStartMs: Math.round(start) } : {}),
    wordsPerTurn: turns.length ? Math.round((words / turns.length) * 10) / 10 : 0,
  };
}

/** Enough speech for a band: PLACEMENT_MIN_WORDS from the wearer. */
export const enoughForBand = (f: Fluency): boolean => f.words >= PLACEMENT_MIN_WORDS;

// --- The estimate --------------------------------------------------------------------------------

export interface Estimate {
  band: Band;
  confidence: Confidence;
  vocabulary: { note: string; quotes: string[] };
  grammar: { note: string; quotes: string[]; patterns: string[] };
  plan: string[];
}

const text = { type: "string" };
const quotes = { type: "array", items: text };

/** The structured output of the estimate call (Chat Completions `json_schema`, strict). */
export const ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["band", "confidence", "vocabulary", "grammar", "plan"],
  properties: {
    band: { type: "string", enum: [...BANDS] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    vocabulary: { type: "object", additionalProperties: false, required: ["note", "quotes"], properties: { note: text, quotes } },
    grammar: { type: "object", additionalProperties: false, required: ["note", "quotes", "patterns"], properties: { note: text, quotes, patterns: quotes } },
    plan: { type: "array", items: text },
  },
} as const;

/** The estimate call's system prompt: the evidence must be quotes of the wearer's own words. */
export function estimatePrompt(lang: CoachLanguage): string {
  return (
    `You estimate the CEFR level (A1 to C1) of a Spanish speaker learning ${lang.asr} from a short spoken placement conversation. ` +
    "You get the tutor's questions, the learner's answers as transcribed, and timing numbers measured from the audio. " +
    "Judge vocabulary range and grammar accuracy from the answers; weigh the timing, but set no threshold on it. Speech recognition may have mangled a word: do not punish one odd word. " +
    `Quote only exact words from the learner's answers, at most ${QUOTES_MAX} per part, never the tutor's. ` +
    "Write every note and the plan in Spanish, short, warm and concrete (at most three plan steps, one sentence each). " +
    "Use confidence low when the answers are few or short. This is an estimate, not an exam."
  );
}

/** The estimate call's user message: the conversation and the measured numbers. */
export function estimateInput(questions: readonly string[], turns: readonly PlacementTurn[], f: Fluency): string {
  const lines = [
    "TUTOR QUESTIONS:",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "LEARNER ANSWERS:",
    ...turns.map((t, i) => `${i + 1}. ${t.text}`),
    "MEASURED:",
    `words ${f.words} · turns ${f.turns} · words per turn ${f.wordsPerTurn}` + (f.wordsPerMinute !== undefined ? ` · words per minute while speaking ${f.wordsPerMinute}` : "") + (f.medianStartMs !== undefined ? ` · median time to start answering ${f.medianStartMs} ms` : ""),
  ];
  return lines.join("\n");
}

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 200)).slice(0, max) : []);

/** The model's reply as an Estimate, or undefined when it is not one. */
export function parseEstimate(raw: string): Estimate | undefined {
  let j: Record<string, any>;
  try {
    j = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!j || !BANDS.includes(j.band)) return undefined;
  const confidence: Confidence = j.confidence === "high" || j.confidence === "medium" ? j.confidence : "low";
  return {
    band: j.band,
    confidence,
    vocabulary: { note: String(j.vocabulary?.note ?? "").slice(0, 300), quotes: strings(j.vocabulary?.quotes, QUOTES_MAX) },
    grammar: { note: String(j.grammar?.note ?? "").slice(0, 300), quotes: strings(j.grammar?.quotes, QUOTES_MAX), patterns: strings(j.grammar?.patterns, QUOTES_MAX) },
    plan: strings(j.plan, 3),
  };
}

/**
 * Keeps only quotes that are in the wearer's own turns (after case, accents and punctuation), as the hub
 * checks cited ids, and lowers the confidence when fewer than PLACEMENT_MIN_RUNGS answers were given.
 */
export function checkEvidence(e: Estimate, turns: readonly PlacementTurn[]): Estimate {
  const said = ` ${turns.map((t) => fold(t.text)).join(" | ")} `;
  const own = (q: string[]) => q.filter((x) => fold(x) && said.includes(` ${fold(x)} `));
  return {
    ...e,
    confidence: turns.length < PLACEMENT_MIN_RUNGS ? "low" : e.confidence,
    vocabulary: { ...e.vocabulary, quotes: own(e.vocabulary.quotes) },
    grammar: { ...e.grammar, quotes: own(e.grammar.quotes) },
  };
}

const CONFIDENCE_WORDS: Readonly<Record<Confidence, string>> = { low: "con poca seguridad", medium: "con seguridad media", high: "con bastante seguridad" };

/** What Lente says at the end: the band and one reason, or that it needs more; always «No es un examen oficial». */
export function closingLine(e: Estimate | undefined, lang: CoachLanguage): string {
  if (!e) return `Necesito una conversación más larga para estimar tu nivel de ${lang.name}. ${NOT_AN_EXAM}`;
  const reason = (e.vocabulary.note || e.grammar.note).replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  return `Tu nivel estimado de ${lang.name} es ${e.band}, ${CONFIDENCE_WORDS[e.confidence]}.${reason ? ` ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : ""} ${NOT_AN_EXAM}`;
}
