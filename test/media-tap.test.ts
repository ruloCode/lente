// add-media-archive 2.2: the gate and the collector. The owner keeps media by default; an account
// without terms that describe media keeps nothing; LENTE_MEDIA=off stops everyone; a switch off keeps
// nothing. Audio is cut per turn from the gated frames and stored per closed segment; dropping it
// mid-segment (a switch turned off) keeps nothing from before that moment.

import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkInfo, decodeAdpcm } from "../src/media-chunks.ts";
import { SegmentAudio, mediaAllowed } from "../src/media-tap.ts";
import type { Meeting } from "../src/meetings.ts";

const on = { audio: true, photos: true };

test("the gate: the owner by default, nobody else without media terms, nobody with the switch off or LENTE_MEDIA=off", () => {
  assert.equal(mediaAllowed("audio", { switches: on, isOwner: true, acceptedMediaTerms: false }), true);
  assert.equal(mediaAllowed("audio", { switches: on, isOwner: false, acceptedMediaTerms: false }), false, "another account, no media terms");
  assert.equal(mediaAllowed("photos", { switches: on, isOwner: false, acceptedMediaTerms: true }), true, "after add-consent");
  assert.equal(mediaAllowed("photos", { switches: { audio: true, photos: false }, isOwner: true, acceptedMediaTerms: false }), false);
  assert.equal(mediaAllowed("audio", { env: "off", switches: on, isOwner: true, acceptedMediaTerms: true }), false);
});

/** 80 ms frames of a constant level, from `fromMs` to `toMs` of session audio. */
function frames(audio: SegmentAudio, fromMs: number, toMs: number, level: number) {
  for (let ms = fromMs; ms < toMs; ms += 80) {
    const pcm = new Uint8Array(2560);
    new DataView(pcm.buffer).setInt16(0, level, true);
    audio.push(pcm, ms);
  }
}

const meeting = (turns: [number, number][]): Pick<Meeting, "id" | "turns"> => ({ id: "m20261103150000", turns: turns.map(([start, end], i) => ({ id: `t${i + 1}`, at: 1_000_000 + end, startAt: 1_000_000 + start, text: `PROBE ${i}` })) });

test("audio is cut per turn and stored per closed segment, the open one waits until the meeting ends", () => {
  const audio = new SegmentAudio();
  // Two turns close together (one segment), then a 20 s pause, then a third turn.
  const m = meeting([[0, 3000], [3500, 6000], [26_000, 29_000]]);
  frames(audio, 0, 6000, 1000);
  audio.turn(m, "t1", 0, 3000);
  audio.turn(m, "t2", 3500, 6000);
  assert.deepEqual(audio.closed({ ...m, turns: m.turns.slice(0, 2) }, false), [], "the only segment is still open");
  frames(audio, 26_000, 29_000, 2000);
  audio.turn(m, "t3", 26_000, 29_000);
  const first = audio.closed(m, false);
  assert.deepEqual(first.map((c) => c.segment), ["sm20261103150000:1"]);
  assert.ok(Math.abs(chunkInfo(first[0]!.bytes).ms - 6_000) <= 300, `${chunkInfo(first[0]!.bytes).ms} ms of audio for two turns`);
  const last = audio.closed(m, true);
  assert.deepEqual(last.map((c) => c.segment), ["sm20261103150000:2"]);
  assert.ok(decodeAdpcm(last[0]!.bytes).length > 0);
  assert.deepEqual(audio.closed(m, true), [], "nothing twice");
});

test("a switch turned off mid-segment keeps nothing from before that moment", () => {
  const audio = new SegmentAudio();
  const m = meeting([[0, 3000], [3500, 6000], [30_000, 33_000]]);
  frames(audio, 0, 3000, 1000);
  audio.turn(m, "t1", 0, 3000);
  audio.drop(); // «Guardar audio» off
  // Back on: only what is said from now on.
  frames(audio, 30_000, 33_000, 1000);
  audio.turn(m, "t3", 30_000, 33_000);
  const chunks = audio.closed(m, true);
  assert.deepEqual(chunks.map((c) => c.segment), ["sm20261103150000:2"], "the first segment's audio was dropped");
});
