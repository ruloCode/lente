import assert from "node:assert/strict";
import { test } from "node:test";
import type { Meeting } from "../src/meetings.ts";
import { momentOf, momentsOf, speakerName } from "../src/memories.ts";
import type { MediaRecord } from "../src/stores.ts";

const T0 = Date.UTC(2026, 10, 3, 15, 0, 0);
const s = (sec: number) => T0 + sec * 1000;

function meeting(id: string, startSec = 0): Meeting {
  return {
    id,
    title: "PROBE-Revisión del tablero",
    startedAt: s(startSec),
    endedAt: s(startSec + 120),
    status: "done",
    notes: { summary: "Se revisó el tablero PROBE-K7.", decisions: [], commitments: [], openQuestions: [] },
    turns: [
      // Segment 1: two turns close together.
      { id: "t1", startAt: s(startSec + 1), at: s(startSec + 4), speaker: "A", wearer: true, text: "Abramos el tablero PROBE-K7." },
      { id: "t2", startAt: s(startSec + 5), at: s(startSec + 9), speaker: "B", text: "Listo, ya lo veo." },
      // Segment 2: after a pause longer than the segment rule.
      { id: "t3", startAt: s(startSec + 40), at: s(startSec + 42), speaker: "B", text: "¿Lo dejamos para mañana?" },
    ],
  };
}

const rec = (kind: "audio" | "frame", ref: string, atSec: number, ms = 0): MediaRecord => ({ kind, ref, at: s(atSec), ms, bytes: 100, codec: kind === "audio" ? "adpcm" : "jpeg" });

test("a moment plays its segments back to back, each as long as its kept audio", () => {
  const m = meeting("m1");
  const media = [rec("audio", "sm1:1", 1, 7000), rec("audio", "sm1:2", 40, 2500), rec("frame", "v1", 2), rec("frame", "v2", 8), rec("frame", "v3", 41)];
  const moment = momentOf(m, media);
  assert.equal(moment.scenes.length, 2);
  assert.deepEqual(moment.scenes[0], { startS: 0, lengthS: 7, audio: "/media/audio/sm1%3A1" });
  assert.deepEqual(moment.scenes[1], { startS: 7, lengthS: 2.5, audio: "/media/audio/sm1%3A2" });
  assert.equal(moment.durationS, 9.5);
  // The silence between the segments (30 s) is skipped.
  assert.equal(moment.lines.length, 3);
  assert.equal(moment.lines[0]!.atS, 0);
  assert.equal(moment.lines[0]!.who, "Tú");
  assert.equal(moment.lines[1]!.who, "Persona B");
  assert.ok(moment.lines[1]!.atS > 0 && moment.lines[1]!.atS < 7);
  assert.equal(moment.lines[2]!.atS, 7);
  // Photos fall inside their segment's scene, in order.
  assert.deepEqual(moment.frames.map((f) => f.path), ["/media/frame/v1", "/media/frame/v2", "/media/frame/v3"]);
  assert.ok(moment.frames[1]!.atS < 7 && moment.frames[2]!.atS >= 7);
  assert.equal(moment.summary, "Se revisó el tablero PROBE-K7.");
});

test("without kept audio a segment lasts as long as its turns took, and borrows the last earlier photo", () => {
  const moment = momentOf(meeting("m2"), [rec("frame", "v0", -20)]);
  assert.equal(moment.scenes[0]!.audio, undefined);
  assert.equal(moment.scenes[0]!.lengthS, 7);
  assert.equal(moment.scenes[1]!.lengthS, 2);
  assert.deepEqual(moment.frames, [{ atS: 0, path: "/media/frame/v0" }]);
});

test("moments come newest first, skip meetings with nothing said, and take only the media around each", () => {
  const empty: Meeting = { ...meeting("m0", -600), turns: [] };
  const list = momentsOf([meeting("m1", 0), meeting("m3", 600), empty], [rec("frame", "v1", 2), rec("frame", "v9", 602)], 10);
  assert.deepEqual(list.map((m) => m.id), ["m3", "m1"]);
  assert.deepEqual(list[0]!.frames.map((f) => f.path), ["/media/frame/v9"]);
  assert.deepEqual(list[1]!.frames.map((f) => f.path), ["/media/frame/v1"]);
});

test("speaker names", () => {
  assert.equal(speakerName({ wearer: true, speaker: "A" }), "Tú");
  assert.equal(speakerName({ speaker: "C" }), "Persona C");
  assert.equal(speakerName({}), "Alguien");
});
