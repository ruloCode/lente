import assert from "node:assert/strict";
import { test } from "node:test";
import { dayKey } from "../src/day-log.ts";
import { RecordedToday } from "../src/recorded-time.ts";

const MORNING = new Date(2026, 9, 28, 9, 0).getTime();
const NEXT_DAY = new Date(2026, 9, 29, 0, 5).getTime();

test("recorded: adds the audio received", () => {
  const rec = new RecordedToday(undefined, MORNING);
  for (let i = 0; i < 25; i++) rec.add(40, MORNING + i * 40);
  assert.equal(rec.total(MORNING + 1000), 1000);
});

test("recorded: nothing received adds nothing", () => {
  const rec = new RecordedToday(undefined, MORNING);
  rec.add(0, MORNING);
  rec.add(-40, MORNING);
  assert.equal(rec.total(MORNING + 60_000), 0);
});

test("recorded: today's saved total is kept across a restart, another day's is not", () => {
  assert.equal(new RecordedToday({ day: dayKey(MORNING), ms: 90_000 }, MORNING).total(MORNING), 90_000);
  assert.equal(new RecordedToday({ day: "2026-10-27", ms: 90_000 }, MORNING).total(MORNING), 0);
  assert.equal(new RecordedToday({ day: dayKey(MORNING), ms: Number.NaN }, MORNING).total(MORNING), 0);
});

test("recorded: a new local day starts from zero", () => {
  const rec = new RecordedToday({ day: dayKey(MORNING), ms: 5000 }, MORNING);
  assert.equal(rec.total(NEXT_DAY), 0);
  rec.add(80, NEXT_DAY);
  assert.deepEqual(rec.snapshot(NEXT_DAY), { day: dayKey(NEXT_DAY), ms: 80 });
});
