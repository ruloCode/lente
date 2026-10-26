import assert from "node:assert/strict";
import { test } from "node:test";
import { SseParser, deltaText } from "../src/sse.ts";
import { percentile } from "../src/stats.ts";
import { frameBytes, readPcm16Wav } from "../src/wav.ts";

test("SSE parser joins events split across network chunks", () => {
  const p = new SseParser();
  assert.deepEqual(p.push('data: {"a":'), []);
  assert.deepEqual(p.push('1}\n\ndata: [DONE]\n\n'), ['{"a":1}', "[DONE]"]);
});

test("SSE parser handles CRLF and ignores comments", () => {
  const p = new SseParser();
  assert.deepEqual(p.push(": keep-alive\r\n\r\ndata: x\r\n\r\n"), ["x"]);
});

test("deltaText reads content deltas and ignores everything else", () => {
  assert.equal(deltaText('{"choices":[{"delta":{"content":"Hi"}}]}'), "Hi");
  assert.equal(deltaText('{"choices":[{"delta":{"role":"assistant"}}]}'), "");
  assert.equal(deltaText("[DONE]"), "");
  assert.equal(deltaText("not json"), "");
});

test("percentile uses nearest rank and tolerates empty samples", () => {
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile([300, 100, 200], 50), 200);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});

test("80 ms of 24 kHz PCM16 is 3,840 bytes (Meta realtime frame)", () => {
  assert.equal(frameBytes(24000, 80), 3840);
  assert.equal(frameBytes(16000, 80), 2560);
});

function wav(opts: { rate: number; channels: number; bits: number; samples: number }): Buffer {
  const data = Buffer.alloc(opts.samples * opts.channels * (opts.bits / 8));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(opts.channels, 22);
  header.writeUInt32LE(opts.rate, 24);
  header.writeUInt32LE(opts.rate * opts.channels * (opts.bits / 8), 28);
  header.writeUInt16LE(opts.channels * (opts.bits / 8), 32);
  header.writeUInt16LE(opts.bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("readPcm16Wav returns rate and payload of a mono PCM16 file", () => {
  const pcm = readPcm16Wav(wav({ rate: 24000, channels: 1, bits: 16, samples: 2400 }));
  assert.equal(pcm.sampleRate, 24000);
  assert.equal(pcm.data.length, 4800);
});

test("readPcm16Wav rejects stereo with the ffmpeg fix in the message", () => {
  assert.throws(
    () => readPcm16Wav(wav({ rate: 24000, channels: 2, bits: 16, samples: 10 })),
    /ffmpeg/,
  );
});
