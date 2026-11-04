// add-practice-mode 1.2: a practice summary in the day record is part of the memory, on every path
// that reads the day (the index, the deep ask, the tiered ask). Synthetic PROBE data only.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildMemory } from "../src/ask.ts";
import { DayLog, type DayEntry, dayKey } from "../src/day-log.ts";
import { decodeShard, encodeShard } from "../src/index-snapshot.ts";
import { MemoryIndex, shardOf } from "../src/memory-index.ts";
import { dayUnits, parseQuestion, retrieve, sourceOf } from "../src/recall.ts";

const TZ = "America/Bogota";
const DAY_MS = 86_400_000;
const NOW = new Date("2026-11-04T17:00:00-05:00").getTime();
const YESTERDAY = NOW - DAY_MS;
const ctx = { now: NOW, timeZone: TZ, people: [], projects: [] };

const practice = (at: number, text: string, right: number, total: number): DayEntry => ({ at, kind: "practice", lessonId: "escala-do", text, right, total });

const yesterday: DayEntry[] = [
  { at: YESTERDAY - 600_000, kind: "turn", speaker: "A", text: "PROBE hablamos del clima y del almuerzo." },
  practice(YESTERDAY, "Piano · Escala de Do: 6 de 8 notas bien; falló la 4.ª (tocó Sol en vez de Fa); 7 s", 6, 8),
  { at: YESTERDAY + 60_000, kind: "live", text: "PROBE una taza azul sobre la mesa." },
  practice(YESTERDAY + 120_000, "Piano · Escala de Do: 8 de 8 notas bien; 5 s", 8, 8),
];

test("the day record keeps a practice entry and reloads it", () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-practice-day-"));
  try {
    const log = new DayLog(dir, NOW);
    log.add(practice(NOW, "Piano · Estrellita: 7 de 7 notas bien; 6 s", 7, 7));
    const again = new DayLog(dir, NOW);
    const e = again.entries[0]!;
    assert.equal(e.kind, "practice");
    assert.equal(e.kind === "practice" && e.lessonId, "escala-do");
    assert.equal(dayKey(e.at), dayKey(NOW));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("practice summaries become memory units, numbered with the camera's moments", () => {
  const units = dayUnits("2026-11-03", yesterday, [], NOW);
  const kept = units.filter((u) => u.kind === "practice");
  assert.equal(kept.length, 2);
  assert.match(kept[0]!.text, /^Práctica: Piano · Escala de Do: 6 de 8/);
  assert.deepEqual(units.filter((u) => u.id.startsWith("d")).map((u) => u.id), ["d2026-11-03:1", "d2026-11-03:2", "d2026-11-03:3"]);
  const chip = sourceOf(kept[0]!, TZ);
  assert.equal(chip.kind, "heard");
  assert.match(chip.label, /^Practicaste · \d\d:\d\d$/);
});

test("«¿cómo me fue ayer en el piano?» retrieves yesterday's practice", () => {
  const idx = new MemoryIndex();
  for (const u of dayUnits("2026-11-03", yesterday, [], NOW)) idx.add(u);
  const r = retrieve(idx, parseQuestion("¿Cómo me fue ayer en el piano?", ctx), { now: NOW, budget: 24_000 });
  const texts = r.lines.map((u) => u.text);
  assert.ok(texts.some((t) => t.includes("6 de 8 notas bien")), texts.join(" | "));
  assert.ok(texts.some((t) => t.includes("8 de 8 notas bien")));
});

test("a practice unit survives a snapshot round trip", () => {
  const idx = new MemoryIndex();
  for (const u of dayUnits("2026-11-03", yesterday, [], NOW)) idx.add(u);
  const shard = idx.shards.get(shardOf(YESTERDAY))!;
  const back = decodeShard(encodeShard(shard, { encoder: "lexical", builtThrough: NOW })).shard;
  const kinds = [...back.liveUnits()].map(([, u]) => u.kind);
  assert.equal(kinds.filter((k) => k === "practice").length, 2);
});

test("the deep ask's memory names practice as practice", () => {
  const { text, sources } = buildMemory({ meetings: [], day: yesterday, facts: [] });
  assert.match(text, /práctica: Piano · Escala de Do: 8 de 8 notas bien/);
  const chip = [...sources.values()].find((s) => s.label.startsWith("Practicaste"));
  assert.ok(chip);
  assert.equal(chip.kind, "heard");
});
