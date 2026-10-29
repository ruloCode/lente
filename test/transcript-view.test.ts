import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSCRIPT_MAX_ROWS, type TranscriptEvent, type TranscriptView, emptyTranscript, reduceTranscript } from "../src/transcript-view.ts";

const T0 = Date.UTC(2026, 9, 28, 15, 0, 0);
const run = (events: TranscriptEvent[], from: TranscriptView = emptyTranscript()) => events.reduce(reduceTranscript, from);
const texts = (v: TranscriptView) => v.rows.map((r) => r.text);
const listening = { kind: "status", listening: true, session: { startedAt: T0 } } as const;

test("transcript: partials grow the live row in place", () => {
  const v = run([listening, { kind: "partial", text: "Can we" }, { kind: "partial", text: "Can we ship on" }]);
  assert.equal(v.live, "Can we ship on");
  assert.equal(v.rows.length, 0);
});

test("transcript: a completed turn replaces the live row, one row for it", () => {
  const v = run([listening, { kind: "partial", text: "Can we ship" }, { kind: "turn", at: T0 + 2000, text: "Can we ship on Friday?", speaker: "B", turnId: 0 }]);
  assert.equal(v.live, "");
  assert.deepEqual(texts(v), ["Can we ship on Friday?"]);
  assert.equal(v.rows[0].speaker, "B");
});

test("transcript: a snapshot that repeats turns already shown adds no duplicate", () => {
  const turn = { kind: "turn", at: T0 + 2000, text: "Can we ship on Friday?", turnId: 0 } as const;
  const v = run([listening, turn, { kind: "turn", at: T0 + 5000, text: "Sure.", turnId: 1 }]);
  const again = run([listening, { kind: "history", items: [{ ...turn }, { kind: "turn", at: T0 + 5000, text: "Sure.", turnId: "1" }, { kind: "turn", at: T0 + 8000, text: "Great." }] }], v);
  assert.deepEqual(texts(again), ["Can we ship on Friday?", "Sure.", "Great."]);
  assert.equal(run([turn], again).rows.length, 3);
});

test("transcript: the snapshot keeps only turns of this session, oldest first, and no other kinds", () => {
  const v = run([
    listening,
    { kind: "turn", at: T0 + 9000, text: "Newest." },
    {
      kind: "history",
      items: [
        { kind: "turn", at: T0 - 60_000, text: "From an earlier session." },
        { kind: "summary", at: T0 + 1000, text: "A summary" },
        { kind: "cue", at: T0 + 1500, text: "A cue" },
        { kind: "turn", at: T0 + 1000, text: "First." },
      ],
    },
  ]);
  assert.deepEqual(texts(v), ["First.", "Newest."]);
});

test("transcript: the snapshot drops a stale live row; the partial after it brings the current one", () => {
  const v = run([listening, { kind: "partial", text: "Half a sent" }, { kind: "history", items: [{ kind: "turn", at: T0 + 1000, text: "Half a sentence, finished." }] }]);
  assert.equal(v.live, "");
  assert.equal(run([{ kind: "partial", text: "Next one" }], v).live, "Next one");
});

test("transcript: a speaker label that arrives late updates the row in place", () => {
  const v = run([listening, { kind: "turn", at: T0 + 1000, text: "Hi.", turnId: 3 }, { kind: "speaker", turnId: "3", speaker: "A" }]);
  assert.equal(v.rows.length, 1);
  assert.equal(v.rows[0].speaker, "A");
});

test("transcript: a speaker label that arrives before its turn is kept for it", () => {
  const v = run([listening, { kind: "speaker", turnId: 4, speaker: "B" }, { kind: "turn", at: T0 + 1000, text: "Hello.", turnId: 4 }]);
  assert.equal(v.rows[0].speaker, "B");
  assert.deepEqual(v.pending, {});
});

test("transcript: a repeated turn id updates the newest row with it", () => {
  const v = run([listening, { kind: "turn", at: T0 + 1000, text: "Old.", turnId: 0, speaker: "A" }, { kind: "turn", at: T0 + 9000, text: "New.", turnId: 0 }, { kind: "speaker", turnId: 0, speaker: "B" }]);
  assert.deepEqual(v.rows.map((r) => r.speaker), ["A", "B"]);
});

test("transcript: pause drops the live row, keeps the turns and ignores partials until listening again", () => {
  const v = run([listening, { kind: "turn", at: T0 + 1000, text: "Done." }, { kind: "partial", text: "In prog" }, { ...listening, listening: false }]);
  assert.equal(v.paused, true);
  assert.equal(v.live, "");
  assert.deepEqual(texts(v), ["Done."]);
  assert.equal(run([{ kind: "partial", text: "late" }], v).live, "");
  assert.equal(run([listening, { kind: "partial", text: "back" }], v).live, "back");
});

test("transcript: a new session starts an empty transcript", () => {
  const v = run([listening, { kind: "turn", at: T0 + 1000, text: "Before." }]);
  const next = run([{ kind: "status", listening: true, session: { startedAt: T0 + 60_000 } }, { kind: "turn", at: T0 + 61_000, text: "After." }], v);
  assert.deepEqual(texts(next), ["After."]);
});

test("transcript: unrelated messages change nothing", () => {
  const v = run([listening, { kind: "turn", at: T0 + 1000, text: "Hi." }]);
  assert.equal(reduceTranscript(v, { kind: "level" }), v);
  assert.equal(reduceTranscript(v, { kind: "cue" }), v);
  assert.equal(reduceTranscript(v, listening), v);
});

test("transcript: rows are capped, the newest kept", () => {
  const turns = Array.from({ length: TRANSCRIPT_MAX_ROWS + 20 }, (_, i) => ({ kind: "turn", at: T0 + i, text: `t${i}` }));
  const v = run([listening, { kind: "history", items: turns }]);
  assert.equal(v.rows.length, TRANSCRIPT_MAX_ROWS);
  assert.equal(v.rows.at(-1)!.text, `t${TRANSCRIPT_MAX_ROWS + 19}`);
});
