// Idle auto-pause: an all-day clip pauses itself when the wearer hasn't spoken for a while, so a
// TV or an empty room doesn't keep transcription running. With no wearer label yet, it goes by
// the time since anyone spoke. Once the wearer was identified it keeps going by the wearer until
// listening starts again: every transcription session the silence gate reopens forgets the labels.
// A meeting started by hand keeps it listening (Solo grabar's own episodes don't: they open on any
// voice, a TV included). Pure: the hub tells it what it heard.

export const IDLE_PAUSE_MIN = 20;

export interface IdlePause {
  /** `wearer`: the wearer was silent; `anyone`: with no wearer known, nobody spoke. */
  basis: "wearer" | "anyone";
  silentMs: number;
}

export class IdleWatch {
  private idleMs: number;
  private since = 0;
  private anyoneAt = 0;
  private wearerAt = 0;
  /** The wearer was identified at some point of this listening run. */
  private wearerSeen = false;

  constructor(idleMs = IDLE_PAUSE_MIN * 60_000) {
    this.idleMs = idleMs;
  }

  /** Listening began: silence counts from here, not from speech heard before a pause. */
  start(at: number): void {
    this.since = at;
    this.anyoneAt = 0;
    this.wearerAt = 0;
    this.wearerSeen = false;
  }

  /** A speaker label was found to be the wearer: from now on only the wearer's voice counts. */
  wearerIdentified(): void {
    this.wearerSeen = true;
  }

  /** Someone spoke at `at`; `byWearer` when the turn was the wearer's. Late reports never move time back. */
  heard(at: number, byWearer: boolean): void {
    this.anyoneAt = Math.max(this.anyoneAt, at);
    if (byWearer) {
      this.wearerAt = Math.max(this.wearerAt, at);
      this.wearerSeen = true;
    }
  }

  /** Whether to pause now, and why; `wearerKnown` is whether the current session has a wearer label. */
  check(now: number, opts: { wearerKnown: boolean; meetingOpen: boolean }): IdlePause | undefined {
    if (opts.meetingOpen) return undefined;
    const basis = opts.wearerKnown || this.wearerSeen ? "wearer" : "anyone";
    const last = Math.max(this.since, basis === "wearer" ? this.wearerAt : this.anyoneAt);
    const silentMs = now - last;
    return silentMs >= this.idleMs ? { basis, silentMs } : undefined;
  }
}
