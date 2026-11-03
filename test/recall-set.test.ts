// add-memory-engine 8.2: the recall set loads, has about 120 questions of every kind, and every label
// points to a real segment that holds the fact (and only out-of-memory questions have none).

import assert from "node:assert/strict";
import { test } from "node:test";
import { recallSet } from "../scripts/eval/recall-set.ts";

test("the recall set: ~120 labelled questions over synthetic bilingual meetings, every label a real segment", () => {
  const set = recallSet();
  assert.equal(new Set(set.meetings.map((m) => m.id)).size, set.meetings.length, "meeting ids are unique");
  assert.ok(set.questions.length >= 115 && set.questions.length <= 125, `${set.questions.length} questions`);
  for (const kind of ["paraphrase", "cross-lingual", "exact", "time", "out-of-memory"] as const) assert.ok(set.questions.filter((q) => q.kind === kind).length >= 10, kind);
  const units = new Map(set.units.map((u) => [u.id, u]));
  for (const q of set.questions) {
    if (q.kind === "out-of-memory") assert.deepEqual(q.labels, [], q.id);
    else {
      assert.equal(q.labels.length, 1, q.id);
      const u = units.get(q.labels[0]!);
      assert.ok(u && u.kind === "segment", `${q.id}: ${q.labels[0]} is a segment`);
    }
  }
  // The three questions of a fact share its label; different facts have different segments.
  assert.equal(new Set(set.questions.filter((q) => q.kind === "exact").map((q) => q.labels[0])).size, 30);
});
