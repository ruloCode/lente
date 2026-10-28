import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type Dialogue, labelCounts, pauseOf, timeline, validateSet } from "../scripts/eval/set.ts";

const load = (): unknown => JSON.parse(readFileSync(new URL("../eval/dialogues.json", import.meta.url), "utf8"));
const base = (): any => ({
  id: "d",
  title: "T",
  names: ["Rulo"],
  speakers: { W: { voice: "Samantha", gain: 1, wearer: true }, P: { voice: "Daniel", gain: 0.2 } },
  lines: [{ speaker: "P", text: "One." }, { speaker: "W", text: "Two." }, { speaker: "P", text: "Three?", question: true }],
});
const broken = (mutate: (d: any) => void): unknown => {
  const d = base();
  mutate(d);
  return [d];
};

test("the committed set is valid, has ten dialogues and every kind of label", () => {
  const set = validateSet(load());
  assert.equal(set.length, 10);
  const counts = labelCounts(set);
  assert.ok(counts.questions >= 20 && counts.addressed >= 10 && counts.addressed < counts.questions, JSON.stringify(counts));
  assert.ok(set.some((d) => d.lines.some((l) => l.lang === "es")), "some Spanish lines");
  assert.ok(set.some((d) => d.lines.some((l) => l.question && !l.addressedToWearer)), "questions not aimed at the wearer");
});

test("every wearer is the loudest voice of their dialogue", () => {
  for (const d of validateSet(load())) {
    const wearer = Object.values(d.speakers).find((s) => s.wearer)!;
    for (const s of Object.values(d.speakers).filter((s) => !s.wearer)) assert.ok(wearer.gain >= 3 * s.gain, `${d.id}: wearer must be well above the others`);
  }
});

test("a valid minimal dialogue passes", () => {
  assert.equal(validateSet([base()]).length, 1);
});

test("label mistakes are refused with the dialogue and line named", () => {
  const cases: [string, (d: any) => void, RegExp][] = [
    ["unknown speaker", (d) => (d.lines[1].speaker = "Z"), /d line 2: unknown speaker "Z"/],
    ["addressed but not a question", (d) => (d.lines[0].addressedToWearer = true), /d line 1: addressedToWearer only applies to questions/],
    ["the wearer addressing themself", (d) => Object.assign(d.lines[1], { question: true, addressedToWearer: true }), /d line 2: the wearer does not address themself/],
    ["no wearer", (d) => delete d.speakers.W.wearer, /exactly one wearer speaker/],
    ["two wearers", (d) => (d.speakers.P.wearer = true), /exactly one wearer speaker, found 2/],
    ["too short", (d) => d.lines.pop(), /at least 3 lines/],
    ["Spanish line without a Spanish voice", (d) => (d.lines[0].lang = "es"), /no voiceEs/],
    ["gain above 1", (d) => (d.speakers.P.gain = 1.5), /gain must be in/],
    ["silly pause", (d) => (d.lines[0].pauseMs = 10), /pauseMs must be/],
    ["empty text", (d) => (d.lines[0].text = " "), /empty text/],
    ["bad id", (d) => (d.id = "Bad Id"), /id must be/],
  ];
  for (const [name, mutate, message] of cases) assert.throws(() => validateSet(broken(mutate)), message, name);
});

test("duplicate ids and non-arrays are refused", () => {
  assert.throws(() => validateSet([base(), base()]), /duplicate id/);
  assert.throws(() => validateSet({}), /non-empty array/);
});

test("the timeline places each line after the previous one plus its pause", () => {
  const t = timeline([1000, 2000, 500], [900, 300, 900], 400);
  assert.deepEqual(t.lines, [{ startMs: 400, endMs: 1400 }, { startMs: 2300, endMs: 4300 }, { startMs: 4600, endMs: 5100 }]);
  assert.equal(t.totalMs, 6000);
});

test("pauses default to 900 ms", () => {
  const d: Dialogue = validateSet([base()])[0];
  assert.equal(pauseOf(d.lines[0]), 900);
  assert.equal(pauseOf({ ...d.lines[0], pauseMs: 1500 }), 1500);
});
