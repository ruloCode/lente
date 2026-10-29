// The listening session the phone's live view follows: when it started, how long Lente has been
// listening without the pauses, and what a phone that connects mid-session receives. Pure: the
// hub owns the state and the sockets.

export interface SessionView {
  startedAt: number;
  /** Listening time up to the moment the view was taken, pauses excluded. */
  listenedMs: number;
  running: boolean;
}

/**
 * Runs while Lente listens with the clip connected and holds while it doesn't. A session lasts from
 * the first time it runs until it is ended; a pause holds it, the next start begins a new one.
 */
export class SessionClock {
  private startedAt?: number;
  private heldMs = 0;
  private runningSince?: number;

  run(now: number): void {
    if (this.startedAt === undefined) {
      this.startedAt = now;
      this.heldMs = 0;
    }
    this.runningSince ??= now;
  }

  hold(now: number): void {
    if (this.runningSince === undefined) return;
    this.heldMs += Math.max(0, now - this.runningSince);
    this.runningSince = undefined;
  }

  end(now: number): void {
    this.hold(now);
    this.startedAt = undefined;
    this.heldMs = 0;
  }

  /** Taken at send time, so each phone only adds what its own clock counts since it arrived. */
  view(now: number): SessionView | null {
    if (this.startedAt === undefined) return null;
    const running = this.runningSince !== undefined;
    return { startedAt: this.startedAt, listenedMs: Math.round(this.heldMs + (running ? Math.max(0, now - this.runningSince!) : 0)), running };
  }
}

/** What a phone receives when it connects, in order: the status, the recent history, then the turn in progress. */
export function connectEvents(input: { status: object; history: object[]; partial: string; listening: boolean; rest: object[] }): object[] {
  const events: object[] = [input.status, { kind: "history", items: input.history }];
  if (input.listening && input.partial) events.push({ kind: "partial", text: input.partial });
  return events.concat(input.rest);
}
