import assert from "node:assert/strict";
import { test } from "node:test";
import { type RawCue, type RawTurn, type RawUsage, matchLines, percentile, scoreLines, spread, stageSpreads, sumUsage, summarize, turnForLine } from "../scripts/eval/metrics.ts";
import { type Dialogue } from "../scripts/eval/set.ts";

const dialogue = (lines: Dialogue["lines"]): Dialogue => ({
  id: "d",
  title: "T",
  names: ["Rulo"],
  speakers: { W: { voice: "a", gain: 1, wearer: true }, P: { voice: "b", gain: 0.2 } },
  lines,
});
const timings = [{ startMs: 0, endMs: 2000 }, { startMs: 3000, endMs: 5000 }, { startMs: 6000, endMs: 8000 }, { startMs: 9000, endMs: 11000 }];
const turn = (turnId: string, startMs: number, endMs: number, atMs: number): RawTurn => ({ turnId, startMs, endMs, atMs, text: turnId });

test("percentiles use the nearest rank and handle empty lists", () => {
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([40, 10, 30, 20, 50, 60, 70, 80, 90, 100], 95), 100);
  assert.deepEqual(spread([3, 1, 2]), { n: 3, p50: 2, p95: 3 });
});

test("a turn matches the line it covers most, and only if it covers half of it", () => {
  const turns = [turn("a", 100, 1900, 0), turn("b", 4800, 5200, 0)];
  assert.equal(turnForLine(timings[0], turns)?.turnId, "a");
  assert.equal(turnForLine(timings[1], turns), undefined, "400 ms of a 2000 ms line is not enough");
  assert.equal(turnForLine(timings[2], turns), undefined);
});

const lines = [
  { speaker: "P", text: "q for you", question: true, addressedToWearer: true },
  { speaker: "P", text: "q for someone", question: true },
  { speaker: "P", text: "a statement" },
  { speaker: "P", text: "another q for you", question: true, addressedToWearer: true },
] as Dialogue["lines"];

test("lines join the labels with the turn and cue the hub produced, with latencies from the end of the line", () => {
  const turns = [turn("t1", 0, 2000, 2600), turn("t2", 3000, 5000, 5900), turn("t3", 6000, 8000, 8500)];
  const cues: RawCue[] = [{ turnId: "t1", atMs: 4100, modelMs: 900 }, { turnId: "t2", atMs: 7000 }];
  const { lines: r, mergedTurns } = matchLines(dialogue(lines), timings, turns, cues);
  assert.equal(mergedTurns, 0);
  assert.deepEqual(r[0], { index: 0, question: true, addressed: true, turnId: "t1", cued: true, finalizeMs: 600, cueMs: 2100, modelMs: 900 });
  assert.equal(r[1].cued, true);
  assert.equal(r[1].cueMs, 2000);
  assert.equal(r[2].cued, false);
  assert.equal(r[3].turnId, undefined, "never transcribed");
});

test("a turn that swallowed two lines is counted as merged", () => {
  const { mergedTurns } = matchLines(dialogue(lines), timings, [turn("t1", 0, 5000, 5500)], []);
  assert.equal(mergedTurns, 1);
});

test("precision, recall and false cue rate", () => {
  const turns = [turn("t1", 0, 2000, 2600), turn("t2", 3000, 5000, 5900), turn("t3", 6000, 8000, 8500)];
  // cue for the addressed question (hit) and for the other question (false); the second addressed question was never heard.
  const { lines: r } = matchLines(dialogue(lines), timings, turns, [{ turnId: "t1", atMs: 4000 }, { turnId: "t2", atMs: 7000 }]);
  const s = scoreLines(r);
  assert.deepEqual([s.truePositives, s.falsePositives, s.falseNegatives], [1, 1, 1]);
  assert.equal(s.precision, 0.5);
  assert.equal(s.recall, 0.5);
  assert.equal(s.falseCueRate, 1);
  assert.equal(s.cuesOnStatements, 0);
  assert.equal(s.questions, 3);
  assert.equal(s.questionsHeard, 2);
});

