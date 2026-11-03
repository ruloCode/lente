// add-memory-engine 8.5 with a fake encoder whose dimensions are concepts (money, launch, design…),
// so a Spanish paraphrase lands next to an English line that shares no word with it. Vectors join the
// fusion; they round-trip in snapshots; another encoder re-embeds in the background while word matches
// answer; unchanged units keep their vectors when a running meeting is re-indexed. No model, no network.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { EmbedKind, Encoder } from "../src/encoder.ts";
import type { Meeting } from "../src/meetings.ts";
import { RecallRuntime, answerRecall, type RecallRecords } from "../src/recall-runtime.ts";
import { parseQuestion, retrieve } from "../src/recall.ts";
import { FileSnapshots } from "../src/stores.ts";

const TZ = "America/Bogota";
const NOW = Date.parse("2026-11-05T15:00:00-05:00");
const CONCEPTS = [/budget|plata|dinero|money|presupuesto|dollars|dólares/i, /launch|lanzamiento/i, /design|diseño/i, /pilot|piloto/i, /hola|hello/i, /ads|anuncios|publicidad/i, /bogot/i, /x^/];

class ConceptEncoder implements Encoder {
  readonly dim = 8;
  calls = 0;
  readonly id: string;
  constructor(id = "concepts-v1") {
    this.id = id;
  }
  async embed(texts: readonly string[], _kind: EmbedKind): Promise<Int8Array[]> {
    this.calls += texts.length;
    return texts.map((t) => Int8Array.from(CONCEPTS.map((re, i) => (re.test(t) ? 100 : i === 7 ? 5 : -20))));
  }
}

const meeting = (id: string, at: number, lines: [string, string][]): Meeting => ({ id, title: `PROBE ${id}`, startedAt: at, endedAt: at + 600_000, status: "done", turns: lines.map(([speaker, text], i) => ({ id: `t${i + 1}`, at: at + (i + 1) * 60_000, speaker, text })) });

function world() {
  const meetings = [
    meeting("m1", NOW - 2 * 86_400_000, [["PROBE-Ana", "The marketing budget is 18,000 dollars and half goes to ads."], ["B", "Okay, noted."]]),
    meeting("m2", NOW - 86_400_000, [["PROBE-Sofía", "El piloto arranca en Bogotá el lunes."], ["C", "Perfecto."]]),
  ];
  const records: RecallRecords = { meetings: () => meetings, assignments: () => new Map(), today: () => [], recent: () => [], keptFacts: () => [] };
  return { meetings, records };
}
const ctx = { now: NOW, timeZone: TZ, people: [], projects: [] };

test("vectors join the fusion: a Spanish paraphrase with no shared word finds the English line", async () => {
  const { records } = world();
  const enc = new ConceptEncoder();
  const rt = new RecallRuntime(records, TZ, () => NOW, { embedder: enc });
  await rt.ready;
  assert.ok(rt.pendingVectors > 0);
  await rt.embedPending();
  assert.equal(rt.pendingVectors, 0);
  const q = parseQuestion("¿Cuánta plata hay para publicidad?", ctx);
  const lexicalOnly = retrieve(rt.index, q, { now: NOW, budget: 24_000 });
  assert.equal(lexicalOnly.lines.length, 0, "no word in common");
  const [v] = await enc.embed([q.text], "query");
  const withVectors = retrieve(rt.index, q, { now: NOW, budget: 24_000, queryVector: v });
  assert.match(withVectors.lines[0]!.text, /18,000 dollars/);
  assert.equal(withVectors.confident, true);
  // The fast path computes the question's vector itself.
  let prompt = "";
  const out = await answerRecall({ runtime: rt, question: "¿Cuánta plata hay para publicidad?", history: [], projects: [], now: NOW, timeZone: TZ, emit: () => {}, call: async (messages, opts) => ((prompt = JSON.stringify(messages)), opts.onDelta("@answer\nVeintiocho [[sm1:1]]."), {}) });
  assert.equal(out.path, "fast");
  assert.match(prompt, /18,000 dollars/);
});

test("vectors round-trip in snapshots; another encoder re-embeds in the background while words still answer", async () => {
  const { records } = world();
  const files = new FileSnapshots(join(mkdtempSync(join(tmpdir(), "lente-recall-vec-")), "memory"));
  const a = new RecallRuntime(records, TZ, () => NOW, { snapshots: files, embedder: new ConceptEncoder() });
  await a.ready;
  await a.embedPending();
  await a.persist();
  const same = new ConceptEncoder();
  const b = new RecallRuntime(records, TZ, () => NOW, { snapshots: files, embedder: same });
  await b.ready;
  assert.equal(b.pendingVectors, 0, "same encoder: the vectors came from the snapshot");
  assert.equal(same.calls, 0);
  const other = new ConceptEncoder("concepts-v2");
  const c = new RecallRuntime(records, TZ, () => NOW, { snapshots: files, embedder: other });
  await c.ready;
  assert.ok(c.pendingVectors > 0, "another encoder: every unit waits for a new vector");
  assert.ok(retrieve(c.index, parseQuestion("marketing budget", ctx), { now: NOW, budget: 24_000 }).lines.length > 0, "word matches answer meanwhile");
  await c.embedPending();
  assert.equal(c.pendingVectors, 0);
  assert.equal(await c.persist(), 1, "November written again with the new vectors");
});

test("a running meeting re-indexed for a new turn keeps the vectors of the segments that did not change", async () => {
  const { meetings, records } = world();
  const enc = new ConceptEncoder();
  const rt = new RecallRuntime(records, TZ, () => NOW, { embedder: enc });
  await rt.ready;
  await rt.embedPending();
  const before = enc.calls;
  meetings[1]!.turns.push({ id: "t3", at: NOW - 86_400_000 + 9 * 60_000, speaker: "C", text: "Hola, ¿llegaron los equipos?" });
  await rt.flush();
  assert.equal(rt.pendingVectors, 1, "only the new segment");
  await rt.embedPending();
  assert.equal(enc.calls - before, 1);
});
