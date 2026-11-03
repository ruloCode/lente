// The database in /health (add-accounts 4.5, design decision 13): one timed select with the secret
// key, reported as ok, slow, paused, unreachable or refused, never with content. A paused Free-plan
// project must show as failing, not as missing memory. Pure but for the injected ping.

import { SupabaseError } from "./supabase-rest.ts";

export type DbState = "ok" | "slow" | "paused" | "unreachable" | "refused";

/** Over this the database is reported slow (still usable). */
export const DB_SLOW_MS = 1000;
/** A ping that takes longer is unreachable. */
export const DB_TIMEOUT_MS = 5000;
/** How long a result is reused, so health checks and the phone do not hammer the database. */
export const DB_CHECK_TTL_MS = 15_000;

export interface DbCheck {
  state: DbState;
  /** How long the ping took, in ms (absent when it never answered). */
  ms?: number;
  at: number;
}

/** The state an error from the ping stands for. 540 is Supabase's answer for a paused project; 503 is treated the same until 1.1 confirms the live response. */
export function dbStateOf(error: unknown): DbState {
  if (error instanceof SupabaseError) {
    if (error.status === 401 || error.status === 403) return "refused";
    if (error.status === 540 || error.status === 503) return "paused";
  }
  return "unreachable";
}

export const dbFailing = (state: DbState): boolean => state !== "ok" && state !== "slow";

export class DatabaseHealth {
  private last: DbCheck | undefined;
  private pending: Promise<DbCheck> | undefined;
  private readonly ping: () => Promise<unknown>;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(ping: () => Promise<unknown>, now: () => number = Date.now, timeoutMs = DB_TIMEOUT_MS) {
    this.ping = ping;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  /** The latest result, fresh within the TTL; concurrent callers share one ping. */
  check(): Promise<DbCheck> {
    if (this.last && this.now() - this.last.at < DB_CHECK_TTL_MS) return Promise.resolve(this.last);
    this.pending ??= this.run().finally(() => (this.pending = undefined));
    return this.pending;
  }

  /** The last result without pinging (for the status the phone gets). */
  peek(): DbCheck | undefined {
    return this.last;
  }

  private async run(): Promise<DbCheck> {
    const start = this.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), this.timeoutMs);
    });
    try {
      await Promise.race([this.ping(), timeout]);
      const ms = this.now() - start;
      this.last = { state: ms > DB_SLOW_MS ? "slow" : "ok", ms, at: this.now() };
    } catch (error) {
      this.last = { state: dbStateOf(error), at: this.now() };
    } finally {
      clearTimeout(timer);
    }
    return this.last;
  }
}
