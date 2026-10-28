// Which diarized speaker is the wearer? The clip's microphone sits centimeters from
// their mouth, so their turns are the loudest. Pure logic: the hub feeds it frame
// loudness and finished turns. Labels (A, B…) belong to one transcription session,
// so the tracker is reset whenever the session restarts.

const FRAME_MS = 80;
/** Loudness history kept, in frames (10 minutes): turns are placed long before it wraps. */
const RING_FRAMES = 7500;
/** The wearer must be this many times louder than the next speaker. */
export const LOUDNESS_MARGIN = 2;
export const MIN_SPEAKERS = 2;
export const MIN_TURNS = 3;
const MAX_PENDING = 200;

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** RMS per audio frame, indexed by session audio time. */
export class LoudnessRing {
  private values = new Float32Array(RING_FRAMES);
  private next = 0;
  private frameMs: number;

  constructor(frameMs = FRAME_MS) {
    this.frameMs = frameMs;
  }

  /** Loudness of the next frame in session audio. */
  push(rms: number): void {
    this.values[this.next % RING_FRAMES] = rms;
    this.next++;
  }

  /** Median loudness of the frames that overlap [startMs, endMs); undefined if none are still held. */
  medianBetween(startMs: number, endMs: number): number | undefined {
    const first = Math.max(Math.floor(startMs / this.frameMs), this.next - RING_FRAMES, 0);
    const last = Math.min(Math.ceil(endMs / this.frameMs), this.next);
    const span: number[] = [];
    for (let i = first; i < last; i++) span.push(this.values[i % RING_FRAMES]);
    return median(span);
  }
}

interface PendingTurn {
  loudness?: number;
  speaker?: string;
  enrolled?: boolean;
  counted?: boolean;
}

export class WearerTracker {
  private perSpeaker = new Map<string, number[]>();
  private pending = new Map<string, PendingTurn>();
  private explicit: string | undefined;
  private turns = 0;

  /** A new transcription session reassigns labels: forget everything. */
  reset(): void {
    this.perSpeaker.clear();
    this.pending.clear();
    this.explicit = undefined;
    this.turns = 0;
  }

  /** A turn's loudness and its speaker label arrive separately, in either order. */
  noteLoudness(turnId: string, loudness: number | undefined): void {
    if (loudness !== undefined) this.update(turnId, { loudness });
  }

  noteSpeaker(turnId: string, speaker: string): void {
    this.update(turnId, { speaker });
  }

  /** The turn contained the enrollment phrase: whoever spoke it is the wearer. */
  noteEnrollment(turnId: string): void {
    this.update(turnId, { enrolled: true });
  }

  /** The wearer's label, or undefined while it is not clear. */
  wearer(): string | undefined {
    if (this.explicit) return this.explicit;
    if (this.perSpeaker.size < MIN_SPEAKERS || this.turns < MIN_TURNS) return undefined;
    const ranked = [...this.perSpeaker]
      .map(([label, values]) => ({ label, typical: median(values)! }))
      .sort((a, b) => b.typical - a.typical);
    return ranked[0].typical >= ranked[1].typical * LOUDNESS_MARGIN ? ranked[0].label : undefined;
  }

  private update(turnId: string, patch: PendingTurn): void {
    const turn = { ...this.pending.get(turnId), ...patch };
    this.pending.set(turnId, turn);
    if (turn.speaker !== undefined && turn.enrolled) this.explicit = turn.speaker;
    if (turn.speaker !== undefined && turn.loudness !== undefined && !turn.counted) {
      const values = this.perSpeaker.get(turn.speaker) ?? [];
      values.push(turn.loudness);
      this.perSpeaker.set(turn.speaker, values);
      this.turns++;
      turn.counted = true;
    }
    // Turns whose other half never arrives must not pile up.
    if (this.pending.size > MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "Lente, soy Rulo" / "Lente, I'm Rulo": true when the phrase names one of the wearer's names. */
export function isEnrollment(text: string, names: string[]): boolean {
  const heard = fold(text);
  const m = /\blente\b[\s,.:;!-]*(?:soy|yo soy|me llamo|i'?m|i am|this is)\s+([^\s,.!?]+)/.exec(heard);
  if (!m) return false;
  return names.some((n) => fold(n.trim()) === m[1]);
}
