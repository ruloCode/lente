// «Practicar» on the real piano, measured from the app's own timing lines (add-practice-mode design
// decision 7). It follows `adb logcat -s LentePractice` for a while and prints, per lesson: accuracy over
// the reference attempts (the first `--reference`, played correctly on purpose), every attempt's count,
// note onset → shown on screen p50/p90, and attempt → coaching line p50/p90.
//
//   node scripts/bench-practice.ts --seconds 600 --serial RFGYB098QCN --reference 3
//   adb logcat -s LentePractice | node scripts/bench-practice.ts --stdin --seconds 600
//
// The app logs numbers only (lesson ids are fixed names), so the raw lines can go to results/.

import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { percentile } from "../src/stats.ts";

export type PracticeLine =
  | { kind: "onset"; ms: number }
  | { kind: "attempt"; lesson: string; right: number; total: number }
  | { kind: "coach"; ms: number };

const ONSET = /\[practice\] onset(?:→|->)shown (\d+) ms\b/;
const ATTEMPT = /\[practice\] attempt lesson=([a-z0-9-]{1,40}) right=(\d+) total=(\d+)\b/;
const COACH = /\[practice\] coach (\d+) ms\b/;

/** One logcat (or hub) line → a timing line, or undefined for anything else. */
export function parsePracticeLine(line: string): PracticeLine | undefined {
  let m = ONSET.exec(line);
  if (m) return { kind: "onset", ms: Number(m[1]) };
  m = ATTEMPT.exec(line);
  if (m) {
    const right = Number(m[2]);
    const total = Number(m[3]);
    return right <= total ? { kind: "attempt", lesson: m[1]!, right, total } : undefined;
  }
  m = COACH.exec(line);
  return m ? { kind: "coach", ms: Number(m[1]) } : undefined;
}

export interface Spread {
  n: number;
  p50?: number;
  p90?: number;
}

export interface LessonResult {
  lesson: string;
  attempts: { right: number; total: number }[];
  /** Sum over the reference attempts. */
  reference: { right: number; total: number };
  onset: Spread;
  coach: Spread;
}

const spread = (values: number[]): Spread => (values.length ? { n: values.length, p50: percentile(values, 50), p90: percentile(values, 90) } : { n: 0 });

/**
 * Groups lines by lesson in log order: a note belongs to the next attempt, a coach line to the attempt
 * before it. The first `reference` attempts of each lesson make its accuracy.
 */
export function summarizePractice(lines: readonly PracticeLine[], reference: number): { lessons: LessonResult[]; unassignedOnsets: number } {
  const by = new Map<string, { attempts: { right: number; total: number }[]; onsets: number[]; coach: number[] }>();
  let pending: number[] = [];
  let last: string | undefined;
  for (const l of lines) {
    if (l.kind === "onset") pending.push(l.ms);
    else if (l.kind === "attempt") {
      const r = by.get(l.lesson) ?? { attempts: [], onsets: [], coach: [] };
      by.set(l.lesson, r);
      r.attempts.push({ right: l.right, total: l.total });
      r.onsets.push(...pending);
      pending = [];
      last = l.lesson;
    } else if (last) by.get(last)!.coach.push(l.ms);
  }
  const lessons = [...by].map(([lesson, r]): LessonResult => {
    const ref = r.attempts.slice(0, reference);
    return {
      lesson,
      attempts: r.attempts,
      reference: { right: ref.reduce((n, a) => n + a.right, 0), total: ref.reduce((n, a) => n + a.total, 0) },
      onset: spread(r.onsets),
      coach: spread(r.coach),
    };
  });
  return { lessons, unassignedOnsets: pending.length };
}

const ms = (v: number | undefined): string => (v === undefined ? "—" : `${Math.round(v)} ms`);
const s = (v: number | undefined): string => (v === undefined ? "—" : `${(v / 1000).toFixed(2)} s`);

/** The Markdown table for docs/benchmarks.md. */
export function formatPractice(sum: ReturnType<typeof summarizePractice>): string {
  const rows = sum.lessons.map((l) => {
    const pct = l.reference.total ? ` (${((100 * l.reference.right) / l.reference.total).toFixed(1)} %)` : "";
    return `| ${l.lesson} | ${l.attempts.length} | ${l.reference.right} of ${l.reference.total}${pct} | ${l.attempts.map((a) => `${a.right}/${a.total}`).join(" ")} | ${ms(l.onset.p50)} | ${ms(l.onset.p90)} | ${s(l.coach.p50)} | ${s(l.coach.p90)} |`;
  });
  return [
    "| Lesson | Attempts | Reference accuracy | Each attempt | Onset → shown p50 | p90 | Attempt → coach p50 | p90 |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Notes after the last attempt (not counted): ${sum.unassignedOnsets}`,
  ].join("\n");
}

function main(): void {
  const { values } = parseArgs({ options: { seconds: { type: "string", default: "600" }, serial: { type: "string" }, reference: { type: "string", default: "3" }, stdin: { type: "boolean", default: false }, label: { type: "string", default: "piano" } } });
  const runMs = Number(values.seconds) * 1000;
  const reference = Number(values.reference);
  if (!(runMs > 0) || !(reference >= 1)) throw new Error("--seconds and --reference must be positive numbers");
  let adb: ChildProcess | undefined;
  if (!values.stdin) {
    // Only lines from now on: -T takes an epoch time ("sssss.mmm").
    const since = (Date.now() / 1000).toFixed(3);
    adb = spawn("adb", [...(values.serial ? ["-s", values.serial] : []), "logcat", "-s", "LentePractice", "-T", since], { stdio: ["ignore", "pipe", "inherit"] });
    adb.on("error", (error) => {
      console.error(`bench-practice: could not run adb: ${error.message}`);
      process.exit(1);
    });
  }
  const started = Date.now();
  const kept: { at: number; line: string }[] = [];
  const parsed: PracticeLine[] = [];
  const input = createInterface({ input: adb ? adb.stdout! : process.stdin });
  const timer = setTimeout(() => input.close(), runMs);
  input.on("line", (raw) => {
    const line = parsePracticeLine(raw);
    if (!line) return;
    parsed.push(line);
    kept.push({ at: Date.now() - started, line: raw.slice(raw.indexOf("[practice]")) });
    process.stderr.write(line.kind === "attempt" ? `\n${line.lesson} ${line.right}/${line.total} ` : ".");
  });
  input.on("close", () => {
    clearTimeout(timer);
    adb?.kill();
    const summary = summarizePractice(parsed, reference);
    console.log(`\nPractice bench «${values.label}», ${new Date(started).toISOString()}, ${Math.round((Date.now() - started) / 1000)} s, reference = first ${reference} attempts per lesson\n`);
    console.log(formatPractice(summary));
    const dir = `results/practice-${new Date(started).toISOString().slice(0, 10)}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${values.label}-${started}.json`, JSON.stringify({ label: values.label, started, reference, summary, lines: kept }, null, 2));
    console.log(`\nRaw timing lines: ${dir}/${values.label}-${started}.json`);
    process.exit(0);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
