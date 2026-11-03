// The encoder bake-off (add-memory-engine 8.4, design decision 7) on the recall set (scripts/eval/recall-set.ts):
//   A  lexical BM25 plus the bilingual keys of memory cards (the baseline, no dependency);
//   B  A fused with a small multilingual encoder run in the hub (multilingual-e5-small, ONNX, CPU);
//   C  A fused with a Meta open-weights encoder on Modal (pending: see docs/kb/decisions.md).
// For each: recall@10 and MRR over all answerable questions and the cross-lingual subset, by kind; for B,
// query embedding p50/p95 from the hub, passage throughput, and the RSS the encoder and the vectors add.
// The cards come from the real notes call once (Muse Spark 1.3, about US$ 0.5) and are cached in
// results/bake-off/cards.json; later runs cost nothing.
//
//   node --env-file=.env scripts/eval/bake-off.ts [--encoder-module <path to @huggingface/transformers>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type MemoryCard, cardPrompt, cardUnits, validateCard, withCardFields } from "../../src/cards.ts";
import { completeChat } from "../../src/chat.ts";
import { HubEncoder } from "../../src/encoder.ts";
import { extractionMessages, notesSchema } from "../../src/meetings.ts";
import { type Hit, MemoryIndex, type MemoryUnit } from "../../src/memory-index.ts";
import { localDayStart } from "../../src/nightly.ts";
import { chatTargets } from "../../src/providers.ts";
import { type RankedList, fuse } from "../../src/recall-fusion.ts";
import { parseQuestion } from "../../src/recall.ts";
import { TOKEN_USD_PER_M } from "../../src/usage-meter.ts";
import { PEOPLE, PROJECTS } from "./memory-set.ts";
import { type RecallQuestion, recallSet } from "./recall-set.ts";

const { values } = parseArgs({ options: { "encoder-module": { type: "string" } } });
const TZ = "America/Bogota";
const TOP = 10;
const LIST = 50;
const out = join("results", "bake-off");
mkdirSync(out, { recursive: true });
const set = recallSet();
const rss = () => {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().rss;
};

// --- Cards from the real notes call, cached ------------------------------------------------------
const cardsFile = join(out, "cards.json");
let spent = 0;
const cards: Record<string, MemoryCard[]> = existsSync(cardsFile) ? JSON.parse(readFileSync(cardsFile, "utf8")) : {};
const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
for (const m of set.meetings) {
  if (cards[m.id]) continue;
  if (!target.apiKey) throw new Error("MODEL_API_KEY is not set and the cards are not cached: run with node --env-file=.env");
  const turnIds = m.turns.map((t) => t.id);
  const messages = extractionMessages(m);
  messages[0] = { ...messages[0]!, content: `${messages[0]!.content}\n\n${cardPrompt([])}` };
  const r = await completeChat(target, messages, { maxTokens: 4500, extra: { response_format: { type: "json_schema", json_schema: { name: "meeting_notes", strict: true, schema: withCardFields(notesSchema(turnIds), turnIds, []) } } } });
  const p = TOKEN_USD_PER_M["muse-spark-1.3"]!;
  spent += (((r.promptTokens ?? 0) - (r.cachedTokens ?? 0)) * p.input + (r.cachedTokens ?? 0) * p.cached + (r.completionTokens ?? 0) * p.output) / 1e6;
  const { card } = validateCard(JSON.parse(r.text), { episodeId: m.id, turnIds, turnAt: new Map(m.turns.map((t) => [t.id, t.at])), shown: [], from: m.startedAt, to: m.endedAt!, window: false, firstN: 0, dayStart: (d) => localDayStart(d, TZ) });
  cards[m.id] = [card];
  writeFileSync(cardsFile, JSON.stringify(cards));
}
if (spent) console.error(`cards written by the notes call: US$ ${spent.toFixed(4)}`);

// --- Units: segments, notes and card facts ----------------------------------------------------------
const meetingsWithCards = set.meetings.map((m) => ({ ...m, cards: cards[m.id] ?? [] }));
const cardUnitsAll = meetingsWithCards.flatMap((m) => cardUnits(m, set.assignments.get(m.id)));
const units: MemoryUnit[] = [...set.units, ...cardUnitsAll];
/** A card fact counts as finding the segment that holds its first supporting turn. */
const segmentOf = new Map<string, string>();
for (const u of set.units) {
  if (u.kind !== "segment" || !u.refs) continue;
  const [mid, range] = u.refs.split(":");
  const [a, b] = range!.split("–").map((t) => Number(t.slice(1)));
  for (let n = a!; n <= b!; n++) segmentOf.set(`${mid}:t${n}`, u.id);
}
const resolve = (u: MemoryUnit): string | undefined => (u.kind === "segment" ? u.id : u.kind === "card" ? segmentOf.get(u.refs ?? "") : undefined);

const lexIndex = new MemoryIndex();
for (const u of units) lexIndex.add(u);
const ctx = { now: set.now, timeZone: TZ, people: Object.values(PEOPLE), projects: PROJECTS.map((p) => ({ id: p.id, name: p.name })) };

