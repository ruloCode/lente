import assert from "node:assert/strict";
import { test } from "node:test";
import { turnIdOf } from "../src/asr-session.ts";
import { AudioConditioner, ClipFrameParser, JitterBuffer, encodeFrame, isQuestion, rms, toCue } from "../src/clip-protocol.ts";

test("turn id 0 is a real turn, not a missing one", () => {
  assert.equal(turnIdOf({ turnId: 0 }), "0");
  assert.equal(turnIdOf({ turnId: "7" }), "7");
  assert.equal(turnIdOf({}), undefined);
  assert.equal(turnIdOf({ turnId: null }), undefined);
});

const pcm = (...samples: number[]) => {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => b.writeInt16LE(s, i * 2));
  return b;
};
const samplesOf = (b: Buffer) => Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2));

test("frame parser reassembles frames split and merged across TCP chunks", () => {
  const p = new ClipFrameParser();
  const wire = Buffer.concat([encodeFrame("H", Buffer.from('{"fw":"pilot"}')), encodeFrame("A", pcm(1, 2, 3))]);
  assert.deepEqual(p.push(wire.subarray(0, 3)), []);
  const frames = p.push(wire.subarray(3));
  assert.deepEqual(frames.map((f) => f.type), ["H", "A"]);
  assert.equal(frames[0].payload.toString(), '{"fw":"pilot"}');
  assert.deepEqual(samplesOf(frames[1].payload), [1, 2, 3]);
});

test("frame parser rejects absurd lengths instead of buffering forever", () => {
  const header = Buffer.from([0x41, 0xff, 0xff, 0xff, 0x7f]);
  assert.throws(() => new ClipFrameParser().push(header), /too large/);
});

test("conditioner removes the PDM offset and applies gain with clipping", () => {
  const c = new AudioConditioner(10);
  assert.deepEqual(samplesOf(c.process(pcm(1500, 1510, 1490, 1500))), [0, 100, -100, 0]);
  assert.equal(samplesOf(new AudioConditioner(1000).process(pcm(0, 0, 32000, 0)))[2], 32767);
});

test("rms measures loudness and is zero for silence or empty input", () => {
  assert.equal(rms(pcm(0, 0)), 0);
  assert.equal(rms(Buffer.alloc(0)), 0);
  assert.equal(rms(pcm(3, -3, 3, -3)), 3);
});

test("jitter buffer always yields whole frames, padding gaps with silence", () => {
  const j = new JitterBuffer(4, 100);
  j.push(pcm(7, 8, 9));
  assert.deepEqual(samplesOf(j.take()), [7, 8]);
  assert.deepEqual(samplesOf(j.take()), [9, 0]);
  assert.deepEqual(samplesOf(j.take()), [0, 0]);
});

test("jitter buffer drops the oldest audio when the clip runs ahead", () => {
  const j = new JitterBuffer(2, 4);
  j.push(pcm(1, 2, 3));
  assert.equal(j.bufferedBytes, 4);
  assert.deepEqual(samplesOf(j.take()), [2]);
});

test("isQuestion catches questions with or without a question mark", () => {
  assert.equal(isQuestion("Can you ship the beta by Friday"), true);
  assert.equal(isQuestion("Okay. So what's the main blocker?"), true);
  assert.equal(isQuestion("Okay, let's move on. Who owns the API"), true);
  assert.equal(isQuestion("¿Lo tienes para el viernes"), true);
  assert.equal(isQuestion("I think we should ship it."), false);
  assert.equal(isQuestion("   "), false);
});

test("toCue keeps one clean line under the limit", () => {
  assert.equal(toCue('Say this: "Yes, we can ship by Friday."\nMore text'), "Yes, we can ship by Friday.");
  const long = toCue("Yes we can definitely ship the beta by Friday if we cut the analytics dashboard from scope", 60);
  assert.ok(long.length <= 60 && long.endsWith("…"));
});
