// A meeting is an episode: it starts and ends on the phone (or after a long silence),
// keeps the turns heard meanwhile and, once over, gets structured notes from a model.
// In Solo grabar the hub opens and closes episodes on its own (`auto`).
// Pure logic: the hub keeps the clock, the store and the model call.

export const MEETING_SILENCE_MS = 10 * 60_000;
/** Fewer turns than this and the meeting is kept without notes. */
export const MIN_TURNS = 3;
const MAX_TITLE_CHARS = 80;
/** Generated titles are shorter than the ones the wearer types. */
export const MAX_GENERATED_TITLE_CHARS = 60;
export const TOPICS = ["Proyecto", "Cliente", "Equipo", "Entrevista", "Clase", "Personal", "Otro"] as const;
export type Topic = (typeof TOPICS)[number];

export interface MeetingTurn {
  /** `t1`, `t2`… in order within the meeting; notes cite these. */
  id: string;
  at: number;
  /** Wall-clock start of the turn (`at` is when it was completed); used for answer timing. */
  startAt?: number;
  /** The turn was a question aimed at the wearer (by name, reply or model; not the testing switch). */
  addressed?: boolean;
  /** Diarized label as heard; the wearer is marked separately because labels reset per session. */
  speaker?: string;
  wearer?: boolean;
  text: string;
}

export interface Evidenced {
  text: string;
  evidence: string[];
}

export interface Commitment {
  what: string;
  /** "you" for the wearer, otherwise the speaker label or name used. */
  owner: string;
  due?: string;
  evidence: string[];
}

/** A term the wearer may not know, with its meaning; the example is the cited turn. */
export interface GlossaryItem {
  term: string;
  meaning: string;
  evidence: string[];
}

export interface Notes {
  /** Generated Spanish title; the meeting only takes it when the wearer typed none. */
  title?: string;
  topic?: Topic;
  summary: string;
  glossary?: GlossaryItem[];
  decisions: Evidenced[];
  commitments: Commitment[];
  openQuestions: Evidenced[];
}

export type MeetingStatus = "running" | "extracting" | "done" | "too-short" | "failed";

export interface AskedAnswered {
  asked: number;
  answered: number;
}

export type EndReason = "manual" | "silence" | "restart" | "max-length" | "mode";

export interface Meeting {
  id: string;
  title: string;
  /** The title came from the notes, not from the wearer. */
  titleGenerated?: boolean;
  topic?: Topic;
  /** Opened by Solo grabar, not by the wearer. */
  auto?: boolean;
  startedAt: number;
  endedAt?: number;
  endReason?: EndReason;
  status: MeetingStatus;
  turns: MeetingTurn[];
  notes?: Notes;
  /** Questions aimed at the wearer and how many they answered within 20 s. */
  stats?: AskedAnswered;
  /** Items the model proposed without a valid turn behind them. */
  droppedItems?: number;
  error?: string;
}

export function newMeeting(title: string, now: number): Meeting {
  const stamp = new Date(now).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return { id: `m${stamp}`, title: title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS), startedAt: now, status: "running", turns: [] };
}

export function addTurn(meeting: Meeting, turn: Omit<MeetingTurn, "id">): MeetingTurn {
  const added = { ...turn, id: `t${meeting.turns.length + 1}` };
  meeting.turns.push(added);
  return added;
}

export const isTooShort = (meeting: Meeting): boolean => meeting.turns.length < MIN_TURNS;

export const silenceExpired = (lastSpeechAt: number, now: number, timeoutMs = MEETING_SILENCE_MS): boolean => now - lastSpeechAt >= timeoutMs;

/** Solo grabar: a pause this long closes the episode; no episode runs longer than the maximum. */
export const EPISODE_SILENCE_MS = 5 * 60_000;
export const EPISODE_MAX_MS = 60 * 60_000;

export interface EpisodePolicy {
  silenceMs: number;
  maxMs: number;
}

