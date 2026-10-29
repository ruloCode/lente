import assert from "node:assert/strict";
import { test } from "node:test";
import { GATE_DEFAULTS, SilenceGate } from "../src/silence-gate.ts";

const QUIET = 40;
const SPEECH = 2000;
const FRAMES_PER_S = 1000 / GATE_DEFAULTS.frameMs;
const seconds = (s: number) => Math.round(s * FRAMES_PER_S);

/** Feeds levels as numbered frames; returns every frame sent and the frames where a session was opened. */
function run(gate: SilenceGate<number>, levels: number[], from = 0) {
  const sent: number[] = [];
  const reopenedAt: number[] = [];
  levels.forEach((level, i) => {
    const step = gate.push(from + i, level);
    if (step.reopen) reopenedAt.push(from + i);
    sent.push(...step.send);
  });
  return { sent, reopenedAt };
}

const repeat = (level: number, frames: number) => Array<number>(frames).fill(level);

test("gate: ten minutes of silence sends nothing", () => {
  const { sent, reopenedAt } = run(new SilenceGate(), repeat(QUIET, seconds(10 * 60)));
  assert.equal(sent.length, 0);
  assert.deepEqual(reopenedAt, []);
});

test("gate: speech after silence opens a session and sends the pre-roll first", () => {
  const gate = new SilenceGate<number>();
  const silence = seconds(30);
  const { sent, reopenedAt } = run(gate, [...repeat(QUIET, silence), ...repeat(SPEECH, 10)]);
  const preRoll = GATE_DEFAULTS.preRollMs / GATE_DEFAULTS.frameMs;
  assert.deepEqual(reopenedAt, [silence]);
  assert.equal(sent[0], silence - preRoll, "the pre-roll goes first");
  assert.deepEqual(sent, Array.from({ length: preRoll + 10 }, (_, i) => silence - preRoll + i), "then every frame, in order");
});

test("gate: keeps sending through the hangover, then stops", () => {
  const gate = new SilenceGate<number>();
  const hangover = GATE_DEFAULTS.hangoverMs / GATE_DEFAULTS.frameMs;
  const { sent } = run(gate, [...repeat(QUIET, 20), ...repeat(SPEECH, 5), ...repeat(QUIET, 60)]);
  const last = sent[sent.length - 1];
  assert.equal(last, 20 + 5 - 1 + hangover, "silence after speech is sent for the hangover only");
  assert.equal(gate.open, false);
});

test("gate: a short pause inside a sentence keeps the gate open and the session", () => {
  const gate = new SilenceGate<number>();
  const levels = [...repeat(QUIET, 20), ...repeat(SPEECH, 10), ...repeat(QUIET, 8), ...repeat(SPEECH, 10)];
  const { sent, reopenedAt } = run(gate, levels);
  assert.deepEqual(reopenedAt, [20]);
  assert.equal(sent.length, levels.length - 20 + GATE_DEFAULTS.preRollMs / GATE_DEFAULTS.frameMs);
});

test("gate: after a pause the session is reused, after the service closed it it is reopened", () => {
  const gate = new SilenceGate<number>();
  const talk = [...repeat(SPEECH, 5), ...repeat(QUIET, 60)];
  const first = run(gate, [...repeat(QUIET, 10), ...talk]);
  const second = run(gate, talk, 100);
  assert.deepEqual(first.reopenedAt, [10]);
  assert.deepEqual(second.reopenedAt, [], "the session is still open");
  gate.closed();
  const third = run(gate, talk, 200);
  assert.deepEqual(third.reopenedAt, [200]);
  const preRoll = GATE_DEFAULTS.preRollMs / GATE_DEFAULTS.frameMs;
  const before = Array.from({ length: preRoll }, (_, i) => 100 + talk.length - preRoll + i);
  assert.deepEqual(third.sent.slice(0, preRoll + 1), [...before, 200], "the last quiet frames go first, then the speech");
});

test("gate: a steady noise above the floor does not hold the gate open", () => {
  const fan = 500; // above the minimum, so only the noise floor keeps it out
  const gate = new SilenceGate<number>();
  const warmUp = run(gate, repeat(fan, seconds(15)));
  const settled = run(gate, repeat(fan, seconds(60)), seconds(15));
  assert.ok(warmUp.sent.length < seconds(3), `the first second of fan opens it at most for the hangover, sent ${warmUp.sent.length}`);
  assert.equal(settled.sent.length, 0);
  assert.equal(gate.threshold(), fan * GATE_DEFAULTS.floorRatio);
  const voice = run(gate, repeat(fan * 4, 5), seconds(75));
  assert.ok(voice.sent.length > 0, "a voice over the fan still opens it");
});

test("gate: the minimum level holds in a silent room", () => {
  const gate = new SilenceGate<number>({ minSpeechRms: 300 });
  run(gate, repeat(0, 50));
  assert.equal(gate.threshold(), 300);
  assert.equal(run(gate, repeat(299, 5)).sent.length, 0);
  assert.equal(run(gate, repeat(300, 1)).sent.length, 1 + GATE_DEFAULTS.preRollMs / GATE_DEFAULTS.frameMs);
});
