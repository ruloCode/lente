// add-media-archive 1.1: IMA ADPCM in TypeScript and the per-segment buffer. A synthetic tone survives
// the round trip close to the original; a minute is a quarter of PCM16; empty and very short segments
// keep nothing; the header says codec, rate and length; foreign or truncated bytes are refused.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AudioBuffer, CODEC_IMA_ADPCM, MEDIA_RATE, MIN_CHUNK_MS, chunkInfo, decodeAdpcm, encodeAdpcm, wav } from "../src/media-chunks.ts";

/** A 440 Hz tone with a slow swell, `ms` long, PCM16 LE mono at 16 kHz. */
function tone(ms: number): Uint8Array {
  const n = Math.round((ms / 1000) * MEDIA_RATE);
  const out = new Uint8Array(n * 2);
  const v = new DataView(out.buffer);
  for (let i = 0; i < n; i++) v.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / MEDIA_RATE) * 9000 * (0.5 + 0.5 * Math.sin(i / 4000))), true);
  return out;
}

test("ADPCM round-trips a tone closely, at a quarter of the size", () => {
  const pcm = tone(2000);
  const chunk = encodeAdpcm(pcm);
  assert.deepEqual(chunkInfo(chunk), { codec: CODEC_IMA_ADPCM, rate: MEDIA_RATE, samples: 32_000, ms: 2000 });
  const back = decodeAdpcm(chunk);
  assert.equal(back.length, pcm.length);
  const a = new DataView(pcm.buffer);
  const b = new DataView(back.buffer);
  let signal = 0;
  let noise = 0;
  for (let i = 0; i < 32_000; i++) {
    const x = a.getInt16(i * 2, true);
    signal += x * x;
    noise += (x - b.getInt16(i * 2, true)) ** 2;
  }
  const snrDb = 10 * Math.log10(signal / noise);
  assert.ok(snrDb > 20, `SNR ${snrDb.toFixed(1)} dB`);
  // A minute: PCM16 is 1.92 MB; ADPCM about 0.48 MB (about 29 MB an hour).
  const minute = encodeAdpcm(tone(60_000));
  assert.ok(Math.abs(minute.length - 480_016) <= 1, `${minute.length} bytes a minute`);
  const file = wav(back);
  assert.equal(new TextDecoder().decode(file.subarray(0, 4)), "RIFF");
  assert.equal(file.length, 44 + back.length);
});

test("the buffer cuts a segment into a chunk; empty and very short segments keep nothing; a dropped one keeps nothing", () => {
  const buf = new AudioBuffer();
  assert.equal(buf.cut("s1:1"), undefined);
  buf.push(tone(MIN_CHUNK_MS - 50), 1000);
  assert.equal(buf.cut("s1:2"), undefined, "too short");
  buf.push(tone(800), 5000);
  buf.push(tone(700), 5800);
  const chunk = buf.cut("s1:3")!;
  assert.deepEqual([chunk.segment, chunk.at, chunk.ms], ["s1:3", 5000, 1500]);
  assert.equal(chunkInfo(chunk.bytes).ms, 1500);
  buf.push(tone(900), 9000);
  buf.drop();
  assert.equal(buf.cut("s1:4"), undefined, "a switch turned off mid-segment keeps nothing");
});

test("foreign, newer or truncated bytes are refused", () => {
  assert.throws(() => chunkInfo(new TextEncoder().encode("not audio at all!")), /not a Lente audio chunk/);
  const chunk = encodeAdpcm(tone(500));
  const newer = chunk.slice();
  newer[4] = 2;
  assert.throws(() => chunkInfo(newer), /version 2/);
  assert.throws(() => decodeAdpcm(chunk.subarray(0, 100)), /truncated/);
  assert.equal(decodeAdpcm(encodeAdpcm(new Uint8Array(0))).length, 0);
});
