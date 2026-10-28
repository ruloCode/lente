// The labelled synthetic meeting set: scripted dialogues, who says each line and whether a
// question is aimed at the wearer. Pure: validation and timing; rendering lives in render.ts.

export const SET_FILE = "eval/dialogues.json";
export const DEFAULT_PAUSE_MS = 900;
const MIN_PAUSE_MS = 300;
const MAX_PAUSE_MS = 5000;

export interface SpeakerSpec {
  /** macOS `say` voice. */
  voice: string;
  /** Voice for lines marked `lang: "es"`, when the speaker has one. */
  voiceEs?: string;
  /** Linear volume (0–1]. The wearer is the loud one, the others are farther from the clip. */
  gain: number;
  wearer?: boolean;
}

export interface Line {
  speaker: string;
  text: string;
  lang?: "es";
  /** Silence after the line, in ms. */
  pauseMs?: number;
  question?: boolean;
  /** Only on questions: the question is aimed at the wearer. */
  addressedToWearer?: boolean;
}

export interface Dialogue {
  id: string;
  title: string;
  /** The wearer's names, as typed on the phone. */
  names: string[];
  speakers: Record<string, SpeakerSpec>;
  lines: Line[];
}

function fail(where: string, why: string): never {
  throw new Error(`${SET_FILE}: ${where}: ${why}`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Checks the shape and the label rules; throws an error naming the dialogue and line at fault. */
export function validateSet(raw: unknown): Dialogue[] {
  if (!Array.isArray(raw) || raw.length === 0) fail("set", "expected a non-empty array of dialogues");
  const ids = new Set<string>();
  return raw.map((d, n) => {
    if (!isObject(d)) fail(`dialogue #${n + 1}`, "not an object");
    const id = d.id;
    if (!nonEmpty(id) || !/^[a-z0-9-]+$/.test(id)) fail(`dialogue #${n + 1}`, "id must be lowercase letters, digits and dashes");
    if (ids.has(id)) fail(id, "duplicate id");
    ids.add(id);
    if (!nonEmpty(d.title)) fail(id, "missing title");
    if (!Array.isArray(d.names) || !d.names.length || !d.names.every(nonEmpty)) fail(id, "names must list the wearer's names");
    if (!isObject(d.speakers)) fail(id, "missing speakers");
    const speakers = d.speakers as Record<string, unknown>;
    let wearers = 0;
    for (const [key, s] of Object.entries(speakers)) {
      if (!isObject(s) || !nonEmpty(s.voice)) fail(`${id} speaker ${key}`, "needs a voice");
      if (typeof s.gain !== "number" || !(s.gain > 0 && s.gain <= 1)) fail(`${id} speaker ${key}`, "gain must be in (0, 1]");
      if (s.voiceEs !== undefined && !nonEmpty(s.voiceEs)) fail(`${id} speaker ${key}`, "voiceEs must be a voice name");
      if (s.wearer === true) wearers++;
    }
    if (wearers !== 1) fail(id, `needs exactly one wearer speaker, found ${wearers}`);
    if (!Array.isArray(d.lines) || d.lines.length < 3) fail(id, "needs at least 3 lines");
    d.lines.forEach((l: unknown, i: number) => {
      const where = `${id} line ${i + 1}`;
      if (!isObject(l)) fail(where, "not an object");
      if (!nonEmpty(l.speaker) || !(l.speaker in speakers)) fail(where, `unknown speaker ${JSON.stringify(l.speaker)}`);
      if (!nonEmpty(l.text)) fail(where, "empty text");
      if (l.lang !== undefined) {
        if (l.lang !== "es") fail(where, 'lang can only be "es"');
        if (!nonEmpty((speakers[l.speaker] as SpeakerSpec).voiceEs)) fail(where, "Spanish line but the speaker has no voiceEs");
      }
      if (l.pauseMs !== undefined && !(typeof l.pauseMs === "number" && l.pauseMs >= MIN_PAUSE_MS && l.pauseMs <= MAX_PAUSE_MS)) {
        fail(where, `pauseMs must be ${MIN_PAUSE_MS}–${MAX_PAUSE_MS}`);
      }
      const isQuestion = l.question === true;
      if (l.question !== undefined && typeof l.question !== "boolean") fail(where, "question must be true or absent");
      if (l.addressedToWearer !== undefined) {
        if (l.addressedToWearer !== true) fail(where, "addressedToWearer must be true or absent");
        if (!isQuestion) fail(where, "addressedToWearer only applies to questions");
        if ((speakers[l.speaker] as SpeakerSpec).wearer) fail(where, "the wearer does not address themself");
      }
    });
    return d as unknown as Dialogue;
  });
}

export interface LineTiming {
  startMs: number;
  endMs: number;
}

/** Start/end of every line given each rendered line's length, with the silence after each. */
export function timeline(lineMs: number[], pausesMs: number[], leadMs = 0): { lines: LineTiming[]; totalMs: number } {
  let at = leadMs;
  const lines = lineMs.map((ms, i) => {
    const timing = { startMs: at, endMs: at + ms };
    at = timing.endMs + pausesMs[i];
    return timing;
  });
  return { lines, totalMs: at };
}

export const pauseOf = (line: Line): number => line.pauseMs ?? DEFAULT_PAUSE_MS;

/** What the labels say the hub should do: questions, and those aimed at the wearer. */
export function labelCounts(set: Dialogue[]): { lines: number; questions: number; addressed: number } {
  const lines = set.flatMap((d) => d.lines);
  return { lines: lines.length, questions: lines.filter((l) => l.question).length, addressed: lines.filter((l) => l.addressedToWearer).length };
}
