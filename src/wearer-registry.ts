// One runtime per wearer (add-accounts 6.1, design decision 9): created on the user's first
// request or socket, evicted after 30 minutes with no phone following, no device connected and
// nothing listening, its writes flushed and its data key dropped. The laptop's single owner is
// pinned and never evicted. Pure but for the runtimes it is given.

/** A runtime with no connection and nothing listening is evicted after this long. */
export const RUNTIME_IDLE_MS = 30 * 60 * 1000;
/** How often idle runtimes are looked for. */
export const EVICT_CHECK_MS = 60 * 1000;
/** What a user hears when the hub already has as many people listening as it can hold. */
export const BUSY_MESSAGE = "Lente está al máximo de personas escuchando ahora. Prueba de nuevo en unos minutos.";

/** `LENTE_MAX_LISTENING`: a positive whole number, or no cap when unset. */
export function parseListeningCap(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const cap = Number(raw);
  if (!Number.isInteger(cap) || cap < 1) throw new Error(`LENTE_MAX_LISTENING must be a whole number of at least 1, got ${raw}`);
  return cap;
}

/** May one more user start listening, with `others` already listening? */
export const mayStartListening = (others: number, cap: number | undefined): boolean => cap === undefined || others < cap;

export interface Runtime {
  /** A phone follows, a device is connected, listening is on, or a meeting is open. */
  busy(): boolean;
  /** Flushes pending writes, ends the streams and clears the timers. */
  close(): Promise<void>;
}

export class WearerRegistry<R extends Runtime> {
  private readonly runtimes = new Map<string, { runtime: R; idleSince?: number }>();
  private readonly create: (userId: string) => R;
  private readonly idleMs: number;
  private readonly pinned: Set<string>;
  private readonly onEvict: (userId: string) => void;
  private readonly now: () => number;

  constructor(create: (userId: string) => R, options: { idleMs?: number; pinned?: Iterable<string>; onEvict?: (userId: string) => void; now?: () => number } = {}) {
    this.create = create;
    this.idleMs = options.idleMs ?? RUNTIME_IDLE_MS;
    this.pinned = new Set(options.pinned ?? []);
    this.onEvict = options.onEvict ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  /** The user's runtime, created on first use. Using it counts as activity. */
  get(userId: string): R {
    let entry = this.runtimes.get(userId);
    if (!entry) {
      entry = { runtime: this.create(userId) };
      this.runtimes.set(userId, entry);
    }
    entry.idleSince = undefined;
    return entry.runtime;
  }

  /** Closes and forgets one runtime now (an account being deleted), then runs the eviction hook. */
  async evict(userId: string): Promise<void> {
    const entry = this.runtimes.get(userId);
    this.runtimes.delete(userId);
    try {
      if (entry) await entry.runtime.close();
    } finally {
      this.onEvict(userId);
    }
  }

  /** Forgets a runtime that failed to open, without closing it. */
  drop(userId: string): void {
    this.runtimes.delete(userId);
  }

  has(userId: string): boolean {
    return this.runtimes.has(userId);
  }

  get size(): number {
    return this.runtimes.size;
  }

  /** How many runtimes match, e.g. how many are listening. */
  count(match: (runtime: R, userId: string) => boolean): number {
    let n = 0;
    for (const [userId, { runtime }] of this.runtimes) if (match(runtime, userId)) n++;
    return n;
  }

  each(fn: (runtime: R, userId: string) => void): void {
    for (const [userId, { runtime }] of this.runtimes) fn(runtime, userId);
  }

  /** Closes and forgets every runtime idle for longer than the limit; returns whose. */
  async evictIdle(): Promise<string[]> {
    const now = this.now();
    const evicted: string[] = [];
    for (const [userId, entry] of this.runtimes) {
      if (this.pinned.has(userId) || entry.runtime.busy()) {
        entry.idleSince = undefined;
        continue;
      }
      entry.idleSince ??= now;
      if (now - entry.idleSince < this.idleMs) continue;
      this.runtimes.delete(userId);
      try {
        await entry.runtime.close();
      } finally {
        this.onEvict(userId);
      }
      evicted.push(userId);
    }
    return evicted;
  }
}
