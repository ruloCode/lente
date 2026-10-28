import assert from "node:assert/strict";
import { test } from "node:test";
import { turnIdOf } from "../src/asr-session.ts";
import { readFileSync } from "node:fs";
import { HEADER, loadFixtures, renderFixturesHeader } from "../scripts/gen-fixtures-header.ts";
import { AsrSession } from "../src/asr-session.ts";
import {
  AudioConditioner,
  AudioTimeline,
  BYTES_PER_MS,
  ClipFrameParser,
  JitterBuffer,
  StreamMap,
  encodeFrame,
  isQuestion,
  parseAudioFrame,
  parseHello,
  rms,
  toCue,
} from "../src/clip-protocol.ts";

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

// --- Protocol v2 ---------------------------------------------------------------------------------

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/frames.json", import.meta.url), "utf8")) as {
  frames: { name: string; type: string; base64: string; hello?: object; seq?: number; timeMs?: number; samples?: number[] }[];
};
const FRAME_BYTES = 2560;
const audioPayload = (seq: number, timeMs: number, samples: number[]) => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(seq, 0);
  header.writeUInt32LE(timeMs, 4);
  return Buffer.concat([header, pcm(...samples)]);
};

test("golden frames decode to the types, sequences, times and samples in the fixtures", () => {
  const parser = new ClipFrameParser();
  for (const f of fixtures.frames) {
    const wire = Buffer.from(f.base64, "base64");
    const [frame] = parser.push(wire);
    assert.equal(frame.type, f.type, f.name);
    if (f.hello) {
      const result = parseHello(frame.payload);
      assert.ok(result.ok, f.name);
      assert.deepEqual(result.hello, {
        proto: "2.0", fw: "pilot-2", codec: "pcm16", rate: 16000, device: "lente-clip",
      });
      assert.equal(encodeFrame("H", Buffer.from(JSON.stringify(f.hello))).toString("base64"), f.base64, `${f.name} re-encodes`);
    } else {
      const a = parseAudioFrame(frame.payload);
      assert.equal(a.seq, f.seq, f.name);
      assert.equal(a.timeMs, f.timeMs, f.name);
      assert.deepEqual(samplesOf(a.pcm), f.samples, f.name);
      assert.equal(encodeFrame("A", audioPayload(f.seq!, f.timeMs!, f.samples!)).toString("base64"), f.base64, `${f.name} re-encodes`);
    }
  }
});

test("hello: accepts any minor of the same major and refuses other majors with a plain message", () => {
  const hello = (o: object) => Buffer.from(JSON.stringify(o));
  const base = { fw: "x", codec: "pcm16", rate: 16000 };
  assert.ok(parseHello(hello({ ...base, proto: "2.7" })).ok);
  const v1 = parseHello(hello({ device: "lente-clip", fw: "pilot-2", rssi: -50 }));
  assert.ok(!v1.ok && /update the clip firmware/.test(v1.reason) && /1\.0/.test(v1.reason));
  const v3 = parseHello(hello({ ...base, proto: "3.0" }));
  assert.ok(!v3.ok && /update the clip firmware/.test(v3.reason));
  assert.ok(!parseHello(hello({ ...base, proto: "2.0", codec: "opus" })).ok);
  assert.ok(!parseHello(hello({ ...base, proto: "2.0", rate: 8000 })).ok);
  assert.ok(!parseHello(Buffer.from("not json")).ok);
  assert.ok(!parseHello(Buffer.from("null")).ok);
});

test("audio frame header: too short is an error, an odd trailing byte is not a sample", () => {
  assert.throws(() => parseAudioFrame(Buffer.alloc(7)), /shorter than its 8-byte header/);
  const a = parseAudioFrame(Buffer.concat([audioPayload(1, 2, [5]), Buffer.from([9])]));
  assert.deepEqual(samplesOf(a.pcm), [5]);
});

