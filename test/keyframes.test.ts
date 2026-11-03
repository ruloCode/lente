// add-media-archive 1.3: keyframes on change. Synthetic JPEG byte sequences (SOI, a DQT, SOS, a scan,
// EOI) and description sequences: the first frame is kept, a repeat of the same scene is not, a new
// scene is, but never sooner than 30 s after the last kept one, and nothing while «Guardar fotos» is off.

import assert from "node:assert/strict";
import { test } from "node:test";
import { KEYFRAME_FLOOR_MS, KeyframePicker, descriptionOverlap, jpegSignature, signatureDistance } from "../src/keyframes.ts";

/** A minimal JPEG: SOI, a DQT segment, SOS with its header, `scan` bytes, EOI. */
function jpeg(scan: number[]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x04, 0x01, 0x00, ...scan, 0xff, 0xd9]);
}
const dark = jpeg(Array.from({ length: 400 }, (_, i) => (i * 7) % 48));
const darkAgain = jpeg(Array.from({ length: 410 }, (_, i) => (i * 7) % 48));
const bright = jpeg(Array.from({ length: 900 }, (_, i) => 160 + ((i * 13) % 90)));

test("the signature reads the scan without decoding, and moves with the scene", () => {
  assert.equal(jpegSignature(new TextEncoder().encode("not a jpeg")), undefined);
  const a = jpegSignature(dark)!;
  assert.ok(signatureDistance(a, jpegSignature(darkAgain)!) < 0.1);
  assert.ok(signatureDistance(a, jpegSignature(bright)!) > 0.5);
  assert.equal(descriptionOverlap("Una pizarra con tres columnas", "Una pizarra con tres columnas"), 1);
  assert.ok(descriptionOverlap("Una pizarra con tres columnas", "Una mesa con dos portátiles") < 0.2);
});

test("kept: the first frame and each new scene after 30 s; not kept: a repeat, a change too soon, anything with photos off", () => {
  const p = new KeyframePicker();
  const T = 1_000_000;
  assert.equal(p.consider({ at: T, description: "Una pizarra con tres columnas: Ahora, Siguiente y Después.", jpeg: dark }, true), true, "the first frame");
  assert.equal(p.consider({ at: T + 60_000, description: "Una pizarra con tres columnas: Ahora, Siguiente y Después.", jpeg: darkAgain }, true), false, "the same scene");
  assert.equal(p.consider({ at: T + 10_000, description: "Una mesa con dos portátiles y una libreta.", jpeg: bright }, true), false, "a new scene, but too soon");
  assert.equal(p.consider({ at: T + KEYFRAME_FLOOR_MS, description: "Una mesa con dos portátiles y una libreta.", jpeg: bright }, true), true, "a new scene after 30 s");
  assert.equal(p.consider({ at: T + 120_000, description: "Una pizarra con tres columnas: Ahora, Siguiente y Después.", jpeg: dark }, false), false, "photos off keeps nothing");
  // Same words, different picture: the signature alone marks the change.
  assert.equal(p.consider({ at: T + 180_000, description: "Una mesa con dos portátiles y una libreta.", jpeg: dark }, true), true);
  assert.equal(p.consider({ at: T + 240_000, description: "x", jpeg: new Uint8Array([1, 2, 3]) }, true), false, "not a JPEG");
});
