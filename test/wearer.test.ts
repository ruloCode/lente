import assert from "node:assert/strict";
import { test } from "node:test";
import { LoudnessRing, WearerTracker, isEnrollment, median } from "../src/wearer.ts";

/** A ring where each 80 ms frame holds the given loudness. */
function ringOf(levels: number[]): LoudnessRing {
  const ring = new LoudnessRing(80);
  for (const level of levels) ring.push(level);
  return ring;
}

test("median handles odd, even and empty input", () => {
  assert.equal(median([]), undefined);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test("ring: median over a turn's span, with partial frames included", () => {
  // 1 s of quiet room, 1 s of speech at 300, 1 s of quiet again (12 or 13 frames each).
  const ring = ringOf([...Array(13).fill(16), ...Array(12).fill(300), ...Array(13).fill(16)]);
  assert.equal(ring.medianBetween(1040, 2000), 300);
  assert.equal(ring.medianBetween(0, 1000), 16);
  assert.equal(ring.medianBetween(5000, 6000), undefined);
});

test("ring: a span longer than the history still returns the frames it holds", () => {
  const ring = ringOf([10, 20, 30]);
  assert.equal(ring.medianBetween(0, 100_000), 20);
});

test("ring: a few loud frames inside a pause do not move the median", () => {
  const ring = ringOf([16, 16, 16, 16, 400, 16, 16]);
  assert.equal(ring.medianBetween(0, 560), 16);
});

function hear(tracker: WearerTracker, turns: [string, number][]): void {
  turns.forEach(([speaker, loudness], i) => {
    tracker.noteLoudness(String(i), loudness);
    tracker.noteSpeaker(String(i), speaker);
  });
}

test("tracker: the consistently louder of two speakers is the wearer", () => {
  const tracker = new WearerTracker();
  hear(tracker, [["A", 310], ["B", 60], ["A", 280], ["B", 70]]);
  assert.equal(tracker.wearer(), "A");
});

test("tracker: needs two speakers and three turns", () => {
  const tracker = new WearerTracker();
  hear(tracker, [["A", 300], ["A", 310], ["A", 290]]);
  assert.equal(tracker.wearer(), undefined, "one speaker");
  const two = new WearerTracker();
  hear(two, [["A", 300], ["B", 50]]);
  assert.equal(two.wearer(), undefined, "two turns");
});

test("tracker: inside the 2x margin the result is unknown, not a guess", () => {
  const tracker = new WearerTracker();
  hear(tracker, [["A", 150], ["B", 100], ["A", 160], ["B", 90]]);
  assert.equal(tracker.wearer(), undefined);
  hear(tracker, [["A", 300]]);
  // Typical A stays ~155 vs B 95: still under 2x.
  assert.equal(tracker.wearer(), undefined);
});

test("tracker: a speaker label arriving after the loudness counts the same", () => {
  const tracker = new WearerTracker();
  for (const [id, speaker, loudness] of [["0", "B", 60], ["1", "A", 300], ["2", "B", 55], ["3", "A", 320]] as const) {
    if (id === "1" || id === "3") {
      tracker.noteSpeaker(id, speaker);
      tracker.noteLoudness(id, loudness);
    } else {
      tracker.noteLoudness(id, loudness);
      tracker.noteSpeaker(id, speaker);
    }
  }
  assert.equal(tracker.wearer(), "A");
});

test("tracker: a turn reported twice is counted once", () => {
  const tracker = new WearerTracker();
  tracker.noteLoudness("0", 300);
  tracker.noteSpeaker("0", "A");
  tracker.noteSpeaker("0", "A");
  tracker.noteLoudness("1", 50);
  tracker.noteSpeaker("1", "B");
  assert.equal(tracker.wearer(), undefined, "two turns are not enough");
});

test("tracker: enrollment sets the wearer at once and beats loudness", () => {
  const tracker = new WearerTracker();
  hear(tracker, [["A", 310], ["B", 60], ["A", 280], ["B", 70]]);
  tracker.noteEnrollment("9");
  tracker.noteSpeaker("9", "B");
  assert.equal(tracker.wearer(), "B");
});

test("tracker: enrollment works when the label arrives first", () => {
  const tracker = new WearerTracker();
  tracker.noteSpeaker("0", "C");
  tracker.noteEnrollment("0");
  assert.equal(tracker.wearer(), "C");
});

test("tracker: reset forgets the wearer", () => {
  const tracker = new WearerTracker();
  hear(tracker, [["A", 310], ["B", 60], ["A", 280], ["B", 70]]);
  tracker.reset();
  assert.equal(tracker.wearer(), undefined);
  hear(tracker, [["B", 300], ["A", 50], ["B", 310], ["A", 40]]);
  assert.equal(tracker.wearer(), "B", "identified again by the same rules");
});

test("enrollment phrase in Spanish and English, ignoring case and accents", () => {
  assert.equal(isEnrollment("Lente, soy Rulo", ["Rulo"]), true);
  assert.equal(isEnrollment("lente, I'm Rulo.", ["rulo"]), true);
  assert.equal(isEnrollment("Lente, I am Andrés", ["Andres"]), true);
  assert.equal(isEnrollment("Lente me llamo Andres", ["Andrés"]), true);
});

test("enrollment phrase: other names, no phrase, no names configured", () => {
  assert.equal(isEnrollment("Lente, soy Mónica", ["Rulo"]), false);
  assert.equal(isEnrollment("Hola, soy Rulo", ["Rulo"]), false);
  assert.equal(isEnrollment("Lente, soy Rulo", []), false);
  assert.equal(isEnrollment("Rulo, ¿puedes enviarlo?", ["Rulo"]), false);
});
