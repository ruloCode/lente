// Time-to-first-token for the fast cue layer, per Meta model and provider.
// Usage: pnpm bench:llm [runs]   (targets without an API key are skipped)

import { mkdirSync, writeFileSync } from "node:fs";
import { streamChat } from "../src/chat.ts";
import { chatTargets } from "../src/providers.ts";
import { formatMs, percentile } from "../src/stats.ts";

const runs = Number(process.argv[2] ?? 5);

const SYSTEM =
  "You whisper cues to someone in a live meeting held in their second language. " +
  "Answer with ONE sentence they can say out loud, under 90 characters, no preamble.";

// Short, realistic meeting moments: what the fast layer sees in production.
const MOMENTS = [
  'Product lead: "Rulo, what would you cut to ship by Friday?"',
  'Manager: "Any concerns before we commit to the new vendor?"',
  'Client: "Can you walk us through why the migration slipped two weeks?"',
  'Engineer: "Should we cache this at the edge or in the service?"',
  'Designer: "Does anyone have a strong opinion on the onboarding flow?"',
];

interface Row {
  target: string;
  ok: number;
  failed: number;
  ttftP50?: number;
  ttftP95?: number;
  totalP50?: number;
  sample?: string;
  error?: string;
}

const rows: Row[] = [];
for (const target of chatTargets()) {
  if (!target.apiKey) {
    console.log(`skip  ${target.label} (${target.keyEnv} not set)`);
    continue;
  }
  const ttft: number[] = [];
  const total: number[] = [];
  let sample: string | undefined;
  let error: string | undefined;
  for (let i = 0; i < runs; i++) {
    const moment = MOMENTS[i % MOMENTS.length];
    try {
      const r = await streamChat(target, [
        { role: "system", content: SYSTEM },
        { role: "user", content: moment },
      ]);
      if (r.ttftMs !== undefined) ttft.push(r.ttftMs);
      total.push(r.totalMs);
      sample ??= r.text.trim();
      console.log(`${target.id}  run ${i + 1}: ttft ${formatMs(r.ttftMs)} · total ${formatMs(r.totalMs)}`);
    } catch (e) {
      error = (e as Error).message;
      console.log(`${target.id}  run ${i + 1}: ${error}`);
    }
  }
  rows.push({
    target: target.label,
    ok: total.length,
    failed: runs - total.length,
    ttftP50: percentile(ttft, 50),
    ttftP95: percentile(ttft, 95),
    totalP50: percentile(total, 50),
    sample,
    error,
  });
}

console.log("\n| Target | OK | TTFT p50 | TTFT p95 | Total p50 | Sample |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.target} | ${r.ok}/${r.ok + r.failed} | ${formatMs(r.ttftP50)} | ${formatMs(r.ttftP95)} | ` +
      `${formatMs(r.totalP50)} | ${r.sample ?? r.error ?? ""} |`,
  );
}

mkdirSync("results", { recursive: true });
const file = `results/llm-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ runs, rows }, null, 2));
console.log(`\nSaved ${file}`);
