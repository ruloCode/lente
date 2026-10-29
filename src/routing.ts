// Which provider serves a job, in what order, and which ones to skip for now. Pure: the clock is
// passed in, so the policy is tested without waiting. Sockets and timers stay in the hub.

/** A reply cue has to land while the question still hangs in the air. */
export const CUE_FIRST_TOKEN_TIMEOUT_MS = 2_500;
export const STRIKES_BEFORE_COOLDOWN = 3;
export const COOLDOWN_MS = 120_000;

export interface Route {
  id: string;
  /** False when the provider has no key: skipped without an error. */
  configured: boolean;
}

export class RoutePolicy {
  private strikes = new Map<string, number>();
  private coolUntil = new Map<string, number>();

  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /**
   * The routes to try now, in order: configured, and not cooling down after repeated failures.
   * The last configured route is the last resort and never cools down: better a slow answer than none.
   */
  pick<T extends Route>(job: string, routes: T[]): T[] {
    const configured = routes.filter((r) => r.configured);
    const last = configured[configured.length - 1];
    return configured.filter((r) => r === last || !this.cooling(job, r.id));
  }

  cooling(job: string, id: string): boolean {
    const until = this.coolUntil.get(`${job}:${id}`);
    if (until === undefined) return false;
    if (this.now() < until) return true;
    // Cool-down over: give it a fresh start, so one more failure does not re-trigger it at once.
    this.coolUntil.delete(`${job}:${id}`);
    this.strikes.delete(`${job}:${id}`);
    return false;
  }

  succeeded(job: string, id: string): void {
    this.strikes.delete(`${job}:${id}`);
  }

  failed(job: string, id: string): void {
    const key = `${job}:${id}`;
    const n = (this.strikes.get(key) ?? 0) + 1;
    this.strikes.set(key, n);
    if (n >= STRIKES_BEFORE_COOLDOWN) {
      this.coolUntil.set(key, this.now() + COOLDOWN_MS);
      this.strikes.delete(key);
    }
  }
}
