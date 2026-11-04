// Live reads and looks as the wearer gets them, measured from the hub's own timing lines (add-sight-mode 1.1).
// It reads a hub's log for a while and prints model time, frame → shown on the phone, the interval between
// descriptions and how many reads were silent ("unchanged"). Works on a local hub or on Modal:
//
//   modal app logs lente-hub -f </dev/null | node scripts/bench-sight.ts --seconds 120 --skip 4 --label sight
//   pnpm pilot 2>&1 | node scripts/bench-sight.ts --seconds 120
//
// `--skip` drops the lines of the first seconds: `modal app logs -f` replays recent history before it follows.
// Start live reads (or Ver) from the phone while it runs. Lines are stamped when they reach this script, so
// intervals carry the log pipe's jitter (tens of ms on Modal). Raw lines, numbers only, go to results/.

import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { type Distribution, parseCallLine, parseStageLine, summarizeSight } from "../src/stage-log.ts";

const { values } = parseArgs({ options: { seconds: { type: "string", default: "120" }, skip: { type: "string", default: "0" }, label: { type: "string", default: "live" } } });
const RUN_MS = Number(values.seconds) * 1000;
const SKIP_MS = Number(values.skip) * 1000;
const label = values.label ?? "live";

const kept: { at: number; line: string }[] = [];
const started = Date.now();
const input = createInterface({ input: process.stdin });
const timer = setTimeout(() => input.close(), RUN_MS + SKIP_MS);

input.on("line", (raw) => {
  // Only timing lines are kept: they carry lengths and times, never what was seen or said.
  if (!parseCallLine(raw) && !parseStageLine(raw)) return;
  if (Date.now() - started < SKIP_MS) return;
  const line = raw.replace(/‹[^›]*›/g, "‹…›");
  kept.push({ at: Date.now() - started, line });
  process.stderr.write(".");
});

input.on("close", () => {
  clearTimeout(timer);
  const s = summarizeSight(kept);
  const row = (name: string, d: Distribution) => `| ${name} | ${d.n} | ${fmt(d.p50)} | ${fmt(d.p90)} | ${fmt(d.max)} |`;
  const out = [
    `Sight bench «${label}», ${new Date(started).toISOString()}, ${Math.round((Date.now() - started) / 1000)} s`,
    "",
    "| Measure | n | p50 | p90 | Max |",
    "|---|---|---|---|---|",
    row("Live: model call", s.liveModel),
    row("Live: frame on the hub → shown on the phone", s.liveToPhone),
    row("Live: between descriptions shown", s.liveInterval),
    row("Look: model call", s.lookModel),
    row("Look: frame on the hub → shown on the phone", s.lookToPhone),
    "",
    `Silent live reads (unchanged): ${s.unchanged.n} of ${s.unchanged.of}`,
    `Stale live reads dropped (over 6 s after their frame): ${s.stale.n} of ${s.stale.of}`,
  ].join("\n");
  console.log(`\n${out}`);
  const dir = `results/sight-${new Date(started).toISOString().slice(0, 10)}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${label}-${started}.json`, JSON.stringify({ label, started, summary: s, lines: kept }, null, 2));
  console.log(`\nRaw timing lines: ${dir}/${label}-${started}.json`);
  process.exit(0);
});

function fmt(ms: number | undefined): string {
  return ms === undefined ? "—" : `${(ms / 1000).toFixed(2)} s`;
}
