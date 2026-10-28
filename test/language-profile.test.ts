import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LanguageStore } from "../src/language-store.ts";
import { ANSWER_WINDOW_MS, countAskedAnswered, forgetMeeting, mergeGlossary, totalAskedAnswered, viewGlossary } from "../src/language-profile.ts";
import type { MeetingTurn } from "../src/meetings.ts";

const GA = { term: "GA", meaning: "disponibilidad general", example: "We reach GA in March." };

test("a new term enters with one sighting and its example", () => {
  const entries = mergeGlossary([], [GA], "m1", 1000);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].sightings, [{ meeting: "m1", example: "We reach GA in March.", at: 1000 }]);
  assert.deepEqual(viewGlossary(entries), [{ term: "GA", meaning: "disponibilidad general", count: 1, example: "We reach GA in March." }]);
});

test("a known term is counted again and its example updated, not duplicated", () => {
  let entries = mergeGlossary([], [GA], "m1", 1000);
  entries = mergeGlossary(entries, [{ term: "ga", meaning: "otra cosa", example: "GA slipped a week." }], "m2", 2000);
  assert.equal(entries.length, 1);
  const [view] = viewGlossary(entries);
  assert.equal(view.count, 2);
  assert.equal(view.example, "GA slipped a week.");
  assert.equal(view.meaning, "disponibilidad general", "the first meaning stays");
});

test("the same term twice in one meeting counts once", () => {
  const entries = mergeGlossary([], [GA, { ...GA, example: "GA again." }], "m1", 1000);
  assert.equal(viewGlossary(entries)[0].count, 1);
  assert.equal(viewGlossary(entries)[0].example, "GA again.");
});

test("merging does not change the entries it was given", () => {
  const before = mergeGlossary([], [GA], "m1", 1000);
  const copy = JSON.stringify(before);
  mergeGlossary(before, [GA], "m2", 2000);
  assert.equal(JSON.stringify(before), copy);
});

test("most seen terms come first", () => {
  let entries = mergeGlossary([], [GA, { term: "ship it", meaning: "lanzarlo", example: "Let's ship it." }], "m1", 1000);
  entries = mergeGlossary(entries, [{ term: "ship it", meaning: "", example: "Ship it Friday." }], "m2", 2000);
  assert.deepEqual(viewGlossary(entries).map((v) => v.term), ["ship it", "GA"]);
});

test("forgetting a meeting removes its sightings and the terms only it had", () => {
  let entries = mergeGlossary([], [GA, { term: "EOD", meaning: "fin del día", example: "By EOD." }], "m1", 1000);
  entries = mergeGlossary(entries, [GA], "m2", 2000);
  const after = forgetMeeting(entries, "m1");
  assert.deepEqual(viewGlossary(after).map((v) => [v.term, v.count]), [["GA", 1]]);
  assert.deepEqual(forgetMeeting(after, "m2"), []);
});

const turn = (at: number, patch: Partial<MeetingTurn>): MeetingTurn => ({ id: "t", at, text: "x", ...patch });

test("asked and answered: an answer within 20 s counts", () => {
  const stats = countAskedAnswered([
    turn(10_000, { addressed: true, speaker: "B" }),
    turn(18_000, { wearer: true, startAt: 12_000 }),
  ]);
  assert.deepEqual(stats, { asked: 1, answered: 1 });
});

test("asked and answered: no turn from the wearer in 20 s is asked but not answered", () => {
  const stats = countAskedAnswered([
    turn(10_000, { addressed: true }),
    turn(60_000, { wearer: true, startAt: 10_000 + ANSWER_WINDOW_MS + 1 }),
  ]);
  assert.deepEqual(stats, { asked: 1, answered: 0 });
});

test("asked and answered: questions not aimed at the wearer, and the wearer's own turns, are not counted", () => {
  const stats = countAskedAnswered([
    turn(1000, { speaker: "B" }),
    turn(2000, { wearer: true, addressed: true, startAt: 1500 }),
    turn(3000, { addressed: true }),
  ]);
  assert.deepEqual(stats, { asked: 1, answered: 0 });
});

test("asked and answered: a wearer turn from before the question started does not count", () => {
  const stats = countAskedAnswered([turn(10_000, { addressed: true, startAt: 8000 }), turn(10_400, { wearer: true, startAt: 5000 })]);
  assert.deepEqual(stats, { asked: 1, answered: 0 });
});

test("asked and answered: an answer that starts a hair before the question's recorded end still counts", () => {
  const stats = countAskedAnswered([turn(24_801, { addressed: true, startAt: 20_067 }), turn(28_665, { wearer: true, startAt: 24_227 })]);
  assert.deepEqual(stats, { asked: 1, answered: 1 });
});

test("totals add up and ignore meetings without stats", () => {
  assert.deepEqual(totalAskedAnswered([{ asked: 2, answered: 1 }, undefined, { asked: 1, answered: 1 }]), { asked: 3, answered: 2 });
});

test("language store keeps the glossary across restarts", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-lang-")), "language.json");
  assert.deepEqual(new LanguageStore(file).glossary, []);
  new LanguageStore(file).set(mergeGlossary([], [GA], "m1", 1000));
  assert.equal(new LanguageStore(file).glossary[0].term, "GA");
});
