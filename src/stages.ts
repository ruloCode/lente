// Stage telemetry: when each step of a cue or a scene description happened, on the hub's wall
// clock, so a slow card can be blamed on one stage. Pure; the hub stamps, the phone acknowledges.

/** Wall-clock ms (Date.now()) at which each stage was reached. A photo has no `turn`. */
export interface Stages {
  /** The hub held the audio up to the end of the question, or the photo. */
  heard?: number;
  /** Transcription completed the turn. */
  turn?: number;
  /** The request that answered was sent to the model (after the speaker wait and the addressing check). */
  asked?: number;
  firstToken?: number;
  /** The reply finished. */
  done?: number;
  /** Written to the phones' event stream. */
  sent?: number;
  /** The phone's acknowledgement reached the hub: an upper bound on delivery, by one Wi-Fi hop. */
  phone?: number;
}

export const STAGE_ORDER = ["heard", "turn", "asked", "firstToken", "done", "sent", "phone"] as const;
export type StageName = (typeof STAGE_ORDER)[number];

export interface StageGap {
  /** The stage this time was spent reaching. */
  stage: StageName;
  ms: number;
}

/** Time spent reaching each stage from the previous one that was stamped. */
export function stageGaps(stages: Stages): StageGap[] {
  const gaps: StageGap[] = [];
  let previous: number | undefined;
  for (const stage of STAGE_ORDER) {
    const at = stages[stage];
    if (at === undefined) continue;
    if (previous !== undefined) gaps.push({ stage, ms: Math.max(0, at - previous) });
    previous = at;
  }
  return gaps;
}

/** One line for the hub's console: `heard→turn 812 · turn→asked 140 · …`. */
export function formatStages(stages: Stages): string {
  const present = STAGE_ORDER.filter((s) => stages[s] !== undefined);
  return stageGaps(stages)
    .map((g) => `${present[present.indexOf(g.stage) - 1]}→${g.stage} ${g.ms}`)
    .join(" · ");
}

/** About 80 s of 80 ms frames: far longer than any turn. */
const ARRIVALS_KEPT = 1000;

/**
 * When the hub received each stretch of session audio, so a turn's end (in session ms, as the
 * transcription reports it) can be turned back into the moment its last audio reached the hub.
 */
export class ArrivalClock {
  private ends: number[] = [];
  private ats: number[] = [];
  /** End of the oldest stretch forgotten: positions up to here can no longer be answered. */
  private forgottenMs = -1;

  /** Session audio up to `endMs` had arrived by `at`. */
  note(endMs: number, at: number): void {
    this.ends.push(endMs);
    this.ats.push(at);
    if (this.ends.length > ARRIVALS_KEPT) {
      this.forgottenMs = this.ends.shift()!;
      this.ats.shift();
    }
  }

  /** The first arrival that covered session position `ms`; undefined if not yet heard or already forgotten. */
  at(ms: number): number | undefined {
    if (ms <= this.forgottenMs) return undefined;
    for (let i = 0; i < this.ends.length; i++) if (this.ends[i] >= ms) return this.ats[i];
    return undefined;
  }
}
