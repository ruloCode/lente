import assert from "node:assert/strict";
import { test } from "node:test";
import { PcmFramer, PcmResampler, PHONE_FRAME_SAMPLES } from "../src/phone-audio.ts";
import { DESKTOP_CAPTURE_PAGE_SCRIPT, SceneDetector, downmix, lumaDiff, mixMono, toLuma } from "../src/desktop-capture.ts";

const sine = (rate: number, hz: number, seconds: number, amp = 0.5): Float32Array =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test("audio: a stereo 48 kHz tab becomes 80 ms frames of a 16 kHz tone at the same amplitude", () => {
  const left = sine(48000, 440, 1);
  const mono = downmix([left, left.slice()]);
  const pcm = new PcmResampler(48000).push(mono);
  const frames = new PcmFramer().push(pcm);
  assert.equal(frames.length, 12); // 16000 samples / 1280, the rest stays pending
  assert.ok(frames.every((f) => f.length === PHONE_FRAME_SAMPLES));
  const all = Int16Array.from(frames.flatMap((f) => [...f]));
  // Known sine: peak near 0.5 of full scale, and zero crossings give 440 Hz.
  const peak = Math.max(...all.map(Math.abs)) / 32768;
  assert.ok(Math.abs(peak - 0.5) < 0.03, `peak ${peak}`);
  let crossings = 0;
  for (let i = 1; i < all.length; i++) if (all[i - 1] < 0 !== all[i] < 0) crossings++;
  const hz = (crossings / 2) / (all.length / 16000);
  assert.ok(Math.abs(hz - 440) < 10, `${hz} Hz`);
});

test("audio: downmix averages channels", () => {
  const out = downmix([Float32Array.of(1, 0), Float32Array.of(0, 1)]);
  assert.deepEqual([...out], [0.5, 0.5]);
});

test("audio: mixing tab and microphone sums, clips and keeps the longer tail", () => {
  const out = mixMono(Float32Array.of(0.25, 0.9), Float32Array.of(0.25, 0.9, 0.1));
  assert.deepEqual([...out].map((v) => +v.toFixed(2)), [0.5, 1, 0.1]);
});

const frame = (value: number, n = 64 * 36) => new Uint8Array(n).fill(value);

test("scene: first frame is sent, identical and noisy repeats are not", () => {
  const d = new SceneDetector();
  assert.equal(d.changed(frame(100)), true);
  assert.equal(d.changed(frame(100)), false);
  assert.equal(d.changed(frame(105)), false); // compression noise
});

test("scene: a new slide is sent once, then its repeats are not", () => {
  const d = new SceneDetector();
  d.changed(frame(30));
  const slide = frame(30);
  slide.fill(220, 0, 1000); // a big bright block appears
  assert.equal(d.changed(slide), true);
  assert.equal(d.changed(slide.slice()), false);
});

test("scene: a slow fade adds up against the last sent picture", () => {
  const d = new SceneDetector();
  d.changed(frame(0));
  const sent = [5, 10, 15, 20, 25].map((v) => d.changed(frame(v)));
  assert.deepEqual(sent, [false, false, true, false, false]);
});

test("scene: reset sends the next frame; size mismatch counts as a change", () => {
  const d = new SceneDetector();
  d.changed(frame(10));
  d.reset();
  assert.equal(d.changed(frame(10)), true);
  assert.equal(lumaDiff(frame(1, 4), frame(1, 5)), 255);
});

test("scene: luma from RGBA", () => {
  assert.deepEqual([...toLuma(Uint8Array.of(255, 255, 255, 255, 0, 0, 0, 255))], [255, 0]);
});

test("page script: the page's copy behaves like the module", () => {
  const make = new Function(`${DESKTOP_CAPTURE_PAGE_SCRIPT}; return { SceneDetector, mixMono };`);
  const { SceneDetector: S, mixMono: m } = make();
  const d = new S();
  assert.equal(d.changed(frame(0)), true);
  assert.equal(d.changed(frame(200)), true);
  assert.equal(m(Float32Array.of(0.5), Float32Array.of(0.25))[0], 0.75);
});

test("scene: a deck of three slides, each shown for many frames with noise, sends exactly three pictures", () => {
  const d = new SceneDetector();
  const slides = [40, 130, 220].map((base, s) => Uint8Array.from({ length: 64 * 36 }, (_, i) => (i % (s + 2) < 1 ? base + 60 : base)));
  let sent = 0;
  for (const slide of slides) {
    for (let k = 0; k < 20; k++) sent += d.changed(slide.map((v) => Math.min(255, v + (k % 3)))) ? 1 : 0;
  }
  assert.equal(sent, 3);
});

test("desktop hello: a clip-shaped v2 hello that names the desktop page and its pictures", async () => {
  const { phoneHello } = await import("../src/phone-audio.ts");
  const { encodeHello } = await import("../src/clip-protocol.ts");
  assert.deepEqual(Buffer.from(phoneHello("desktop-page-1", "lente-desktop", true)), encodeHello({ fw: "desktop-page-1", device: "lente-desktop", camera: true }));
});

test("desktop page: its script parses and carries the pause and takeover commands", async () => {
  const { DESKTOP_PAGE } = await import("../src/desktop-page.ts");
  const script = DESKTOP_PAGE.slice(DESKTOP_PAGE.indexOf("<script>") + 8, DESKTOP_PAGE.indexOf("</script>"));
  assert.doesNotThrow(() => new Function(script));
  for (const cmd of ["M", "m", "P", "T"]) assert.ok(script.includes(`cmd === "${cmd}"`), `handles hub command ${cmd}`);
});