/** Why an automatic episode should end now, or undefined to keep it open. Silence wins when both apply. */
export function episodeEnd(
  episode: { startedAt: number; lastSpeechAt: number },
  now: number,
  policy: EpisodePolicy = { silenceMs: EPISODE_SILENCE_MS, maxMs: EPISODE_MAX_MS },
): "silence" | "max-length" | undefined {
  if (silenceExpired(episode.lastSpeechAt, now, policy.silenceMs)) return "silence";
  if (now - episode.startedAt >= policy.maxMs) return "max-length";
  return undefined;
}

// --- Extraction: schema, prompt and validation --------------------------------------------------

const evidenceSchema = (turnIds: string[]) => ({ type: "array", items: { type: "string", enum: turnIds } });
const evidenced = (turnIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["text", "evidence"],
  properties: { text: { type: "string" }, evidence: evidenceSchema(turnIds) },
});

/** JSON schema for `response_format`; evidence ids are limited to the turns that exist. */
export function notesSchema(turnIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "topic", "summary", "decisions", "commitments", "openQuestions", "glossary"],
    properties: {
      title: { type: "string", maxLength: MAX_GENERATED_TITLE_CHARS },
      topic: { type: "string", enum: [...TOPICS] },
      summary: { type: "string" },
      decisions: { type: "array", items: evidenced(turnIds) },
      commitments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["what", "owner", "due", "evidence"],
          properties: { what: { type: "string" }, owner: { type: "string" }, due: { type: "string" }, evidence: evidenceSchema(turnIds) },
        },
      },
      openQuestions: { type: "array", items: evidenced(turnIds) },
      glossary: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["term", "meaning", "evidence"],
          properties: { term: { type: "string" }, meaning: { type: "string" }, evidence: evidenceSchema(turnIds) },
        },
      },
    },
  };
}

export const NOTES_PROMPT =
  "You write the notes of a meeting from its transcript. Give it a short title in Spanish (at most 60 characters, no quotes) and one topic from the list in the schema. Lines look like `t3 YOU: text` or `t4 B: text`; " +
  "YOU is the person who wears the glasses. Write the summary, decisions, commitments and open questions in Spanish, " +
  "whatever language the meeting was held in; keep names, product terms and quoted words exactly as they were said. Give a summary of at most " +
  "two sentences, the decisions made, the commitments (what, owner, due date if one was said, else an empty string) " +
  "and the questions left open. Also list the glossary: terms, acronyms and idioms a Spanish speaker who learned English as a second language may not know, each with a one-line meaning in Spanish and the turn where it was said (skip common words). For an owner use `you` for YOU, otherwise the name said in the meeting or the speaker " +
  "letter. Every item must cite the turn ids that support it. Include only what was actually said; if there is none " +
  "of a kind, return an empty list.";

export function transcriptOf(meeting: Meeting): string {
  return meeting.turns.map((t) => `${t.id} ${t.wearer ? "YOU" : (t.speaker ?? "?")}: ${t.text}`).join("\n");
}

export function extractionMessages(meeting: Meeting) {
  return [
    { role: "system" as const, content: NOTES_PROMPT },
    { role: "user" as const, content: `Meeting${meeting.title ? ` "${meeting.title}"` : ""}:\n${transcriptOf(meeting)}` },
  ];
}

