// «Practicar» (add-practice-mode): piano lessons, a played attempt's checks, the one-line Spanish summary
// kept in the day record, and the coach's prompt. Pure: the phone hears the notes and matches them
// (design decisions 1, 2 and 4); the hub owns the route, the day record and the model call.

import type { ChatMessage } from "./chat.ts";

export interface Lesson {
  id: string;
  /** Spanish, shown on the phone and said by the teacher. */
  title: string;
  /** Expected notes, MIDI numbers (60 = Do central). */
  notes: number[];
}

/** Public domain only: a scale, a traditional melody, Beethoven's Ninth (1824). */
export const LESSONS: readonly Lesson[] = [
  { id: "escala-do", title: "Escala de Do", notes: [60, 62, 64, 65, 67, 69, 71, 72] },
  { id: "estrellita", title: "Estrellita", notes: [60, 60, 67, 67, 69, 69, 67] },
  { id: "himno-alegria", title: "Himno de la alegría", notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62] },
];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

/** Longest list of expected or played notes an attempt may carry. */
export const MAX_ATTEMPT_NOTES = 64;
/** Longest attempt, and latest note time inside it, in ms. */
export const MAX_ATTEMPT_MS = 10 * 60_000;
const MIDI_MAX = 127;
/** The coach's reply cap, in tokens. */
export const COACH_MAX_TOKENS = 200;
/** Earlier attempts at the same lesson today that the coach sees. */
export const COACH_EARLIER = 3;

export type Mark = "right" | "wrong" | "missed";
const MARKS: readonly Mark[] = ["right", "wrong", "missed"];

/** `POST /practice/attempt`, as the phone sends it (design decision 5). */
export interface Attempt {
  lessonId: string;
  expected: number[];
  played: { midi: number; atMs: number }[];
  /** One per expected note. */
  marks: Mark[];
  /** Optional, one per expected note: the played MIDI note aligned to it, null when missed. */
  matched?: (number | null)[];
  /** Played notes the alignment left over. */
  extra: number;
  durationMs: number;
}

export type AttemptCheck = { ok: true; attempt: Attempt; lesson: Lesson } | { ok: false; error: string };

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
const isMidi = (n: unknown): n is number => isInt(n, 0, MIDI_MAX);

