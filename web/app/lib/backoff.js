// @ts-check
// How long to wait before reconnecting the event stream: 1, 2, 4, 8… seconds, capped.

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/** Delay before reconnect attempt `attempt` (0 is the first retry). */
export function backoffDelay(/** @type {number} */ attempt, base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS) {
  if (!Number.isFinite(attempt) || attempt < 0) return base;
  return Math.min(max, base * 2 ** Math.min(attempt, 20));
}
