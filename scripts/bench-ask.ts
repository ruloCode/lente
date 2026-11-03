// Times the chat's answer paths on a synthetic bilingual memory (add-memory-engine 1.1): the production
// path (`askTiers`: plan call, lookup, answer call), the laptop path (`ask`: one call over the last 7
// days) and, once it exists, the fast path. Per path: p50/p90 of the whole answer, each call's time,
// prompt and cached tokens, and how often the answer was right. Questions asked inside a project
// include one about the other project: it must be declined, and no line of that project may reach the
// model. Real Muse Spark 1.3 calls at minimal effort, not streamed (streamed Chat Completions carry no
// usage). Synthetic PROBE- data only; prints its cost.
//
//   pnpm bench:ask [runs=2] [days=14] [--paths tiers,laptop] [--src <dir>]
//   pnpm bench:ask --index-only [days…] [--vectors]   (scripts/bench-index.ts)
//
// `runs` is per question. `--src` loads the answer paths from another checkout's `src/` (for a
// before/after table): with it, the hub's earlier behaviour is reproduced (no length retry, the
// laptop's 500-token cap, unscoped digests and facts in a project).
// Each answer prints one JSON line; the summary prints one per path, for docs/benchmarks.md.

import { parseArgs } from "node:util";
// `--index-only` is the index microbench (task 2.4): no model, no key.
if (process.argv.includes("--index-only") || process.argv.includes("--index-child")) {
  await import("./bench-index.ts");
  process.exit(0);
}
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { AskOutcome } from "../src/ask.ts";
import type { TierInput } from "../src/ask-tiers.ts";
import { type ChatMessage, completeChat } from "../src/chat.ts";
import type { DayEntry } from "../src/day-log.ts";
import type { Meeting } from "../src/meetings.ts";
import { chatTargets } from "../src/providers.ts";
import { ASK_SCENARIOS, type AskScenario, PROJECTS, isoLocalDay, memorySet } from "./eval/memory-set.ts";

/** Muse Spark 1.3, standard mode, US$ per million tokens (docs/kb/meta-api.md). */
const PRICE = { input: 1.25, cached: 0.15, output: 4.25 } as const;
/** What the hub sends today: the laptop's ask cap before task 1.2, and the structured calls' cap. */
const LEGACY_LAPTOP_TOKENS = 500;
const STRUCTURED_TOKENS = 1500;
const LAPTOP_DAYS = 7;
const DAY_MS = 86_400_000;

const { values, positionals } = parseArgs({ allowPositionals: true, options: { paths: { type: "string", default: "tiers,laptop" }, src: { type: "string" } } });
const runs = Number(positionals[0] ?? 2);
const days = Number(positionals[1] ?? 14);
const paths = values.paths!.split(",");
const legacy = Boolean(values.src);
const srcDir = resolve(values.src ?? new URL("../src", import.meta.url).pathname);
const askMod = (await import(pathToFileURL(`${srcDir}/ask.ts`).href)) as typeof import("../src/ask.ts");
const tiersMod = (await import(pathToFileURL(`${srcDir}/ask-tiers.ts`).href)) as typeof import("../src/ask-tiers.ts");
const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
if (!target.apiKey) throw new Error("MODEL_API_KEY is not set: run through `pnpm bench:ask` so .env is loaded");

const memory = memorySet({ days });
const inProject = (s: AskScenario) => (list: Meeting[]) => (s.project ? list.filter((m) => memory.assignments.get(m.id) === s.project) : list);

interface CallRecord {
  name: string;
  ms: number;
  prompt: number;
  cached: number;
  output: number;
  finish?: string;
}
const cost = (c: CallRecord) => ((c.prompt - c.cached) * PRICE.input + c.cached * PRICE.cached + c.output * PRICE.output) / 1e6;

function caller(path: string, calls: CallRecord[], prompts: string[]) {
  return async (messages: ChatMessage[], schema: object, name: string, maxTokens?: number) => {
    const cap = maxTokens ?? (path === "laptop" ? LEGACY_LAPTOP_TOKENS : STRUCTURED_TOKENS);
    prompts.push(JSON.stringify(messages));
    const r = await completeChat(target, messages, { maxTokens: cap, extra: { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } });
    calls.push({ name, ms: Math.round(r.totalMs), prompt: r.promptTokens ?? 0, cached: r.cachedTokens ?? 0, output: r.completionTokens ?? 0, ...(r.finishReason ? { finish: r.finishReason } : {}) });
    return legacy ? r.text : { text: r.text, ...(r.finishReason ? { finishReason: r.finishReason } : {}) };
  };
}

