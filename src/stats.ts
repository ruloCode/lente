/** Nearest-rank percentile (p in 0..100). Undefined for an empty sample. */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function formatMs(ms: number | undefined): string {
  return ms === undefined ? "—" : `${Math.round(ms)} ms`;
}
