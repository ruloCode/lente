// Turning what a replay recorded into numbers. Pure: the runner collects the events, this
// matches them to the labelled lines and computes latencies and addressing scores.

import { STAGE_ORDER, type StageName, type Stages, stageGaps } from "../../src/stages.ts";
import type { Dialogue, LineTiming } from "./set.ts";

/** A turn the hub reported. `atMs` is when the runner received it, counted from the clip's audio start. */
export interface RawTurn {
  turnId: string;
  startMs: number;
  endMs: number;
  atMs: number;
  text: string;
  speaker?: string;
}

export interface RawCue {
  turnId: string;
  atMs: number;
  /** Model time reported by the hub for the reply. */
  modelMs?: number;
}

export interface RawUsage {
  label: string;
  ms: number;
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
}

/** A turn must cover at least this share of a line (or the line of the turn) to be matched to it. */
export const MIN_OVERLAP = 0.5;

/** Nearest-rank percentile; `undefined` for an empty list. */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export interface Spread {
  n: number;
  p50?: number;
  p95?: number;
}

export const spread = (values: number[]): Spread => ({ n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) });

const overlapMs = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) => Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));

/** The turn that covers most of a line, or undefined when none covers at least half of it. */
export function turnForLine(line: LineTiming, turns: RawTurn[]): RawTurn | undefined {
  let best: RawTurn | undefined;
  let bestMs = 0;
  for (const t of turns) {
    const ms = overlapMs(line, t);
    if (ms > bestMs) [best, bestMs] = [t, ms];
  }
  return best && bestMs >= MIN_OVERLAP * (line.endMs - line.startMs) ? best : undefined;
}

export interface LineResult {
  index: number;
  question: boolean;
  /** The label: this question is aimed at the wearer. */
  addressed: boolean;
  turnId?: string;
  /** The hub put a card up for the turn this line is in. */
  cued: boolean;
  finalizeMs?: number;
  cueMs?: number;
  modelMs?: number;
}

/**
 * Joins the labels with what the hub did, line by line. When the transcription merged several lines
 * into one turn, that turn's cue belongs to its question lines (or its last line if none is a
 * question), and its latencies are counted from the end of its last line: it cannot be finished earlier.
 */
export function matchLines(dialogue: Dialogue, timings: LineTiming[], turns: RawTurn[], cues: RawCue[]): { lines: LineResult[]; mergedTurns: number } {
  const matched = dialogue.lines.map((line, index) => ({ line, index, timing: timings[index], turn: turnForLine(timings[index], turns) }));
  const groups = new Map<string, typeof matched>();
  for (const m of matched) if (m.turn) groups.set(m.turn.turnId, [...(groups.get(m.turn.turnId) ?? []), m]);
  const lines = matched.map(({ line, index, turn }): LineResult => {
    const group = turn ? groups.get(turn.turnId)! : [];
    const cue = turn ? cues.find((c) => c.turnId === turn.turnId) : undefined;
    const questions = group.filter((g) => g.line.question === true);
    const owners = questions.length ? questions : group.slice(-1);
    const owns = group.length <= 1 || owners.some((o) => o.index === index);
    const lastEnd = group.length ? Math.max(...group.map((g) => g.timing.endMs)) : 0;
    return {
      index,
      question: line.question === true,
      addressed: line.addressedToWearer === true,
      turnId: turn?.turnId,
      cued: cue !== undefined && owns,
      finalizeMs: turn ? Math.round(turn.atMs - lastEnd) : undefined,
      cueMs: cue && owns ? Math.round(cue.atMs - lastEnd) : undefined,
      modelMs: cue && owns ? cue.modelMs : undefined,
    };
  });
  return { lines, mergedTurns: [...groups.values()].filter((g) => g.length > 1).length };
}

export interface Scores {
  /** Of the cues shown, the share that were aimed at the wearer. */
  precision?: number;
  /** Of the questions aimed at the wearer, the share that got a cue. */
  recall?: number;
  /** Of the questions not aimed at the wearer, the share that still got a cue. */
  falseCueRate?: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Cues on lines labelled as statements (the hub took them for questions). */
  cuesOnStatements: number;
  questions: number;
  questionsHeard: number;
}

const ratio = (a: number, b: number): number | undefined => (b === 0 ? undefined : a / b);

export function scoreLines(results: LineResult[]): Scores {
  const tp = results.filter((r) => r.addressed && r.cued).length;
  const fn = results.filter((r) => r.addressed && !r.cued).length;
  const fp = results.filter((r) => !r.addressed && r.cued).length;
  const otherQuestions = results.filter((r) => r.question && !r.addressed);
  return {
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    falseCueRate: ratio(otherQuestions.filter((r) => r.cued).length, otherQuestions.length),
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    cuesOnStatements: results.filter((r) => !r.question && r.cued).length,
    questions: results.filter((r) => r.question).length,
    questionsHeard: results.filter((r) => r.question && r.turnId !== undefined).length,
  };
}

export interface Tokens {
  prompt: number;
  cached: number;
  completion: number;
  calls: number;
}

export function sumUsage(usage: RawUsage[]): Tokens {
  return usage.reduce<Tokens>(
    (t, u) => ({ prompt: t.prompt + (u.promptTokens ?? 0), cached: t.cached + (u.cachedTokens ?? 0), completion: t.completion + (u.completionTokens ?? 0), calls: t.calls + 1 }),
    { prompt: 0, cached: 0, completion: 0, calls: 0 },
  );
}

/** Time spent reaching each stage, pooled over cues, so the slow stage of a run stands out. */
export function stageSpreads(all: Stages[]): Partial<Record<StageName, Spread>> {
  const gaps = all.flatMap(stageGaps);
  const out: Partial<Record<StageName, Spread>> = {};
  for (const stage of STAGE_ORDER) {
    const values = gaps.filter((g) => g.stage === stage).map((g) => g.ms);
    if (values.length) out[stage] = spread(values);
  }
  return out;
}

export interface Summary {
  dialogues: number;
  scores: Scores;
  finalize: Spread;
  cue: Spread;
  modelMs: Spread;
  mergedTurns: number;
  tokensPerMeeting: Tokens;
  /** Per-stage time of the cues (see src/stages.ts). */
  stages: Partial<Record<StageName, Spread>>;
}

/** Everything from several dialogues at once; latencies are pooled, tokens are averaged per meeting. */
export function summarize(runs: { results: LineResult[]; mergedTurns: number; usage: RawUsage[]; stages?: Stages[] }[]): Summary {
  const all = runs.flatMap((r) => r.results);
  const total = sumUsage(runs.flatMap((r) => r.usage));
  const per = (n: number) => (runs.length ? Math.round(n / runs.length) : 0);
  return {
    dialogues: runs.length,
    scores: scoreLines(all),
    finalize: spread(all.flatMap((r) => (r.finalizeMs === undefined ? [] : [r.finalizeMs]))),
    cue: spread(all.flatMap((r) => (r.cueMs === undefined ? [] : [r.cueMs]))),
    modelMs: spread(all.flatMap((r) => (r.modelMs === undefined ? [] : [r.modelMs]))),
    mergedTurns: runs.reduce((n, r) => n + r.mergedTurns, 0),
    tokensPerMeeting: { prompt: per(total.prompt), cached: per(total.cached), completion: per(total.completion), calls: per(total.calls) },
    stages: stageSpreads(runs.flatMap((r) => r.stages ?? [])),
  };
}
