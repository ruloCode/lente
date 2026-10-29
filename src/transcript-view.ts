// The live transcript the phone shows: one row per completed turn and a live row for the turn in
// progress, built from the hub's own events (status, history, partial, turn, speaker). Pure and
// import-free, so the phone page can carry these functions as they are.

/** The hub messages the transcript reads; anything else leaves it as it was. */
export type TranscriptEvent =
  | { kind: "status"; listening?: boolean; session?: { startedAt: number } | null }
  | { kind: "history"; items: Array<{ kind: string; at?: number; text?: string; speaker?: string; turnId?: string | number }> }
  | { kind: "partial"; text: string }
  | { kind: "turn"; at: number; text: string; speaker?: string; turnId?: string | number }
  | { kind: "speaker"; turnId: string | number; speaker: string }
  | { kind: string };

export interface TranscriptRow {
  /** Stable across the live event and the history: the hub stamps both with the same `at`. */
  key: string;
  turnId?: string;
  speaker?: string;
  text: string;
  at: number;
}

export interface TranscriptView {
  rows: TranscriptRow[];
  /** Text of the turn in progress; "" when nobody is mid-sentence or listening is paused. */
  live: string;
  paused: boolean;
  /** Start of the listening session: older turns belong to an earlier one and are not shown. */
  since: number;
  /** Speaker labels that arrived before their turn, by turn id. */
  pending: Record<string, string>;
}

export const TRANSCRIPT_MAX_ROWS = 300;

export function emptyTranscript(): TranscriptView {
  return { rows: [], live: "", paused: false, since: 0, pending: {} };
}

export function transcriptRowKey(at: number, text: string): string {
  return `${at}|${text}`;
}

/** Applies one hub message. Returns the same object when the message changes nothing. */
export function reduceTranscript(view: TranscriptView, event: TranscriptEvent): TranscriptView {
  const e = event as Record<string, any>;
  if (e.kind === "status") {
    const paused = e.listening === false;
    const since = e.session && typeof e.session.startedAt === "number" ? e.session.startedAt : view.since;
    if (paused === view.paused && since === view.since) return view;
    const rows = since > view.since ? view.rows.filter((r) => r.at >= since) : view.rows;
    return { ...view, rows, since, paused, live: paused ? "" : view.live, pending: since > view.since ? {} : view.pending };
  }
  if (e.kind === "partial") {
    const text = typeof e.text === "string" ? e.text : "";
    if (view.paused || text === view.live) return view;
    return { ...view, live: text };
  }
  if (e.kind === "turn") {
    const next = addTurns(view, [e]);
    return { ...next, live: "" };
  }
  if (e.kind === "history") {
    const turns = Array.isArray(e.items) ? e.items.filter((i: Record<string, any>) => i && i.kind === "turn") : [];
    // The hub sends the partial in progress right after the history, so an old live row goes.
    return { ...addTurns(view, turns), live: "" };
  }
  if (e.kind === "speaker" && e.turnId !== undefined && e.turnId !== null && typeof e.speaker === "string") {
    const turnId = String(e.turnId);
    // Turn ids restart with each transcription session: the newest row with the id is the one.
    for (let i = view.rows.length - 1; i >= 0; i--) {
      if (view.rows[i].turnId !== turnId) continue;
      if (view.rows[i].speaker === e.speaker) return view;
      const rows = view.rows.slice();
      rows[i] = { ...rows[i], speaker: e.speaker };
      return { ...view, rows };
    }
    return { ...view, pending: { ...view.pending, [turnId]: e.speaker } };
  }
  return view;
}

function addTurns(view: TranscriptView, turns: Array<Record<string, any>>): TranscriptView {
  const seen = new Set(view.rows.map((r) => r.key));
  const pending = { ...view.pending };
  const added: TranscriptRow[] = [];
  for (const t of turns) {
    if (typeof t.at !== "number" || typeof t.text !== "string" || !t.text || t.at < view.since) continue;
    const key = transcriptRowKey(t.at, t.text);
    if (seen.has(key)) continue;
    seen.add(key);
    const turnId = t.turnId === undefined || t.turnId === null ? undefined : String(t.turnId);
    let speaker = typeof t.speaker === "string" && t.speaker ? t.speaker : undefined;
    if (turnId !== undefined && pending[turnId] !== undefined) {
      speaker = speaker ?? pending[turnId];
      delete pending[turnId];
    }
    added.push({ key, turnId, speaker, text: t.text, at: t.at });
  }
  if (!added.length) return view;
  // A snapshot can bring turns older than the ones already shown; keep them oldest first.
  const rows = view.rows.concat(added).sort((a, b) => a.at - b.at);
  return { ...view, rows: rows.slice(-TRANSCRIPT_MAX_ROWS), pending };
}

/** The reducer as page script: the phone runs the very functions the tests cover, types stripped by Node. */
export const TRANSCRIPT_PAGE_SCRIPT = [`const TRANSCRIPT_MAX_ROWS = ${TRANSCRIPT_MAX_ROWS};`, emptyTranscript, transcriptRowKey, reduceTranscript, addTurns]
  .map(String)
  .join("\n");
