// Recuerdos on the phone (add-memory-timeline, first cut): each meeting or Solo grabar episode as a moment
// to relive like a short video. Its timeline is the meeting's segments one after another: a segment plays
// its kept speech audio (add-media-archive) when there is one, or lasts as long as its turns took; its
// lines fall where their turns sit inside it, and the photos kept while it was said show in turn. Silence
// between segments is skipped, so a moment plays only what was said. Pure: the hub passes its meetings and
// the media records it kept.

import { segmentTurns } from "./consolidate.ts";
import type { Meeting } from "./meetings.ts";
import type { MediaRecord } from "./stores.ts";

/** A segment with no audio lasts as long as its turns took, at least this long. */
const MIN_SCENE_S = 2;
/** Speech without timings is read at about this many characters a second. */
const CHARS_PER_S = 15;
/** Photos this close before or after a segment still belong to it. */
const FRAME_MARGIN_MS = 1500;
/** A segment with no photo of its own shows the last one kept up to this long before it. */
const FRAME_LOOKBACK_MS = 60_000;

export interface MomentLine {
  /** Seconds from the moment's start, on its playback timeline. */
  atS: number;
  who: string;
  text: string;
}

export interface MomentScene {
  startS: number;
  lengthS: number;
  /** Hub path of the segment's speech audio (WAV), when it was kept. */
  audio?: string;
}

export interface MomentFrame {
  atS: number;
  path: string;
}

export interface Moment {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
  summary: string;
  durationS: number;
  turns: number;
  lines: MomentLine[];
  scenes: MomentScene[];
  frames: MomentFrame[];
}

const mediaPath = (kind: "audio" | "frame", ref: string) => `/media/${kind}/${encodeURIComponent(ref)}`;

/** Who said a turn, as the phone shows it: the wearer is «Tú», others by their diarized label. */
export function speakerName(t: { wearer?: boolean; speaker?: string }): string {
  if (t.wearer) return "Tú";
  return t.speaker ? `Persona ${t.speaker}` : "Alguien";
}

/** One meeting as a moment; `media` is every record kept around its time (audio and frames). */
export function momentOf(m: Meeting, media: readonly MediaRecord[]): Moment {
  const audioBySegment = new Map(media.filter((r) => r.kind === "audio" && r.ref.startsWith(`s${m.id}:`)).map((r) => [r.ref, r]));
  const frames = media.filter((r) => r.kind === "frame").sort((a, b) => a.at - b.at);
  const lines: MomentLine[] = [];
  const scenes: MomentScene[] = [];
  const shown: MomentFrame[] = [];
  let cursor = 0;
  for (const s of segmentTurns(m.turns)) {
    const audio = audioBySegment.get(`s${m.id}:${s.n}`);
    // Each turn's weight in the segment: how long it took when the times are known, else its length in characters.
    const weights = s.turns.map((t) => {
      const took = t.startAt !== undefined ? (t.at - t.startAt) / 1000 : 0;
      return took > 0.3 ? took : Math.max(0.6, t.text.length / CHARS_PER_S);
    });
    const spoken = weights.reduce((a, b) => a + b, 0);
    const lengthS = audio ? audio.ms / 1000 : Math.max(MIN_SCENE_S, spoken);
    let offset = 0;
    s.turns.forEach((t, i) => {
      lines.push({ atS: round(cursor + (offset / spoken) * lengthS), who: speakerName(t), text: t.text });
      offset += weights[i]!;
    });
    // The photos taken while the segment was said, spread over its scene in the order they were taken.
    const span = Math.max(1, s.to - s.from);
    const own = frames.filter((f) => f.at >= s.from - FRAME_MARGIN_MS && f.at <= s.to + FRAME_MARGIN_MS);
    if (own.length) for (const f of own) shown.push({ atS: round(cursor + clamp((f.at - s.from) / span, 0, 1) * lengthS * 0.98), path: mediaPath("frame", f.ref) });
    else {
      const before = frames.filter((f) => f.at < s.from && f.at >= s.from - FRAME_LOOKBACK_MS).at(-1);
      // The player keeps the last photo up until the next one, so a photo already shown is not repeated.
      const path = before && mediaPath("frame", before.ref);
      if (path && shown.at(-1)?.path !== path) shown.push({ atS: round(cursor), path });
    }
    scenes.push({ startS: round(cursor), lengthS: round(lengthS), ...(audio ? { audio: mediaPath("audio", audio.ref) } : {}) });
    cursor += lengthS;
  }
  const endedAt = m.endedAt ?? m.turns.at(-1)?.at ?? m.startedAt;
  return {
    id: m.id,
    title: m.title || m.notes?.title || "Momento sin título",
    startedAt: m.startedAt,
    endedAt,
    summary: m.notes?.summary ?? "",
    durationS: round(cursor),
    turns: m.turns.length,
    lines,
    scenes,
    frames: shown.sort((a, b) => a.atS - b.atS),
  };
}

/** The latest `limit` meetings with something said, newest first. */
export function momentsOf(meetings: readonly Meeting[], media: readonly MediaRecord[], limit: number): Moment[] {
  return [...meetings]
    .filter((m) => m.turns.some((t) => t.text.trim()))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((m) => {
      const to = (m.endedAt ?? m.turns.at(-1)?.at ?? m.startedAt) + FRAME_MARGIN_MS;
      return momentOf(m, media.filter((r) => r.at >= m.startedAt - FRAME_LOOKBACK_MS && r.at <= to));
    });
}

const round = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
