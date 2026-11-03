// Turning transcribed turns into searchable segments with no model call (add-memory-engine decision 4).
// A segment closes on a pause of 8 s or more, on a new speaker once it has run 20 s, at 40 s, and at a
// meeting or episode boundary (the caller segments each meeting, and the speech outside meetings,
// separately). Each segment keeps the turns it covers, so a chip opens the meeting at its first turn.
// Pure.

export const SEGMENT_PAUSE_MS = 8_000;
export const SEGMENT_SPEAKER_CHANGE_AFTER_MS = 20_000;
export const SEGMENT_MAX_MS = 40_000;

export interface SegmentTurn {
  id: string;
  /** When the turn was completed; `startAt` when it began, if known. */
  at: number;
  startAt?: number;
  speaker?: string;
  text: string;
}

export interface Segment<T extends SegmentTurn = SegmentTurn> {
  /** 1-based, in order. */
  n: number;
  from: number;
  to: number;
  turns: T[];
  speakers: string[];
}

/** Segments of `turns` (sorted by time here), closed by the rules above. */
export function segmentTurns<T extends SegmentTurn>(turns: readonly T[]): Segment<T>[] {
  const out: Segment<T>[] = [];
  let cur: Segment<T> | undefined;
  for (const t of [...turns].filter((x) => x.text.trim()).sort((a, b) => (a.startAt ?? a.at) - (b.startAt ?? b.at))) {
    const start = Math.min(t.startAt ?? t.at, t.at);
    const speaker = t.speaker ?? "?";
    if (cur) {
      const pause = start - cur.to >= SEGMENT_PAUSE_MS;
      const tooLong = t.at - cur.from > SEGMENT_MAX_MS;
      const newSpeaker = !cur.speakers.includes(speaker) && cur.to - cur.from >= SEGMENT_SPEAKER_CHANGE_AFTER_MS;
      if (pause || tooLong || newSpeaker) cur = undefined;
    }
    if (!cur) {
      cur = { n: out.length + 1, from: start, to: t.at, turns: [], speakers: [] };
      out.push(cur);
    }
    cur.turns.push(t);
    cur.to = Math.max(cur.to, t.at);
    if (!cur.speakers.includes(speaker)) cur.speakers.push(speaker);
  }
  return out;
}
