// The grounding eval (add-memory-engine 9.1) on the recall set (scripts/eval/recall-set.ts): every question
// through the fast path (local retrieval, one streamed answer) and the deep path (askTiers: plan, lookup,
// answer), plus questions asked inside the wrong project. Per path:
//   - accuracy           found, and a cited source is the meeting that holds the fact;
//   - citation accuracy  of the answers that cite, the share whose every chip is in the right meeting;
//   - refusals           out-of-memory and out-of-project questions answered «No lo encuentro»;
//   - first text and total time, p50/p90; tokens and cost.
// The deep path gets a day digest per day that lists its meetings and their first card fact, as the
// nightly run would. Real Muse Spark 1.3 (minimal effort). Synthetic PROBE- data only; prints its cost.
//
//   node --env-file=.env scripts/eval/grounding.ts [--paths fast,deep] [--limit N] [--encoder-module <path>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { AskOutcome } from "../../src/ask.ts";
import { askTiers } from "../../src/ask-tiers.ts";
import type { MemoryCard } from "../../src/cards.ts";
import { completeChat, streamResponse } from "../../src/chat.ts";
import type { Digest } from "../../src/digests.ts";
import { HubEncoder } from "../../src/encoder.ts";
import { RecallRuntime, answerRecall } from "../../src/recall-runtime.ts";
import { chatTargets } from "../../src/providers.ts";
import { TOKEN_USD_PER_M } from "../../src/usage-meter.ts";
import { PROJECTS, isoLocalDay } from "./memory-set.ts";
import { type RecallQuestion, recallSet } from "./recall-set.ts";

const { values } = parseArgs({ options: { paths: { type: "string", default: "fast,deep" }, limit: { type: "string" }, "encoder-module": { type: "string" } } });
const TZ = "America/Bogota";
const OUT_OF_PROJECT = 10;
const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
if (!target.apiKey) throw new Error("MODEL_API_KEY is not set: run with node --env-file=.env");
const set = recallSet();
const cardsFile = join("results", "bake-off", "cards.json");
const cards: Record<string, MemoryCard[]> = existsSync(cardsFile) ? JSON.parse(readFileSync(cardsFile, "utf8")) : {};
const meetings = set.meetings.map((m) => ({ ...m, cards: cards[m.id] ?? [] }));
const labelMeeting = (label: string) => /^s(m\d{14}):/.exec(label)?.[1];

// The questions: the set's, then facts asked inside the project they are not in.
type Item = RecallQuestion & { project?: string; outOfProject?: boolean };
const items: Item[] = [...set.questions];
for (const q of set.questions.filter((x) => x.kind === "exact").slice(0, OUT_OF_PROJECT)) {
  const home = set.assignments.get(labelMeeting(q.labels[0]!)!)!;
  items.push({ ...q, id: `${q.id}-elsewhere`, kind: "out-of-memory", project: PROJECTS.find((p) => p.id !== home)!.id, labels: [], outOfProject: true });
}
const run = values.limit ? items.filter((_, i) => i % Math.ceil(items.length / Number(values.limit)) === 0) : items;

// Day digests for the deep path: each day's meetings with their first card fact and their ids as sources.
const byDay = new Map<string, typeof meetings>();
for (const m of meetings) byDay.set(isoLocalDay(m.startedAt), [...(byDay.get(isoLocalDay(m.startedAt)) ?? []), m]);
const days: Digest[] = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, list]) => ({ scope: "day", periodStart: day, text: list.map((m) => `«${m.title}»: ${m.cards[0]?.facts[0]?.text ?? "reunión de seguimiento"}`).join(" "), sources: list.map((m) => m.id), createdAt: set.now }));

const price = (input: number, cached: number, output: number) => {
  const p = TOKEN_USD_PER_M["muse-spark-1.3"]!;
  return ((input - cached) * p.input + cached * p.cached + output * p.output) / 1e6;
};

let runtime: RecallRuntime | undefined;
async function fast(q: Item, rec: { usd: number; first?: number }): Promise<AskOutcome> {
  if (!runtime) {
    const embedder = values["encoder-module"] ? new HubEncoder(values["encoder-module"]) : undefined;
    runtime = new RecallRuntime({ meetings: () => meetings, assignments: () => set.assignments, today: () => [], recent: () => [], keptFacts: () => [] }, TZ, () => set.now, embedder ? { embedder } : {});
    await runtime.ready;
    while (runtime.pendingVectors) await runtime.embedPending(60_000);
  }
  const started = performance.now();
  const answer = await answerRecall({
    runtime,
    question: q.question,
    history: [],
    ...(q.project ? { projectId: q.project } : {}),
    projects: PROJECTS.map((p) => ({ id: p.id, name: p.name })),
    now: set.now,
    timeZone: TZ,
    emit: (e) => {
      if (e.type === "delta" && rec.first === undefined) rec.first = performance.now() - started;
    },
    call: async (messages, opts) => {
      const r = await streamResponse(target, messages, { maxTokens: opts.maxTokens, onDelta: opts.onDelta, allowIncomplete: true });
      rec.usd += price(r.promptTokens ?? 0, r.cachedTokens ?? 0, r.completionTokens ?? 0);
      return r.finishReason ? { finishReason: r.finishReason } : {};
    },
  });
  if (answer.path === "deep") return deep(q, rec);
  const r = answer.result!;
  return { ok: true, answer: r.answer, sources: r.sources, found: r.found, ms: Math.round(performance.now() - started) };
}

