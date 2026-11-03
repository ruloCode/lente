// The memory index microbench (add-memory-engine 2.4), run as `pnpm bench:ask --index-only [days…]
// [--vectors] [--queries 300]`. For each size (default 30, 90 and 365 days of all-day recording,
// 1,200 segments a day) a child process builds the index from synthetic segments and times queries
// the way the fast path runs them: terms, a project or time filter on some, BM25, the people list,
// with `--vectors` a random 384-dimension int8 vector per unit and a vector search, then fusion and
// neighbour expansion. Reports build time, query p50/p95 and the RSS the index added. No model call.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { MemoryIndex } from "../src/memory-index.ts";
import { expand, fuse } from "../src/recall-fusion.ts";
import { fold, terms } from "../src/terms.ts";
import { MEMORY_NOW, PEOPLE, SEGMENTS_PER_DAY, allDayUnits } from "./eval/memory-set.ts";

export const VECTOR_DIM = 384;
const DAY_MS = 86_400_000;
const RECALL_LINES = 24;

const { values, positionals } = parseArgs({ allowPositionals: true, options: { "index-only": { type: "boolean" }, "index-child": { type: "string" }, vectors: { type: "boolean", default: false }, queries: { type: "string", default: "300" } } });

const pct = (list: number[], p: number) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
const rss = () => {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().rss;
};

if (values["index-child"]) {
  const days = Number(values["index-child"]);
  const withVectors = values.vectors!;
  let seed = 99;
  const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) >>> 0) / 4_294_967_296);
  const randomVector = () => Int8Array.from({ length: VECTOR_DIM }, () => Math.floor(rand() * 255) - 127);
  const before = rss();
  const idx = new MemoryIndex(withVectors ? VECTOR_DIM : 0);
  const texts: string[] = [];
  const started = performance.now();
  for (const u of allDayUnits(days)) {
    idx.add(u, withVectors ? randomVector() : undefined);
    if (rand() < 0.002) texts.push(u.text);
  }
  const buildMs = performance.now() - started;
  const added = rss() - before;
  const people = Object.values(PEOPLE).map((p) => fold(p.replace("PROBE-", "").split(" ")[0]!));
  const times: number[] = [];
  const n = Number(values.queries);
  for (let i = 0; i < n; i++) {
    // Four to six words of a real segment, so every query has matches; a third scoped to a project,
    // a third to one week, a fifth naming a person.
    const words = terms(texts[i % texts.length]!).filter((t) => t.startsWith("w"));
    const q = words.slice(i % 7, (i % 7) + 4 + (i % 3)).join(" ");
    const filter = i % 3 === 0 ? { projectId: "p-atlas" } : i % 3 === 1 ? { from: MEMORY_NOW - (7 + (i % 40)) * DAY_MS, to: MEMORY_NOW - (i % 40) * DAY_MS } : {};
    const named = i % 5 === 0 ? [people[i % people.length]!] : [];
    const qv = withVectors ? randomVector() : undefined;
    const t0 = performance.now();
    const lexical = idx.lexical(terms(q), filter, 50);
    const vector = qv ? idx.vector(qv, filter, 50) : [];
    const byPerson = idx.people(named, filter, 20);
    const fused = fuse([{ name: "lexical", hits: lexical }, { name: "vector", hits: vector }, { name: "people", hits: byPerson }], { now: MEMORY_NOW, timeNamed: "from" in filter, people: named });
    expand(fused, (id) => idx.get(id), () => true, RECALL_LINES);
    times.push(performance.now() - t0);
  }
  console.log(JSON.stringify({ bench: "index", days, units: idx.size, vectors: withVectors ? VECTOR_DIM : 0, buildMs: Math.round(buildMs), queryP50Ms: Number(pct(times, 50).toFixed(2)), queryP95Ms: Number(pct(times, 95).toFixed(2)), queries: n, rssAddedMB: Math.round(added / 1e6), rssPer100kUnitsMB: Math.round((added / 1e6) * (100_000 / idx.size)) }));
} else {
  const sizes = positionals.length ? positionals.map(Number) : [30, 90, 365];
  console.error(`index microbench: ${SEGMENTS_PER_DAY} segments a day, sizes ${sizes.join(", ")} days, ${values.queries} queries each${values.vectors ? `, ${VECTOR_DIM}-dim int8 vectors` : ", lexical only"}`);
  for (const days of sizes) {
    const out = execFileSync(process.execPath, ["--expose-gc", "--max-old-space-size=8192", new URL(import.meta.url).pathname, "--index-child", String(days), "--queries", values.queries!, ...(values.vectors ? ["--vectors"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    process.stdout.write(out);
  }
}
