// The nightly digests (add-accounts 5.2, design decision 8): at each user's local midnight the hub
// writes the day just ended, the week on Mondays and the month on the 1st, and when a night was
// missed (the hub was down) the next open catches up. The plan is pure: what is missing, from
// today, the days that have data and the digests that exist. Writing is sequential and stops at
// the first failure, so a later run picks up where it left off.

import type { DayEntry } from "./day-log.ts";
import { type Digest, type DigestCall, digestId, monthStart, weekStart, writeDayDigest, writeRollup } from "./digests.ts";
import type { Meeting } from "./meetings.ts";
import type { DigestStore } from "./stores.ts";

/** How far back a catch-up reaches, in days, so a long absence does not spend without bound. */
export const CATCH_UP_DAYS = 31;
/** The nightly run waits this long past midnight, so the day's last writes have landed. */
export const NIGHTLY_DELAY_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of an instant in a time zone. */
export function localDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** Milliseconds from `now` to the next midnight in a time zone. */
export function msToLocalMidnight(now: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + (now % 1000);
  return DAY_MS - elapsed;
}

/** The instant a local day (`YYYY-MM-DD`) starts in a time zone. */
export function localDayStart(day: string, timeZone: string): number {
  const noonUtc = Date.parse(`${day}T12:00:00Z`);
  return noonUtc + msToLocalMidnight(noonUtc, timeZone) - DAY_MS;
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextMonth = (month: string): string => {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
};

export type DigestJob = { scope: "day"; day: string } | { scope: "week"; periodStart: string } | { scope: "month"; periodStart: string };

/**
 * What is missing, oldest first: every past day with data and no digest (within the catch-up
 * window), then every finished week and month that has day digests and no digest of its own.
 */
export function planDigests(input: { today: string; daysWithData: Iterable<string>; existing: Iterable<string> }): DigestJob[] {
  const have = new Set(input.existing);
  const oldest = addDays(input.today, -CATCH_UP_DAYS);
  const days = [...new Set(input.daysWithData)].filter((d) => d < input.today && d >= oldest).sort();
  const jobs: DigestJob[] = [];
  const dayDigests = new Set([...have].filter((id) => id.startsWith("day:")).map((id) => id.slice(4)));
  for (const day of days) {
    if (!have.has(`day:${day}`)) jobs.push({ scope: "day", day });
    dayDigests.add(day);
  }
  const covered = [...dayDigests].filter((d) => d >= oldest).sort();
  for (const week of [...new Set(covered.map(weekStart))]) {
    if (addDays(week, 7) <= input.today && !have.has(`week:${week}`)) jobs.push({ scope: "week", periodStart: week });
  }
  for (const month of [...new Set(covered.map(monthStart))]) {
    if (nextMonth(month) <= input.today && !have.has(`month:${month}`)) jobs.push({ scope: "month", periodStart: month });
  }
  return jobs;
}

export interface CatchUpDeps {
  digests: DigestStore;
  /** The meetings (with notes) and record entries of one local day. */
  loadDay(day: string): Promise<{ meetings: Meeting[]; entries: DayEntry[] }>;
  call: DigestCall;
  now(): number;
}

/** Runs the plan in order; returns the ids written. A failure stops the run and is thrown. */
export async function runDigests(jobs: DigestJob[], deps: CatchUpDeps): Promise<string[]> {
  const written: string[] = [];
  const daysOf = async (from: string, to: string): Promise<Digest[]> => {
    const parts: Digest[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const digest = await deps.digests.get("day", d);
      if (digest) parts.push(digest);
    }
    return parts;
  };
  for (const job of jobs) {
    let digest: Digest;
    if (job.scope === "day") {
      const { meetings, entries } = await deps.loadDay(job.day);
      digest = await writeDayDigest({ day: job.day, meetings, entries }, deps.call, deps.now());
    } else {
      const end = job.scope === "week" ? addDays(job.periodStart, 7) : nextMonth(job.periodStart);
      digest = await writeRollup({ scope: job.scope, periodStart: job.periodStart, parts: await daysOf(job.periodStart, end) }, deps.call, deps.now());
    }
    await deps.digests.put(digest);
    written.push(digestId(digest));
  }
  return written;
}

/** Plans from what exists and runs it: the nightly job and the catch-up on open are the same call. */
export async function catchUp(input: { today: string; daysWithData: Iterable<string> }, deps: CatchUpDeps): Promise<string[]> {
  const existing: string[] = [];
  for (const scope of ["day", "week", "month"] as const) existing.push(...(await deps.digests.latest(scope, CATCH_UP_DAYS + 7)).map(digestId));
  return runDigests(planDigests({ ...input, existing }), deps);
}

type Timer = { clear(): void };

/**
 * One timer per user that fires shortly after their local midnight, runs `job`, and arms itself
 * again. `start` also runs the job once at once: that is the catch-up on open.
 */
export class NightlyDigests {
  private readonly timers = new Map<string, Timer>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => Timer;

  constructor(now: () => number = Date.now, setTimer: (fn: () => void, ms: number) => Timer = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return { clear: () => clearTimeout(t) };
  }) {
    this.now = now;
    this.setTimer = setTimer;
  }

  start(userId: string, timeZone: string, job: () => Promise<unknown>): void {
    this.stop(userId);
    const run = () => job().catch((error: Error) => console.error(`[digests] run for a user failed: ${error.message}`));
    void run();
    const arm = () => {
      this.timers.set(userId, this.setTimer(() => {
        void run();
        arm();
      }, msToLocalMidnight(this.now(), timeZone) + NIGHTLY_DELAY_MS));
    };
    arm();
  }

  stop(userId: string): void {
    this.timers.get(userId)?.clear();
    this.timers.delete(userId);
  }

  get active(): number {
    return this.timers.size;
  }
}
