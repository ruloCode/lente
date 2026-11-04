// The daily spend caps (ship-hackathon decision 2): before a model, voice or transcription call for
// anyone but the owner, that account's spend today is checked against a per-user cap and everyone's
// spend today (the owner's left out) against a global one. Spend is what the usage meter prices (src/usage-meter.ts); the
// day is Bogotá's. Pure: the hub loads the day's totals from usage_daily (or a file) at start and
// feeds the ledger each runtime's new spend.

/** `LENTE_USER_DAY_CAP_USD`: many hours of chat and look, about two hours of listening at measured costs. */
export const DEFAULT_USER_DAY_CAP_USD = 1.0;
/**
 * `LENTE_GLOBAL_DAY_CAP_USD`: the US$ 98.26 of Meta credit left on 2026-11-04 (no card on file, so calls
 * fail at zero) over the 13 days Nov 4–16 is about US$ 78 at this cap, leaving a buffer for the owner
 * (exempt and not counted) and the benches.
 */
export const DEFAULT_GLOBAL_DAY_CAP_USD = 6.0;
/** The caps' day turns at midnight here. */
export const CAP_TIME_ZONE = "America/Bogota";

export type CapBlock = "user" | "global";
export type CapResult = "ok" | { blocked: CapBlock };

/** What the person hears instead of an answer: Spanish, short and kind. */
export const LIMIT_MESSAGES: Record<CapBlock, string> = {
  user: "Por hoy llegaste al límite de la prueba. Vuelve mañana.",
  global: "La demo llegó a su límite de hoy. Vuelve mañana.",
};

/** Thrown instead of making a call; its message is the line the person hears. */
export class SpendCapError extends Error {
  override name = "SpendCapError";
  readonly blocked: CapBlock;

  constructor(blocked: CapBlock) {
    super(LIMIT_MESSAGES[blocked]);
    this.blocked = blocked;
  }
}

export function capCheck(input: { userTodayUsd: number; allTodayUsd: number; userCapUsd: number; globalCapUsd: number; isOwner: boolean }): CapResult {
  if (input.isOwner) return "ok";
  if (input.userTodayUsd >= input.userCapUsd) return { blocked: "user" };
  if (input.allTodayUsd >= input.globalCapUsd) return { blocked: "global" };
  return "ok";
}

/** A cap from the environment in US$: a number ≥ 0, else the default. */
export function parseCapUsd(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The calendar day of `now` in a time zone, as `YYYY-MM-DD`. */
export function dayIn(now: number, timeZone = CAP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface DaySpend {
  day: string;
  /** US$ per user id, today. */
  users: Record<string, number>;
}

/** Where the day's totals survive a restart: usage_daily on Supabase, a JSON file on the laptop hub. */
export interface DaySpendStore {
  load(day: string): Promise<Record<string, number>>;
  save(spend: DaySpend): Promise<void>;
}

const usd = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** Today's spend per user and in all, rolled over at midnight in the caps' time zone. */
export class SpendLedger {
  private day: string;
  private users = new Map<string, number>();
  private total = 0;
  private readonly timeZone: string;

  constructor(saved?: DaySpend, now = Date.now(), timeZone = CAP_TIME_ZONE) {
    this.timeZone = timeZone;
    this.day = dayIn(now, timeZone);
    if (saved && saved.day === this.day) for (const [id, v] of Object.entries(saved.users)) this.add(id, v, now);
  }

  add(userId: string, spent: number, now = Date.now()): void {
    this.rollOver(now);
    const v = usd(spent);
    if (!v) return;
    this.users.set(userId, (this.users.get(userId) ?? 0) + v);
    this.total += v;
  }

  user(userId: string, now = Date.now()): number {
    this.rollOver(now);
    return this.users.get(userId) ?? 0;
  }

  all(now = Date.now()): number {
    this.rollOver(now);
    return this.total;
  }

  snapshot(now = Date.now()): DaySpend {
    this.rollOver(now);
    return { day: this.day, users: Object.fromEntries(this.users) };
  }

  private rollOver(now: number): void {
    const today = dayIn(now, this.timeZone);
    if (today === this.day) return;
    this.day = today;
    this.users.clear();
    this.total = 0;
  }
}

/**
 * One runtime's meter reports a running total for its own day; the ledger wants what is new. A total
 * lower than the last one means the meter rolled over to a new day, so all of it is new.
 */
export class MeterDelta {
  private last: number;

  constructor(start: number) {
    this.last = usd(start);
  }

  next(total: number): number {
    const t = usd(total);
    const delta = t >= this.last ? t - this.last : t;
    this.last = t;
    return delta;
  }
}

/** The routes that would spend, and how each answers when capped (the hub's pre-check). */
export type CappedRoute = "ask" | "listen" | "tts" | "model";

export function cappedRoute(method: string | undefined, path: string | undefined): CappedRoute | undefined {
  if (method !== "POST" || !path) return undefined;
  if (path === "/ask") return "ask";
  if (path === "/listen/on") return "listen";
  if (path === "/tts") return "tts";
  // Looks and live reads are not refused here: in Ver they must be said, so they reach the model call,
  // which throws the limit line for the hub to speak as a «VER» card and stop narration.
  if (path === "/help" || path === "/briefing" || path === "/summary") return "model";
  return undefined;
}
