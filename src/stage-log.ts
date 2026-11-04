// Reads the hub's own timing lines (`[stages] …` and `[live] …`/`[look] …`) back into numbers, so a bench
// can measure a running hub, local or on Modal, from its log alone (add-sight-mode 1.1). Pure: the
// caller feeds lines and the moment each one arrived.

import { percentile } from "./stats.ts";

/** One `[stages]` line: the entry's kind (and label), and each gap between consecutive stages in ms. */
export interface StageLine {
  kind: string;
  label?: string;
  gaps: Record<string, number>;
  /** heard → the last stage present, in ms. */
  total: number;
}

const STAGES_RE = /\[stages\] (\w+)(?: ([A-Z][A-Z ]*?))? · (.+?) ms\s*$/;
const GAP_RE = /(\w+)→(\w+) (\d+)/g;

export function parseStageLine(line: string): StageLine | undefined {
  const m = STAGES_RE.exec(line);
  if (!m) return undefined;
  const gaps: Record<string, number> = {};
  let total = 0;
  for (const g of m[3].matchAll(GAP_RE)) {
    const ms = Number(g[3]);
    gaps[`${g[1]}→${g[2]}`] = ms;
    total += ms;
  }
  if (!Object.keys(gaps).length) return undefined;
  return { kind: m[1], ...(m[2] ? { label: m[2].trim() } : {}), gaps, total };
}

/** One model call line: `[live] 1626 ms · 21 KB · ‹52 chars›`, `[live] 1400 ms · unchanged`, `[look] 1210 ms · …`. */
export interface CallLine {
  kind: "live" | "look";
  ms: number;
  unchanged: boolean;
  /** A Ver description dropped because it arrived too long after its frame. */
  stale: boolean;
  kb?: number;
}

const CALL_RE = /\[(live|look)\] (\d+) ms(?: · (\d+) KB)?(.*)$/;

export function parseCallLine(line: string): CallLine | undefined {
  const m = CALL_RE.exec(line);
  if (!m) return undefined;
  return { kind: m[1] as "live" | "look", ms: Number(m[2]), unchanged: /unchanged/.test(m[4]), stale: /\bstale\b/.test(m[4]), ...(m[3] ? { kb: Number(m[3]) } : {}) };
}

export interface Distribution {
  n: number;
  p50?: number;
  p90?: number;
  max?: number;
}

export function distribution(values: number[]): Distribution {
  return { n: values.length, p50: percentile(values, 50), p90: percentile(values, 90), max: values.length ? Math.max(...values) : undefined };
}

export interface SightSummary {
  /** Model time per live call, spoken or not. */
  liveModel: Distribution;
  /** Frame on the hub → description shown on the phone (every stage the line carries). */
  liveToPhone: Distribution;
  /** Between two descriptions that reached the phone, by arrival time of their lines. */
  liveInterval: Distribution;
  /** Live calls answered "unchanged" (nothing spoken) over all live calls. */
  unchanged: { n: number; of: number };
  /** Live descriptions dropped as stale over all live calls. */
  stale: { n: number; of: number };
  lookModel: Distribution;
  lookToPhone: Distribution;
}

/** Folds timed log lines into the sight bench's numbers. `at` is when each line arrived, in ms. */
export function summarizeSight(lines: { at: number; line: string }[]): SightSummary {
  const liveModel: number[] = [];
  const lookModel: number[] = [];
  const liveToPhone: number[] = [];
  const lookToPhone: number[] = [];
  const liveShownAt: number[] = [];
  let unchanged = 0;
  let stale = 0;
  for (const { at, line } of lines) {
    const call = parseCallLine(line);
    if (call) {
      (call.kind === "live" ? liveModel : lookModel).push(call.ms);
      if (call.kind === "live" && call.unchanged) unchanged++;
      if (call.kind === "live" && call.stale) stale++;
      continue;
    }
    const stage = parseStageLine(line);
    if (!stage) continue;
    if (stage.kind === "live") {
      liveToPhone.push(stage.total);
      liveShownAt.push(at);
    } else if (stage.kind === "cue" && (stage.label === "VER" || stage.label === "ON SCREEN")) {
      lookToPhone.push(stage.total);
    }
  }
  const intervals = liveShownAt.slice(1).map((t, i) => t - liveShownAt[i]);
  return {
    liveModel: distribution(liveModel),
    liveToPhone: distribution(liveToPhone),
    liveInterval: distribution(intervals),
    unchanged: { n: unchanged, of: liveModel.length },
    stale: { n: stale, of: liveModel.length },
    lookModel: distribution(lookModel),
    lookToPhone: distribution(lookToPhone),
  };
}
