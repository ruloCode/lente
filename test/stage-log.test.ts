import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCallLine, parseStageLine, summarizeSight } from "../src/stage-log.ts";

// Lines in the exact shape the hub prints (copied from the format in src/pilot.ts, synthetic values).
const LIVE_STAGES = "[stages] live · heard→asked 337 · asked→firstToken 2281 · firstToken→done 123 · done→sent 0 · sent→phone 1515 ms";
const LOOK_STAGES = "[stages] cue VER · heard→asked 20 · asked→firstToken 1400 · firstToken→done 300 · done→sent 1 · sent→phone 200 ms";

test("a stages line gives its gaps and their total", () => {
  const s = parseStageLine(LIVE_STAGES);
  assert.ok(s);
  assert.equal(s.kind, "live");
  assert.equal(s.label, undefined);
  assert.equal(s.gaps["asked→firstToken"], 2281);
  assert.equal(s.total, 337 + 2281 + 123 + 0 + 1515);
});

test("a labelled stages line keeps its label", () => {
  const s = parseStageLine(LOOK_STAGES);
  assert.equal(s?.kind, "cue");
  assert.equal(s?.label, "VER");
  assert.equal(parseStageLine("[stages] cue ON SCREEN · heard→asked 5 ms")?.label, "ON SCREEN");
});

test("Modal's prefix and other lines are ignored", () => {
  assert.ok(parseStageLine(`2026-11-04T14:00:00Z ${LIVE_STAGES}`));
  assert.equal(parseStageLine("   POST /seen -> 204 No Content  (duration: 1.50 s)"), undefined);
  assert.equal(parseCallLine("[clip] photo 20 KB"), undefined);
});

test("call lines: time, size and unchanged", () => {
  assert.deepEqual(parseCallLine("[live] 1626 ms · 21 KB · ‹52 chars›"), { kind: "live", ms: 1626, unchanged: false, stale: false, kb: 21 });
  assert.deepEqual(parseCallLine("[live] 1400 ms · 18 KB · unchanged"), { kind: "live", ms: 1400, unchanged: true, stale: false, kb: 18 });
  assert.equal(parseCallLine("[look] 1210 ms · ‹80 chars›")?.kind, "look");
  assert.equal(parseCallLine("[live] 7100 ms · 30 KB · stale, not said (7300 ms after its frame)")?.stale, true);
});

test("the summary counts silences, times and intervals between shown descriptions", () => {
  const lines = [
    { at: 0, line: "[live] 1500 ms · 20 KB · ‹40 chars›" },
    { at: 100, line: LIVE_STAGES },
    { at: 1500, line: "[live] 1400 ms · 20 KB · unchanged" },
    { at: 3000, line: "[live] 1700 ms · 20 KB · ‹30 chars›" },
    { at: 3100, line: LIVE_STAGES },
    { at: 4000, line: "[look] 1700 ms · ‹90 chars›" },
    { at: 4100, line: LOOK_STAGES },
  ];
  const s = summarizeSight(lines);
  assert.deepEqual(s.unchanged, { n: 1, of: 3 });
  assert.equal(s.liveModel.n, 3);
  assert.equal(s.liveModel.p50, 1500);
  assert.equal(s.liveToPhone.n, 2);
  assert.deepEqual(s.liveInterval, { n: 1, p50: 3000, p90: 3000, max: 3000 });
  assert.equal(s.lookModel.n, 1);
  assert.equal(s.lookToPhone.p50, 1921);
});
