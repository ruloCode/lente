// Where the media archive taps the hub (add-media-archive 2.2, design decisions 1 and 2): the gate that
// says whether anything may be kept, and the collector that turns gated audio into one chunk per closed
// segment. Audio frames that passed the silence gate are kept for a short while with their session
// time; when a turn is transcribed, its own audio (the turn's start to end) is cut out; when its segment
// closes (decision 4 of add-memory-engine), the segment's turns become one ADPCM chunk named by the
// segment's id. Pure: the hub owns the clock, the store and the stream.

import { segmentTurns } from "./consolidate.ts";
import type { Meeting } from "./meetings.ts";
import { type AudioChunk, MIN_CHUNK_MS, encodeAdpcm } from "./media-chunks.ts";

/** Gated audio kept to cut turns from: a turn ends long before this. */
export const AUDIO_WINDOW_MS = 120_000;
/** Margin around a turn's span, so its first and last syllables are not cut. */
const TURN_MARGIN_MS = 200;

export interface MediaGate {
  /** `LENTE_MEDIA=off` stops storage for everyone at once (the rollback). */
  env?: string;
  switches: { audio: boolean; photos: boolean };
  /** The hub's owner: media is on for them by the owner's decision of 2026-11-03. */
  isOwner: boolean;
  /** The account accepted a terms version that describes media (add-consent; false until it exists). */
  acceptedMediaTerms: boolean;
}

/** Whether `kind` may be kept now: the switch, then the person (owner or consent), with the env as the kill switch. */
export function mediaAllowed(kind: "audio" | "photos", gate: MediaGate): boolean {
  if (gate.env === "off") return false;
  if (!gate.switches[kind]) return false;
  return gate.isOwner || gate.acceptedMediaTerms;
}

/** One meeting's speech audio, cut per turn, given out per closed segment. */
export class SegmentAudio {
  private frames: { ms: number; pcm: Uint8Array }[] = [];
  private readonly turns = new Map<string, Uint8Array>();
  private stored = 0;
  private meetingId: string | undefined;

  /** A gated frame and its position in the session's audio, ms. */
  push(pcm: Uint8Array, sessionMs: number): void {
    this.frames.push({ ms: sessionMs, pcm });
    const keepFrom = sessionMs - AUDIO_WINDOW_MS;
    while (this.frames.length && this.frames[0]!.ms < keepFrom) this.frames.shift();
  }

  /** A turn of `meeting` was transcribed, spoken from `startMs` to `endMs` of the session's audio. */
  turn(meeting: Pick<Meeting, "id">, turnId: string, startMs: number, endMs: number): void {
    if (this.meetingId !== meeting.id) this.reset(meeting.id);
    const parts = this.frames.filter((f) => f.ms >= startMs - TURN_MARGIN_MS && f.ms <= endMs + TURN_MARGIN_MS).map((f) => f.pcm);
    const pcm = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) (pcm.set(p, off), (off += p.length));
    this.turns.set(turnId, pcm);
  }

  /**
   * The chunks of the meeting's segments that closed since the last call: every segment but the open
   * last one, or all of them when the meeting `ended`. A segment with too little audio gives nothing.
   */
  closed(meeting: Pick<Meeting, "id" | "turns">, ended: boolean): AudioChunk[] {
    if (this.meetingId !== meeting.id) return [];
    const segments = segmentTurns(meeting.turns);
    const upTo = ended ? segments.length : segments.length - 1;
    const out: AudioChunk[] = [];
    for (const s of segments.slice(this.stored, Math.max(this.stored, upTo))) {
      const parts = s.turns.map((t) => this.turns.get(t.id)).filter((p): p is Uint8Array => Boolean(p));
      for (const t of s.turns) this.turns.delete(t.id);
      const pcm = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let off = 0;
      for (const p of parts) (pcm.set(p, off), (off += p.length));
      const ms = Math.round((pcm.length / 2 / 16_000) * 1000);
      if (ms >= MIN_CHUNK_MS) out.push({ segment: `s${meeting.id}:${s.n}`, at: s.from, ms, bytes: encodeAdpcm(pcm) });
    }
    this.stored = Math.max(this.stored, upTo);
    if (ended) this.reset(undefined);
    return out;
  }

  /** A switch turned off: nothing collected so far is kept. */
  drop(): void {
    this.frames = [];
    this.turns.clear();
  }

  private reset(meetingId: string | undefined): void {
    this.meetingId = meetingId;
    this.turns.clear();
    this.stored = 0;
  }
}