/** Checks an attempt's shape and bounds; the error says which field failed. */
export function validateAttempt(body: unknown): AttemptCheck {
  if (!body || typeof body !== "object") return { ok: false, error: "the attempt is not a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.lessonId !== "string") return { ok: false, error: "lessonId is not a string" };
  const lesson = lessonById(b.lessonId);
  if (!lesson) return { ok: false, error: `no lesson has the id ${JSON.stringify(b.lessonId.slice(0, 40))}` };
  const { expected, played, marks, matched, extra, durationMs } = b;
  if (!Array.isArray(expected) || expected.length === 0 || expected.length > MAX_ATTEMPT_NOTES || !expected.every(isMidi)) return { ok: false, error: `expected must be 1–${MAX_ATTEMPT_NOTES} MIDI notes (0–${MIDI_MAX})` };
  if (!Array.isArray(played) || played.length > MAX_ATTEMPT_NOTES) return { ok: false, error: `played must be at most ${MAX_ATTEMPT_NOTES} notes` };
  for (const p of played) {
    if (!p || typeof p !== "object" || !isMidi((p as { midi?: unknown }).midi) || !isInt((p as { atMs?: unknown }).atMs, 0, MAX_ATTEMPT_MS)) return { ok: false, error: `each played note needs midi 0–${MIDI_MAX} and atMs 0–${MAX_ATTEMPT_MS}` };
  }
  if (!Array.isArray(marks) || marks.length !== expected.length || !marks.every((m) => MARKS.includes(m as Mark))) return { ok: false, error: "marks must be right, wrong or missed, one per expected note" };
  if (matched !== undefined && (!Array.isArray(matched) || matched.length !== expected.length || !matched.every((m) => m === null || isMidi(m)))) return { ok: false, error: "matched must be a MIDI note or null, one per expected note" };
  if (!isInt(extra, 0, MAX_ATTEMPT_NOTES)) return { ok: false, error: `extra must be 0–${MAX_ATTEMPT_NOTES}` };
  if (!isInt(durationMs, 0, MAX_ATTEMPT_MS)) return { ok: false, error: `durationMs must be 0–${MAX_ATTEMPT_MS}` };
  return {
    ok: true,
    lesson,
    attempt: {
      lessonId: lesson.id,
      expected: expected as number[],
      played: (played as { midi: number; atMs: number }[]).map((p) => ({ midi: p.midi, atMs: p.atMs })),
      marks: marks as Mark[],
      ...(matched ? { matched: matched as (number | null)[] } : {}),
      extra,
      durationMs,
    },
  };
}

const SOLFEGE = ["Do", "Do sostenido", "Re", "Re sostenido", "Mi", "Fa", "Fa sostenido", "Sol", "Sol sostenido", "La", "La sostenido", "Si"];

/** A MIDI note's name in Spanish solfège, without the octave. */
export const noteName = (midi: number): string => SOLFEGE[((midi % 12) + 12) % 12]!;

/**
 * The played note at each expected position: the phone's `matched` when it sent one; otherwise, with
 * no extra notes, the played notes in order (right and wrong take one, missed none). Undefined where
 * it can't be known.
 */
function playedAt(a: Attempt): (number | undefined)[] {
  if (a.matched) return a.matched.map((m) => (m === null ? undefined : m));
  const taken = a.marks.filter((m) => m !== "missed").length;
  if (a.extra !== 0 || taken !== a.played.length) return a.marks.map(() => undefined);
  let next = 0;
  return a.marks.map((m) => (m === "missed" ? undefined : a.played[next++]!.midi));
}

export interface PracticeSummary {
  text: string;
  right: number;
  total: number;
}

/**
 * The day record's line for an attempt, e.g. «Piano · Himno de la alegría: 13 de 15 notas bien; falló
 * la 4.ª (tocó Fa en vez de Sol); 21 s». Only the first mistake is named.
 */
export function practiceSummary(lesson: Lesson, a: Attempt): PracticeSummary {
  const right = a.marks.filter((m) => m === "right").length;
  const total = a.marks.length;
  const parts = [`${right} de ${total} notas bien`];
  const first = a.marks.findIndex((m) => m !== "right");
  if (first >= 0) {
    const want = noteName(a.expected[first]!);
    if (a.marks[first] === "missed") parts.push(`faltó la ${first + 1}.ª (${want})`);
    else {
      const got = playedAt(a)[first];
      parts.push(`falló la ${first + 1}.ª (${got === undefined ? `era ${want}` : `tocó ${noteName(got)} en vez de ${want}`})`);
    }
  }
  if (a.extra > 0) parts.push(`${a.extra} ${a.extra === 1 ? "nota" : "notas"} de más`);
  parts.push(`${Math.round(a.durationMs / 1000)} s`);
  return { text: `Piano · ${lesson.title}: ${parts.join("; ")}`, right, total };
}

/** Summaries of the latest earlier attempts at a lesson since `since`, oldest first. */
export function earlierAttempts(entries: readonly { at: number; kind: string; lessonId?: string; text?: string }[], lessonId: string, since: number, n = COACH_EARLIER): string[] {
  return entries
    .filter((e) => e.kind === "practice" && e.lessonId === lessonId && e.at >= since && e.text)
    .slice(-n)
    .map((e) => e.text!);
}

export const COACH_PROMPT =
  "You are a warm, patient piano teacher from Colombia coaching a beginner who just played a short lesson on a piano or keyboard. " +
  "You get a summary of the attempt and, when there are any, their earlier attempts at the same lesson today. " +
  "Answer in Spanish, spoken directly to them (tú), in one or two short sentences, no lists, no markdown: " +
  "first what went well, then the single most useful thing to try next, naming the note in solfège (Do, Re, Mi, Fa, Sol, La, Si) and its position. " +
  "If this attempt has more notes right than an earlier one, say they improved. If every note was right, celebrate and suggest playing it a little faster or trying the next lesson. " +
  "Never invent a note, a mistake or a number that is not in the summary. Never say anything about health, pain, injuries or the body; this is not medical advice.";

/** The coach's request: the prompt, this attempt, and today's earlier attempts at the lesson. */
export function coachMessages(summary: string, earlier: readonly string[]): ChatMessage[] {
  const before = earlier.length ? `\n\nAntes, hoy:\n${earlier.map((s) => `- ${s}`).join("\n")}` : "";
  return [
    { role: "system", content: COACH_PROMPT },
    { role: "user", content: `Este intento: ${summary}${before}` },
  ];
}
