// A meeting is an episode: it starts and ends on the phone (or after a long silence),
// keeps the turns heard meanwhile and, once over, gets structured notes from a model.
// Pure logic: the hub keeps the clock, the store and the model call.

export const MEETING_SILENCE_MS = 10 * 60_000;
/** Fewer turns than this and the meeting is kept without notes. */
export const MIN_TURNS = 3;
const MAX_TITLE_CHARS = 80;

export interface MeetingTurn {
  /** `t1`, `t2`… in order within the meeting; notes cite these. */
  id: string;
  at: number;
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

export interface Notes {
  summary: string;
  decisions: Evidenced[];
  commitments: Commitment[];
  openQuestions: Evidenced[];
}

export type MeetingStatus = "running" | "extracting" | "done" | "too-short" | "failed";

export interface Meeting {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  endReason?: "manual" | "silence" | "restart";
  status: MeetingStatus;
  turns: MeetingTurn[];
  notes?: Notes;
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
    required: ["summary", "decisions", "commitments", "openQuestions"],
    properties: {
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
    },
  };
}

export const NOTES_PROMPT =
  "You write the notes of a meeting from its transcript. Lines look like `t3 YOU: text` or `t4 B: text`; " +
  "YOU is the person who wears the glasses. Answer in the language the meeting was held in. Give a summary of at most " +
  "two sentences, the decisions made, the commitments (what, owner, due date if one was said, else an empty string) " +
  "and the questions left open. For an owner use `you` for YOU, otherwise the name said in the meeting or the speaker " +
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
  const notes: Notes = {
    summary: text(input.summary).slice(0, 400),
    decisions: list(input.decisions, (o, evidence) => (text(o.text) ? { text: text(o.text), evidence } : undefined)),
    commitments: list(input.commitments, (o, evidence) =>
      text(o.what) ? { what: text(o.what), owner: text(o.owner) || "?", ...(text(o.due) ? { due: text(o.due) } : {}), evidence } : undefined,
    ),
    openQuestions: list(input.openQuestions, (o, evidence) => (text(o.text) ? { text: text(o.text), evidence } : undefined)),
  };
  return { notes, dropped };
}
