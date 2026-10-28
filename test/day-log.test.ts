import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DayLog, dayKey } from "../src/day-log.ts";

test("day log keeps text entries on disk and reloads them", () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-day-"));
  try {
    const at = new Date(2026, 9, 28, 10, 0).getTime();
    const log = new DayLog(dir, at);
    log.add({ at, kind: "turn", speaker: "A", text: "Can you ship by Friday?", question: true });
    log.add({ at: at + 1000, kind: "cue", label: "SAY THIS", text: "Yes, by Friday.", ms: 1610 });
    assert.equal(readFileSync(join(dir, "2026-10-28.jsonl"), "utf8").trim().split("\n").length, 2);
    const again = new DayLog(dir, at);
    assert.deepEqual(again.entries.map((e) => e.kind), ["turn", "cue"]);
    assert.deepEqual(again.since(at + 500).map((e) => e.kind), ["cue"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("day log rolls over to a new file at midnight", () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-day-"));
  try {
    const late = new Date(2026, 9, 28, 23, 59).getTime();
    const log = new DayLog(dir, late);
    log.add({ at: late, kind: "summary", text: "Nada importante." });
    log.add({ at: late + 120_000, kind: "summary", text: "Nuevo día." });
    assert.equal(log.entries.length, 1);
    assert.equal(dayKey(late + 120_000), "2026-10-29");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
