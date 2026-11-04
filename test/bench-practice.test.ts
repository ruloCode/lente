import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPractice, parsePracticeLine, summarizePractice } from "../scripts/bench-practice.ts";

// Lines as `adb logcat -s LentePractice` prints them (threadtime), and the hub's own coach line.
const LOG = [
  "--------- beginning of main",
  "11-04 15:31:02.101  4120  4188 I LentePractice: [practice] onset→shown 41 ms",
  "11-04 15:31:02.700  4120  4188 I LentePractice: [practice] onset→shown 38 ms",
  "11-04 15:31:03.300  4120  4188 I LentePractice: [practice] onset->shown 55 ms",
  "11-04 15:31:05.000  4120  4120 I LentePractice: [practice] attempt lesson=escala-do right=8 total=8",
  "11-04 15:31:06.200  4120  4190 I LentePractice: [practice] coach 1180 ms",
  "11-04 15:31:10.000  4120  4188 I LentePractice: [practice] onset→shown 60 ms",
  "11-04 15:31:11.000  4120  4120 I LentePractice: [practice] attempt lesson=escala-do right=7 total=8",
  "11-04 15:31:12.500  4120  4190 I LentePractice: [practice] coach 1420 ms",
  "11-04 15:31:20.000  4120  4120 I LentePractice: [practice] attempt lesson=escala-do right=8 total=8",
  "11-04 15:31:25.000  4120  4120 I LentePractice: [practice] attempt lesson=escala-do right=7 total=8",
  "11-04 15:31:25.900  4120  4190 I LentePractice: [practice] coach 990 ms",
  "11-04 15:31:30.000  4120  4120 I LentePractice: [practice] attempt lesson=estrellita right=6 total=7",
  "11-04 15:31:40.000  4120  4188 I LentePractice: [practice] onset→shown 999 ms",
  "11-04 15:31:41.000  4120  4120 I LentePractice: some other line PROBE",
];

test("timing lines parse; anything else is dropped", () => {
  assert.deepEqual(parsePracticeLine(LOG[1]!), { kind: "onset", ms: 41 });
  assert.deepEqual(parsePracticeLine(LOG[3]!), { kind: "onset", ms: 55 });
  assert.deepEqual(parsePracticeLine(LOG[4]!), { kind: "attempt", lesson: "escala-do", right: 8, total: 8 });
  assert.deepEqual(parsePracticeLine(LOG[5]!), { kind: "coach", ms: 1180 });
  assert.deepEqual(parsePracticeLine("[practice] coach 812 ms · right=7 total=8 earlier=1"), { kind: "coach", ms: 812 });
  assert.equal(parsePracticeLine(LOG[0]!), undefined);
  assert.equal(parsePracticeLine(LOG.at(-1)!), undefined);
  assert.equal(parsePracticeLine("[practice] attempt lesson=PROBE right=9 total=8"), undefined, "more right than total is not a real line");
});

test("per lesson: accuracy over the reference attempts, notes and coach attributed to their attempt", () => {
  const s = summarizePractice(LOG.map(parsePracticeLine).filter((l) => l !== undefined), 3);
  const scale = s.lessons.find((l) => l.lesson === "escala-do")!;
  assert.equal(scale.attempts.length, 4);
  assert.deepEqual(scale.reference, { right: 23, total: 24 });
  assert.deepEqual(scale.attempts.map((a) => `${a.right}/${a.total}`), ["8/8", "7/8", "8/8", "7/8"]);
  // Nearest-rank percentiles over 41, 38, 55, 60.
  assert.deepEqual(scale.onset, { n: 4, p50: 41, p90: 60 });
  assert.deepEqual(scale.coach, { n: 3, p50: 1180, p90: 1420 });
  const star = s.lessons.find((l) => l.lesson === "estrellita")!;
  assert.deepEqual(star.reference, { right: 6, total: 7 });
  assert.equal(star.coach.n, 0);
  assert.equal(s.unassignedOnsets, 1, "notes after the last attempt belong to none");
});

test("the printed table names every lesson and its numbers", () => {
  const out = formatPractice(summarizePractice(LOG.map(parsePracticeLine).filter((l) => l !== undefined), 3));
  assert.match(out, /\| escala-do \| 4 \| 23 of 24 \(95.8 %\) \| 8\/8 7\/8 8\/8 7\/8 \| 41 ms \| 60 ms \| 1.18 s \| 1.42 s \|/);
  assert.match(out, /\| estrellita \| 1 \| 6 of 7 \(85.7 %\) \| 6\/7 \| — \| — \| — \| — \|/);
});
