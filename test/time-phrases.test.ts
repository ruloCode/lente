// add-memory-engine 3.1 and add-memory-timeline 3.1: time words in Spanish and English become ranges in
// the wearer's time zone, and «la reunión con …» is picked out. "Now" is Thursday 2026-11-05, 15:00 in Bogotá.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTimePhrase } from "../src/time-phrases.ts";

const TZ = "America/Bogota";
const NOW = Date.UTC(2026, 10, 5, 20); // Thu 15:00 in Bogotá
const at = (day: string, hour = 0) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00-05:00`);
const range = (q: string) => {
  const r = parseTimePhrase(q, NOW, TZ).range;
  return r && [new Date(r.from - 5 * 3_600_000).toISOString().slice(0, 13), new Date(r.to - 5 * 3_600_000).toISOString().slice(0, 13)];
};

test("today, yesterday and the day before, in Spanish and English", () => {
  assert.deepEqual(range("¿Qué hablé hoy con Ana?"), ["2026-11-05T00", "2026-11-06T00"]);
  assert.deepEqual(range("what did Ana say today"), ["2026-11-05T00", "2026-11-06T00"]);
  assert.deepEqual(range("¿Qué se dijo AYER sobre el presupuesto?"), ["2026-11-04T00", "2026-11-05T00"]);
  assert.deepEqual(range("yesterday's numbers"), ["2026-11-04T00", "2026-11-05T00"]);
  assert.deepEqual(range("¿y anteayer?"), ["2026-11-03T00", "2026-11-04T00"]);
});

test("parts of the day", () => {
  assert.deepEqual(range("¿Qué vi esta mañana?"), ["2026-11-05T05", "2026-11-05T12"]);
  assert.deepEqual(range("what did we decide this afternoon"), ["2026-11-05T12", "2026-11-05T19"]);
  assert.deepEqual(range("¿Qué dijeron ayer en la tarde?"), ["2026-11-04T12", "2026-11-04T19"]);
  assert.deepEqual(range("yesterday morning"), ["2026-11-04T05", "2026-11-04T12"]);
});

test("weekdays: the most recent one, today included; «pasado» and 'last' go back a week from yesterday", () => {
  assert.deepEqual(range("¿Qué dijo Ana el martes sobre el presupuesto?"), ["2026-11-03T00", "2026-11-04T00"]);
  assert.deepEqual(range("on Monday"), ["2026-11-02T00", "2026-11-03T00"]);
  assert.deepEqual(range("¿Qué pasó el jueves?"), ["2026-11-05T00", "2026-11-06T00"]);
  assert.deepEqual(range("el jueves pasado"), ["2026-10-29T00", "2026-10-30T00"]);
  assert.deepEqual(range("last Thursday"), ["2026-10-29T00", "2026-10-30T00"]);
  assert.deepEqual(range("el miércoles"), ["2026-11-04T00", "2026-11-05T00"]);
  assert.deepEqual(range("el sábado"), ["2026-10-31T00", "2026-11-01T00"]);
});

test("weeks, «hace N …» and months", () => {
  assert.deepEqual(range("¿Qué prometí entregar esta semana?"), ["2026-11-02T00", "2026-11-06T00"]);
  assert.deepEqual(range("la semana pasada"), ["2026-10-26T00", "2026-11-02T00"]);
  assert.deepEqual(range("last week"), ["2026-10-26T00", "2026-11-02T00"]);
  assert.deepEqual(range("hace dos semanas"), ["2026-10-19T00", "2026-10-26T00"]);
  assert.deepEqual(range("two weeks ago"), ["2026-10-19T00", "2026-10-26T00"]);
  assert.deepEqual(range("hace 3 días"), ["2026-11-02T00", "2026-11-03T00"]);
  assert.deepEqual(range("en octubre"), ["2026-10-01T00", "2026-11-01T00"]);
  assert.deepEqual(range("in December"), ["2025-12-01T00", "2026-01-01T00"]);
  assert.deepEqual(range("el mes pasado"), ["2026-10-01T00", "2026-11-01T00"]);
  assert.deepEqual(range("this month"), ["2026-11-01T00", "2026-12-01T00"]);
  assert.deepEqual(range("hace un mes"), ["2026-10-01T00", "2026-11-01T00"]);
});

test("no time phrase: no range, and the rest is the folded question", () => {
  const p = parseTimePhrase("¿Qué dijo Ana sobre el presupuesto de marketing?", NOW, TZ);
  assert.equal(p.range, undefined);
  assert.equal(p.rest, "¿que dijo ana sobre el presupuesto de marketing?");
  assert.equal(parseTimePhrase("¿Qué dijo Ana ayer?", NOW, TZ).rest, "¿que dijo ana ?");
});

test("the earliest phrase wins, and «la reunión con …» is picked out for the timeline", () => {
  const p = parseTimePhrase("Ábreme la reunión con Ana del martes", NOW, TZ);
  assert.equal(p.meetingAbout, "ana");
  assert.equal(p.range!.from, at("2026-11-03"));
  assert.equal(parseTimePhrase("play the meeting about pricing from yesterday", NOW, TZ).meetingAbout, "pricing");
  assert.equal(parseTimePhrase("la reunión de PROBE-Atlas", NOW, TZ).meetingAbout, "probe-atlas");
  assert.equal(parseTimePhrase("ayer, no el martes", NOW, TZ).range!.from, at("2026-11-04"));
});
