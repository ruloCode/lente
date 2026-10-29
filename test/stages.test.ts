import assert from "node:assert/strict";
import { test } from "node:test";
import { ArrivalClock, formatStages, stageGaps } from "../src/stages.ts";

test("stage gaps are measured from the previous stamped stage, in order", () => {
  const cue = { heard: 1000, turn: 1800, asked: 1950, firstToken: 2700, done: 2760, sent: 2761, phone: 2790 };
  assert.deepEqual(stageGaps(cue), [
    { stage: "turn", ms: 800 },
    { stage: "asked", ms: 150 },
    { stage: "firstToken", ms: 750 },
    { stage: "done", ms: 60 },
    { stage: "sent", ms: 1 },
    { stage: "phone", ms: 29 },
  ]);
  assert.equal(formatStages(cue), "heard→turn 800 · turn→asked 150 · asked→firstToken 750 · firstToken→done 60 · done→sent 1 · sent→phone 29");
});

test("a photo skips the turn stage and a missing stamp is bridged, never negative", () => {
  assert.deepEqual(stageGaps({ heard: 500, asked: 505, done: 1500, sent: 1490 }), [
    { stage: "asked", ms: 5 },
    { stage: "done", ms: 995 },
    { stage: "sent", ms: 0 },
  ]);
  assert.equal(formatStages({ heard: 500, asked: 505, done: 1500 }), "heard→asked 5 · asked→done 995");
  assert.deepEqual(stageGaps({ turn: 10 }), []);
});

test("arrival clock gives the first arrival that covered a session position", () => {
  const clock = new ArrivalClock();
  clock.note(80, 10_000);
  clock.note(160, 10_090);
  clock.note(400, 10_300); // a Wi-Fi burst: three frames at once
  assert.equal(clock.at(0), 10_000);
  assert.equal(clock.at(80), 10_000);
  assert.equal(clock.at(81), 10_090);
  assert.equal(clock.at(250), 10_300);
  assert.equal(clock.at(401), undefined, "not heard yet");
});

test("arrival clock forgets old audio instead of answering with a later arrival", () => {
  const clock = new ArrivalClock();
  for (let i = 1; i <= 1001; i++) clock.note(i * 80, i);
  assert.equal(clock.at(40), undefined);
  assert.equal(clock.at(80), undefined);
  assert.equal(clock.at(81), 2);
  assert.equal(clock.at(80_080), 1001);
});