test("a cue on a statement is a false positive and counted on its own", () => {
  const turns = [turn("t3", 6000, 8000, 8500)];
  const { lines: r } = matchLines(dialogue(lines), timings, turns, [{ turnId: "t3", atMs: 9000 }]);
  const s = scoreLines(r);
  assert.equal(s.cuesOnStatements, 1);
  assert.equal(s.falsePositives, 1);
  assert.equal(s.falseCueRate, 0, "no question aimed elsewhere got a cue");
});

test("with nothing to divide by, the rates are undefined, not zero", () => {
  const s = scoreLines([]);
  assert.equal(s.precision, undefined);
  assert.equal(s.recall, undefined);
  assert.equal(s.falseCueRate, undefined);
});

test("tokens are summed, missing usage counts as zero, and the summary averages per meeting", () => {
  const usage: RawUsage[] = [{ label: "cue", ms: 1, promptTokens: 100, cachedTokens: 40, completionTokens: 10 }, { label: "address", ms: 1 }];
  assert.deepEqual(sumUsage(usage), { prompt: 100, cached: 40, completion: 10, calls: 2 });
  const s = summarize([{ results: [], mergedTurns: 1, usage }, { results: [], mergedTurns: 0, usage: [] }]);
  assert.deepEqual(s.tokensPerMeeting, { prompt: 50, cached: 20, completion: 5, calls: 1 });
  assert.equal(s.mergedTurns, 1);
  assert.equal(s.dialogues, 2);
});

test("a merged turn gives its cue to the question line and times from its last line", () => {
  // t1 swallowed the statement (line 0) and the question for the wearer (line 1)
  const ls = [{ speaker: "P", text: "statement" }, { speaker: "P", text: "q", question: true, addressedToWearer: true }] as Dialogue["lines"];
  const tm = [{ startMs: 0, endMs: 2000 }, { startMs: 2500, endMs: 4500 }];
  const { lines: r, mergedTurns } = matchLines(dialogue(ls), tm, [turn("t1", 0, 4500, 6000)], [{ turnId: "t1", atMs: 7500, modelMs: 1000 }]);
  assert.equal(mergedTurns, 1);
  assert.equal(r[0].cued, false, "the statement did not get the cue");
  assert.equal(r[1].cued, true);
  assert.deepEqual([r[0].finalizeMs, r[1].finalizeMs, r[1].cueMs], [1500, 1500, 3000]);
  const s = scoreLines(r);
  assert.deepEqual([s.truePositives, s.falsePositives, s.cuesOnStatements], [1, 0, 0]);
});

test("a merged turn with no question gives its cue to the last line", () => {
  const ls = [{ speaker: "P", text: "a" }, { speaker: "P", text: "b" }] as Dialogue["lines"];
  const tm = [{ startMs: 0, endMs: 2000 }, { startMs: 2500, endMs: 4500 }];
  const { lines: r } = matchLines(dialogue(ls), tm, [turn("t1", 0, 4500, 5000)], [{ turnId: "t1", atMs: 6000 }]);
  assert.deepEqual(r.map((x) => x.cued), [false, true]);
});

test("stage spreads pool each stage's time over cues and skip stages nobody reached", () => {
  const s = stageSpreads([
    { heard: 0, turn: 700, asked: 800, firstToken: 1600, done: 1650, sent: 1651, phone: 1680 },
    { heard: 0, turn: 900, asked: 950, firstToken: 1950, done: 2000, sent: 2001 },
  ]);
  assert.deepEqual(s.turn, { n: 2, p50: 700, p95: 900 });
  assert.deepEqual(s.firstToken, { n: 2, p50: 800, p95: 1000 });
  assert.deepEqual(s.phone, { n: 1, p50: 29, p95: 29 });
  assert.equal(s.heard, undefined);
});