/** The ranked segment ids for a question from the given lists. */
function ranked(q: RecallQuestion, extra: RankedList[]): string[] {
  const parsed = parseQuestion(q.question, ctx);
  const filter = parsed.range ? { from: parsed.range.from, to: parsed.range.to } : {};
  const lexical = lexIndex.lexical(parsed.terms, filter, LIST);
  const people = parsed.people.length && parsed.terms.length ? lexIndex.lexical(parsed.terms, { ...filter, people: parsed.people }, LIST) : [];
  const time: Hit[] = parsed.range ? lexIndex.recent({ ...filter, kinds: ["notes", "card", "fact"] }, LIST) : [];
  const fused = fuse([{ name: "lexical", hits: lexical }, { name: "people", hits: people }, { name: "time", hits: time }, ...extra], { now: set.now, timeNamed: Boolean(parsed.range), people: parsed.people });
  const ids: string[] = [];
  for (const f of fused) {
    const id = resolve(f.unit);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function score(name: string, rank: (q: RecallQuestion) => string[]) {
  const answerable = set.questions.filter((q) => q.labels.length);
  const rows = answerable.map((q) => {
    const ids = rank(q);
    const at = ids.findIndex((id) => q.labels.includes(id));
    return { q, hit: at >= 0 && at < TOP, rr: at >= 0 ? 1 / (at + 1) : 0 };
  });
  const sub = (pred: (q: RecallQuestion) => boolean) => {
    const r = rows.filter((x) => pred(x.q));
    return { n: r.length, recall10: Number((r.filter((x) => x.hit).length / r.length).toFixed(3)), mrr: Number((r.reduce((s, x) => s + x.rr, 0) / r.length).toFixed(3)) };
  };
  return { config: name, all: sub(() => true), crossLingual: sub((q) => q.kind === "cross-lingual"), byKind: Object.fromEntries(["paraphrase", "cross-lingual", "exact", "time"].map((k) => [k, sub((q) => q.kind === k)])) };
}

const results: object[] = [];
const a = score("A lexical + card keys", (q) => ranked(q, []));
results.push(a);
const aNoKeys = (() => {
  const plain = new MemoryIndex();
  for (const u of set.units) plain.add(u);
  return score("A without card keys", (q) => {
    const parsed = parseQuestion(q.question, ctx);
    const filter = parsed.range ? { from: parsed.range.from, to: parsed.range.to } : {};
    return plain.lexical(parsed.terms, filter, LIST).map((h) => h.unit.id);
  });
})();
results.push(aNoKeys);

// --- B: the hub encoder ------------------------------------------------------------------------------
const encoder = new HubEncoder(values["encoder-module"]);
const baseRss = rss();
await encoder.embed(["warm up"], "query");
const modelRss = rss() - baseRss;
const vecIndex = new MemoryIndex(encoder.dim);
const started = performance.now();
const BATCH = 32;
for (let i = 0; i < units.length; i += BATCH) {
  const batch = units.slice(i, i + BATCH);
  const vectors = await encoder.embed(batch.map((u) => u.text), "passage");
  batch.forEach((u, k) => vecIndex.add(u, vectors[k]));
}
const perPassageMs = (performance.now() - started) / units.length;
const queryMs: number[] = [];
const queryVec = new Map<string, Int8Array>();
for (const q of set.questions) {
  const t = performance.now();
  const [v] = await encoder.embed([parseQuestion(q.question, ctx).text], "query");
  queryMs.push(performance.now() - t);
  queryVec.set(q.id, v!);
}
const b = score("B A + hub encoder (multilingual-e5-small q8)", (q) => {
  const parsed = parseQuestion(q.question, ctx);
  const filter = parsed.range ? { from: parsed.range.from, to: parsed.range.to } : {};
  return ranked(q, [{ name: "vector", hits: vecIndex.vector(queryVec.get(q.id)!, filter, LIST) }]);
});
const bVectorsOnly = score("B vectors alone", (q) => vecIndex.vector(queryVec.get(q.id)!, {}, LIST).flatMap((h) => resolve(h.unit) ?? []).filter((id, i, all) => all.indexOf(id) === i));
results.push(b, bVectorsOnly);
const pct = (list: number[], p: number) => [...list].sort((x, y) => x - y)[Math.min(list.length - 1, Math.ceil((p / 100) * list.length) - 1)]!;
const bCost = {
  config: "B costs",
  queryEmbedP50Ms: Number(pct(queryMs, 50).toFixed(1)),
  queryEmbedP95Ms: Number(pct(queryMs, 95).toFixed(1)),
  passageEmbedMs: Number(perPassageMs.toFixed(1)),
  encoderRssMB: Math.round(modelRss / 1e6),
  vectorBytesPer100kUnitsMB: Math.round(((encoder.dim + encoder.dim / 8) * 100_000) / 1e6),
};
results.push(bCost, { config: "C Meta open-weights encoder on Modal", status: "pending: SONAR's checkpoints are CC-BY-NC-4.0 and need fairseq2; no Meta encoder with a fitting licence was measured (docs/kb/decisions.md)" });

const summary = { bench: "bake-off", at: new Date().toISOString(), questions: set.questions.length, units: units.length, cardFacts: cardUnitsAll.length, results, spentUsd: Number(spent.toFixed(4)) };
writeFileSync(join(out, `summary-${Date.now()}.json`), JSON.stringify(summary, null, 2));
for (const r of results) console.log(JSON.stringify(r));