/** Models sometimes cite `t1 'quote'` instead of `t1`: keep the leading id when it is a real one. */
function validEvidence(raw: unknown, ids: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const kept = raw
    .map((e) => (typeof e === "string" ? /^t\d+/.exec(e.trim())?.[0] : undefined))
    .filter((e): e is string => e !== undefined && ids.has(e));
  return [...new Set(kept)];
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Keeps only items with at least one real turn behind them. This is where "grounded" is
 * enforced: the count of dropped items says how often the model made something up.
 */
export function validateNotes(raw: unknown, turnIds: string[]): { notes: Notes; dropped: number } {
  const ids = new Set(turnIds);
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  let dropped = 0;
  const list = <T>(value: unknown, make: (item: Record<string, unknown>, evidence: string[]) => T | undefined): T[] => {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const item of value) {
      const obj = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
      const evidence = validEvidence(obj.evidence, ids);
      const made = evidence.length ? make(obj, evidence) : undefined;
      if (made) out.push(made);
      else dropped++;
    }
    return out;
  };
  const title = text(input.title).replace(/\s+/g, " ").slice(0, MAX_GENERATED_TITLE_CHARS).trim();
  const topic = TOPICS.find((t) => t === text(input.topic));
  const notes: Notes = {
    ...(title ? { title } : {}),
    ...(topic ? { topic } : {}),
    summary: text(input.summary).slice(0, 400),
    decisions: list(input.decisions, (o, evidence) => (text(o.text) ? { text: text(o.text), evidence } : undefined)),
    commitments: list(input.commitments, (o, evidence) =>
      text(o.what) ? { what: text(o.what), owner: text(o.owner) || "?", ...(text(o.due) ? { due: text(o.due) } : {}), evidence } : undefined,
    ),
    glossary: list(input.glossary, (o, evidence) => (text(o.term) && text(o.meaning) ? { term: text(o.term).slice(0, 60), meaning: text(o.meaning).slice(0, 200), evidence } : undefined)),
    openQuestions: list(input.openQuestions, (o, evidence) => (text(o.text) ? { text: text(o.text), evidence } : undefined)),
  };
  return { notes, dropped };
}

/** Takes the topic always and the generated title only when the wearer typed none. */
export function applyTitleAndTopic(meeting: Meeting, notes: Notes): void {
  if (notes.topic) meeting.topic = notes.topic;
  if (!meeting.title && notes.title) {
    meeting.title = notes.title;
    meeting.titleGenerated = true;
  }
}

// --- Search ---------------------------------------------------------------------------------------

export interface SearchMatch {
  where: "title" | "summary" | "notes" | "transcript";
  /** The turn a transcript line came from, or the first turn an item cites. */
  turnId?: string;
  line: string;
}

export interface SearchResult {
  id: string;
  title: string;
  startedAt: number;
  matches: SearchMatch[];
}

/** Lower case with accents removed, so "Presupuesto" finds "presupuesto" and "reunión" finds "reunion". */
export const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const MAX_MATCHES_PER_MEETING = 5;

/** Plain-text search over titles, notes and transcripts; newest meeting first, no model call. */
export function searchMeetings(meetings: Meeting[], query: string): SearchResult[] {
  const needle = fold(query.trim().replace(/\s+/g, " "));
  if (!needle) return [];
  const results: SearchResult[] = [];
  for (const m of meetings) {
    const lines: SearchMatch[] = [{ where: "title", line: m.title }];
    const n = m.notes;
    if (n) {
      lines.push({ where: "summary", line: n.summary });
      for (const d of n.decisions) lines.push({ where: "notes", turnId: d.evidence[0], line: d.text });
      for (const c of n.commitments) lines.push({ where: "notes", turnId: c.evidence[0], line: c.what });
      for (const q of n.openQuestions) lines.push({ where: "notes", turnId: q.evidence[0], line: q.text });
      for (const g of n.glossary ?? []) lines.push({ where: "notes", turnId: g.evidence[0], line: `${g.term}: ${g.meaning}` });
    }
    for (const t of m.turns) lines.push({ where: "transcript", turnId: t.id, line: t.text });
    const matches = lines.filter((l) => l.line && fold(l.line).includes(needle));
    if (matches.length) results.push({ id: m.id, title: m.title, startedAt: m.startedAt, matches: matches.slice(0, MAX_MATCHES_PER_MEETING) });
  }
  return results.sort((a, b) => b.startedAt - a.startedAt);
}