test("timeline counts a gap and fills it with silence of the missing duration", () => {
  const t = new AudioTimeline(FRAME_BYTES);
  const frame = Buffer.alloc(FRAME_BYTES, 1);
  assert.deepEqual(t.accept(10, frame).lost, 0);
  assert.equal(t.accept(11, frame).pcm.length, FRAME_BYTES);
  const gap = t.accept(17, frame); // 12..16 lost: five frames
  assert.equal(gap.lost, 5);
  assert.equal(gap.pcm.length, 6 * FRAME_BYTES);
  assert.ok(gap.pcm.subarray(0, 5 * FRAME_BYTES).every((b) => b === 0));
  assert.equal(t.lost, 5);
  assert.equal(t.positionMs, 8 * 80);
  assert.equal(t.received, 3);
});

test("timeline drops late and duplicate frames and counts them", () => {
  const t = new AudioTimeline(FRAME_BYTES);
  const frame = Buffer.alloc(FRAME_BYTES);
  t.accept(0, frame);
  t.accept(2, frame);
  assert.equal(t.accept(1, frame).pcm.length, 0);
  assert.equal(t.accept(2, frame).pcm.length, 0);
  assert.deepEqual([t.lost, t.late, t.received], [1, 2, 2]);
  assert.equal(t.positionMs, 3 * 80);
});

test("timeline caps the silence it inserts on an absurd gap but still counts it", () => {
  const t = new AudioTimeline(FRAME_BYTES);
  t.accept(0, Buffer.alloc(FRAME_BYTES));
  const out = t.accept(1_000_000, Buffer.alloc(FRAME_BYTES));
  assert.equal(t.lost, 999_999);
  assert.ok(out.pcm.length <= (10_000 * BYTES_PER_MS) + FRAME_BYTES);
});

test("a stream position maps to the session audio, whatever the lag or silence padding", () => {
  const map = new StreamMap(80);
  assert.equal(map.sessionMsAt(0), undefined);
  // Frame 0 and 1 are real audio; frame 2 was silence padding (session did not advance); frame 3 resumes.
  [0, 80, 160, 160].forEach((ms) => map.record(ms));
  assert.equal(map.sessionMsAt(0), 0);
  assert.equal(map.sessionMsAt(100), 100);
  assert.equal(map.sessionMsAt(3 * 80 + 10), 170);
  assert.equal(map.sessionMsAt(10_000), 160 + (10_000 - 3 * 80), "past the end extends the last frame");
});

test("jitter buffer reports consumed session audio, counting dropped audio but not padding", () => {
  const j = new JitterBuffer(8, 16);
  j.push(Buffer.alloc(4));
  assert.equal(j.consumedMs, 0);
  j.take(); // 4 real bytes + 4 padding
  assert.equal(j.consumedMs, 4 / BYTES_PER_MS);
  j.push(Buffer.alloc(24)); // 8 bytes dropped
  assert.equal(j.consumedMs, 12 / BYTES_PER_MS);
});

test("turns carry offsets in the session audio, anchored to speech rather than to arrival", () => {
  const turns: { startMs?: number; endMs?: number; text: string }[] = [];
  const session = new AsrSession("k", { onTurn: (t) => turns.push(t), onSpeaker() {}, onPartial() {}, onStatus() {} });
  session["onMessage"](JSON.stringify({ sessionId: "s" })); // ready; nothing queued
  // Session audio started 5 s in; 100 frames of the stream cover it 1:1.
  for (let i = 0; i < 100; i++) session["streamMap"].record(5000 + i * 80);
  session["onMessage"](JSON.stringify({ type: "speechStart", turnId: 0, audioProcessedMs: 1000 }));
  session["onMessage"](JSON.stringify({ type: "transcript", final: true, transcript: "hola", audioProcessedMs: 2400 }));
  session["onMessage"](JSON.stringify({ type: "speechComplete", turnId: 0, transcript: "hola" }));
  assert.deepEqual(turns, [{ turnId: "0", text: "hola", speaker: undefined, startMs: 6000, endMs: 7400 }]);
});

test("the firmware self-test header is generated from the shared fixtures (run pnpm gen:fixtures)", () => {
  assert.equal(readFileSync(HEADER, "utf8"), renderFixturesHeader(loadFixtures()));
});