/** The hub's `askWhole`, on the synthetic memory. */
async function production(s: AskScenario, call: ReturnType<typeof caller>): Promise<AskOutcome> {
  const scope = inProject(s);
  const ids = new Set(scope(memory.meetings).map((m) => m.id));
  const whole: TierInput = { profile: memory.digests.profile, days: memory.digests.days, weeks: memory.digests.weeks, months: memory.digests.months, recentMeetings: scope(memory.meetings).slice(-5), keptFacts: memory.keptFacts };
  const input = s.project && !legacy ? tiersMod.scopeTierInput(whole, ids) : { ...whole, recentMeetings: whole.recentMeetings };
  const loadDays = (list: string[]): DayEntry[] => list.flatMap((d) => memory.entriesOn(d));
  return tiersMod.askTiers(
    { ...input, question: question(s), history: [], now: memory.now },
    {
      meetings: async (list) => scope(memory.meetings).filter((m) => list.includes(m.id)),
      meetingsBetween: async (from, to, limit) => scope(memory.meetings).filter((m) => m.startedAt >= from && m.startedAt < to).reverse().slice(0, limit),
      days: async (list) => (s.project && !legacy ? tiersMod.entriesInSpans(loadDays(list), scope(memory.meetings), memory.now) : loadDays(list)),
    },
    call as never,
  );
}

/** The hub's laptop path: one call over the meetings and the last 7 days. */
async function laptop(s: AskScenario, call: ReturnType<typeof caller>): Promise<AskOutcome> {
  const scope = inProject(s);
  const ids = new Set(scope(memory.meetings).map((m) => m.id));
  const recent = memory.days.filter((d) => Date.parse(d) >= Date.parse(isoLocalDay(memory.now - (LAPTOP_DAYS - 1) * DAY_MS))).flatMap((d) => memory.entriesOn(d));
  const facts = s.project && !legacy ? memory.keptFacts.filter((f) => ids.has(f.meetingId)) : memory.keptFacts;
  return askMod.ask({ question: question(s), history: [], meetings: scope(memory.meetings), day: s.project ? [] : recent, facts, now: memory.now }, ((messages: ChatMessage[], maxTokens?: number) => call(messages, askMod.askSchema, "ask", maxTokens)) as never);
}

const question = (s: AskScenario) => (s.project ? `(Sobre el proyecto «${PROJECTS.find((p) => p.id === s.project)!.name}») ${s.question}` : s.question);
const runners: Record<string, typeof production> = { tiers: production, laptop };

const pct = (list: number[], p: number) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]! : NaN;
};

console.error(`${target.label} · ${days} synthetic days: ${memory.meetings.length} meetings, ${memory.digests.days.length} day digests · ${runs} run(s) × ${ASK_SCENARIOS.length} questions · paths ${paths.join(", ")}${legacy ? ` · legacy src ${srcDir}` : ""}`);
let total = 0;
const summary: Record<string, { ms: number[]; right: number; n: number; leaks: number; scoped: number; prompt: number; cached: number; calls: number; cut: number; cost: number }> = {};
for (let run = 1; run <= runs; run++) {
  for (const s of ASK_SCENARIOS) {
    for (const path of paths) {
      const runner = runners[path];
      if (!runner) throw new Error(`unknown path "${path}": use ${Object.keys(runners).join(", ")}`);
      const calls: CallRecord[] = [];
      const prompts: string[] = [];
      const started = performance.now();
      let out: AskOutcome | undefined;
      let error: string | undefined;
      try {
        out = await runner(s, caller(path, calls, prompts));
      } catch (e) {
        error = (e as Error).message.slice(0, 160);
      }
      const ms = Math.round(performance.now() - started);
      const found = Boolean(out?.ok && out.found);
      const answer = out?.ok ? out.answer : "";
      const right = s.outOfProject ? Boolean(out?.ok) && !found : found && Boolean(s.expect?.test(answer));
      const leak = s.leak ? prompts.some((p) => s.leak!.test(p)) : undefined;
      const spent = calls.reduce((n, c) => n + cost(c), 0);
      total += spent;
      const sum = (summary[path] ??= { ms: [], right: 0, n: 0, leaks: 0, scoped: 0, prompt: 0, cached: 0, calls: 0, cut: 0, cost: 0 });
      sum.ms.push(ms);
      sum.n++;
      sum.right += right ? 1 : 0;
      if (s.leak) (sum.scoped++, (sum.leaks += leak ? 1 : 0));
      for (const c of calls) (sum.prompt += c.prompt, (sum.cached += c.cached), sum.calls++, (sum.cut += c.finish === "length" ? 1 : 0));
      sum.cost += spent;
      console.log(JSON.stringify({ bench: "ask", path, scenario: s.id, run, days, ms, found, right, ...(leak === undefined ? {} : { leak }), answer: answer.slice(0, 160), ...(error ? { error } : {}), calls, usd: Number(spent.toFixed(4)) }));
    }
  }
}
for (const [path, s] of Object.entries(summary)) {
  console.log(JSON.stringify({ bench: "ask", summary: path, days, n: s.n, p50Ms: pct(s.ms, 50), p90Ms: pct(s.ms, 90), right: `${s.right}/${s.n}`, leaks: `${s.leaks}/${s.scoped}`, calls: s.calls, cutAtLength: s.cut, promptTokensAvg: Math.round(s.prompt / Math.max(s.calls, 1)), cachedTokensAvg: Math.round(s.cached / Math.max(s.calls, 1)), usd: Number(s.cost.toFixed(4)), legacy }));
}
console.error(`spent US$ ${total.toFixed(4)}`);
