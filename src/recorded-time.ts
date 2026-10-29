// How long Lente has recorded today, measured from the audio the hub actually received (not
// wall-clock time listening), so a paused clip or a dropped link adds nothing. Pure: the hub
// loads and saves the snapshot in data/recorded.json.

import { dayKey } from "./day-log.ts";

export interface RecordedSnapshot {
  day: string;
  ms: number;
}

export class RecordedToday {
  private day: string;
  private ms: number;

  constructor(saved: Partial<RecordedSnapshot> | undefined, now = Date.now()) {
    const valid = saved && saved.day === dayKey(now) && typeof saved.ms === "number" && Number.isFinite(saved.ms) && saved.ms >= 0;
    this.day = dayKey(now);
    this.ms = valid ? (saved.ms as number) : 0;
  }

  /** Adds received audio; a new local day starts again from zero. */
  add(audioMs: number, now = Date.now()): void {
    this.rollOver(now);
    if (audioMs > 0) this.ms += audioMs;
  }

  /** Milliseconds recorded on the local day of `now`. */
  total(now = Date.now()): number {
    this.rollOver(now);
    return Math.round(this.ms);
  }

  snapshot(now = Date.now()): RecordedSnapshot {
    return { day: dayKey(now), ms: this.total(now) };
  }

  private rollOver(now: number): void {
    const today = dayKey(now);
    if (today === this.day) return;
    this.day = today;
    this.ms = 0;
  }
}