async function deep(q: Item, rec: { usd: number; first?: number }): Promise<AskOutcome> {
  const inScope = meetings.filter((m) => !q.project || set.assignments.get(m.id) === q.project);
  const ids = new Set(inScope.map((m) => m.id));
  return askTiers(
    { ...(q.project ? { days: [], weeks: [], months: [] } : { days: days.slice(0, 14), weeks: [], months: [] }), recentMeetings: inScope.slice(-5), keptFacts: [], question: q.project ? `(Sobre el proyecto «${PROJECTS.find((p) => p.id === q.project)!.name}») ${q.question}` : q.question, history: [], now: set.now },
    {
      meetings: async (list) => inScope.filter((m) => list.includes(m.id)),
      meetingsBetween: async (from, to, limit) => inScope.filter((m) => m.startedAt >= from && m.startedAt < to).reverse().slice(0, limit),
      days: async () => [],
    },
    async (messages, schema, name, maxTokens) => {
      const r = await completeChat(target, messages, { maxTokens, extra: { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } });
      rec.usd += price(r.promptTokens ?? 0, r.cachedTokens ?? 0, r.completionTokens ?? 0);
      void ids;
      return { text: r.text, ...(r.finishReason ? { finishReason: r.finishReason } : {}) };
    },
  );
}

const out = join("results", "grounding");
mkdirSync(out, { recursive: true });
const rows: Record<string, unknown>[] = [];
let total = 0;
for (const q of run) {
  for (const path of values.paths!.split(",")) {
    const rec = { usd: 0, first: undefined as number | undefined };
    const started = performance.now();
    let o: AskOutcome | undefined;
    let error: string | undefined;
    try {
      o = await (path === "fast" ? fast(q, rec) : deep(q, rec));
    } catch (e) {
      error = (e as Error).message.slice(0, 120);
    }
    const ms = performance.now() - started;
    total += rec.usd;
    const found = Boolean(o?.ok && o.found);
    const sources = o?.ok ? o.sources : [];
    const right = labelMeeting(q.labels[0] ?? "");
    const citesRight = sources.some((s) => s.meetingId === right);
    const allRight = sources.length > 0 && sources.every((s) => s.meetingId === right);
    rows.push({ id: q.id, kind: q.kind, path, outOfProject: Boolean(q.outOfProject), found, correct: q.labels.length ? found && citesRight : !found, cited: sources.length > 0, citesAllRight: allRight, ms: Math.round(ms), firstMs: Math.round(rec.first ?? ms), usd: rec.usd, ...(error ? { error } : {}) });
  }
  if (rows.length % 20 === 0) console.error(`${rows.length} answers · US$ ${total.toFixed(3)}`);
}
const pct = (list: number[], p: number) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.ceil((p / 100) * list.length) - 1)];
const summary: Record<string, unknown> = { bench: "grounding", at: new Date().toISOString(), questions: run.length, usd: Number(total.toFixed(4)) };
for (const path of values.paths!.split(",")) {
  const r = rows.filter((x) => x.path === path) as { kind: string; outOfProject: boolean; found: boolean; correct: boolean; cited: boolean; citesAllRight: boolean; ms: number; firstMs: number; usd: number }[];
  const answerable = r.filter((x) => x.kind !== "out-of-memory");
  const oom = r.filter((x) => x.kind === "out-of-memory" && !x.outOfProject);
  const oop = r.filter((x) => x.outOfProject);
  const share = (list: typeof r, pred: (x: (typeof r)[number]) => boolean) => `${list.filter(pred).length}/${list.length}`;
  summary[path] = {
    accuracy: share(answerable, (x) => x.correct),
    byKind: Object.fromEntries(["paraphrase", "cross-lingual", "exact", "time"].map((k) => [k, share(answerable.filter((x) => x.kind === k), (x) => x.correct)])),
    citationAccuracy: share(answerable.filter((x) => x.cited), (x) => x.citesAllRight),
    refusalsOutOfMemory: share(oom, (x) => !x.found),
    refusalsOutOfProject: share(oop, (x) => !x.found),
    firstP50Ms: pct(r.map((x) => x.firstMs), 50),
    firstP90Ms: pct(r.map((x) => x.firstMs), 90),
    totalP50Ms: pct(r.map((x) => x.ms), 50),
    totalP90Ms: pct(r.map((x) => x.ms), 90),
    usd: Number(r.reduce((s, x) => s + x.usd, 0).toFixed(4)),
  };
}
writeFileSync(join(out, `summary-${Date.now()}.json`), JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 1));
