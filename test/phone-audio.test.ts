import assert from "node:assert/strict";
import { test } from "node:test";
import { ClipFrameParser, encodeAudioFrame, encodeHello, parseAudioFrame, parseHello } from "../src/clip-protocol.ts";
import { PHONE_AUDIO_PAGE_SCRIPT, PHONE_FRAME_SAMPLES, PcmFramer, PcmResampler, phoneAudioFrame, phoneHello } from "../src/phone-audio.ts";

const sine = (rate: number, hz: number, seconds: number): Float32Array =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

test("resampler: 48 kHz in, 16 kHz out, a tone keeps its amplitude", () => {
  const out = new PcmResampler(48000).push(sine(48000, 440, 1));
  assert.equal(out.length, 16000);
  const peak = Math.max(...out.map(Math.abs));
  assert.ok(peak > 0.45 * 32767 && peak <= 0.5 * 32767 + 50, `peak ${peak}`);
});

test("resampler: cutting the input anywhere gives the same output", () => {
  const input = sine(44100, 300, 0.5);
  const whole = new PcmResampler(44100).push(input);
  const cut = new PcmResampler(44100);
  const parts: number[] = [];
  for (let at = 0; at < input.length; at += 333) parts.push(...cut.push(input.subarray(at, at + 333)));
  assert.deepEqual(Int16Array.from(parts), whole);
});

test("resampler: clips out-of-range input and passes 16 kHz through", () => {
  const out = new PcmResampler(16000).push(Float32Array.from([2, -2, 0.5]));
  assert.deepEqual([...out], [32767, -32768, 16384]);
});

test("framer: 80 ms frames regardless of how the samples arrive", () => {
  const framer = new PcmFramer();
  assert.equal(framer.push(new Int16Array(1000)).length, 0);
  const frames = framer.push(new Int16Array(1000));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].length, PHONE_FRAME_SAMPLES);
  assert.equal(framer.push(new Int16Array(2560)).length, 2);
});

test("uplink: the hub's parser reads the phone's hello and audio frames", () => {
  const samples = Int16Array.from({ length: PHONE_FRAME_SAMPLES }, (_, i) => i - 600);
  const frames = new ClipFrameParser().push(Buffer.concat([phoneHello("phone-1"), phoneAudioFrame(7, 560, samples)]));
  const hello = parseHello(frames[0].payload);
  assert.ok(hello.ok && hello.hello.device === "lente-phone" && hello.hello.rate === 16000);
  const audio = parseAudioFrame(frames[1].payload);
  assert.equal(audio.seq, 7);
  assert.equal(audio.timeMs, 560);
  assert.deepEqual(audio.pcm, Buffer.from(samples.buffer));
});

test("uplink: byte for byte what the clip encoder builds", () => {
  const samples = Int16Array.from({ length: 8 }, (_, i) => i * 1000 - 3000);
  assert.deepEqual(Buffer.from(phoneAudioFrame(3, 240, samples)), encodeAudioFrame(3, 240, Buffer.from(samples.buffer)));
  assert.deepEqual(Buffer.from(phoneHello("x")), encodeHello({ fw: "x", device: "lente-phone" }));
});

test("page script: the phone's copy behaves like the module", () => {
  const page = new Function(`${PHONE_AUDIO_PAGE_SCRIPT}; return { PcmResampler, PcmFramer, phoneAudioFrame };`)();
  const input = sine(48000, 200, 0.2);
  assert.deepEqual(new page.PcmResampler(48000).push(input), new PcmResampler(48000).push(input));
  const s = new Int16Array(PHONE_FRAME_SAMPLES).fill(5);
  assert.deepEqual(page.phoneAudioFrame(1, 2, s), phoneAudioFrame(1, 2, s));
});
