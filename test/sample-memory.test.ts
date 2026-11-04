import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_PROJECT_NAME, SAMPLE_TITLE_PREFIX, isSampleMeeting, sampleMemory } from "../src/sample-memory.ts";

const NOW = Date.parse("2026-11-06T10:00:00-05:00");

test("the sample: two done meetings, one in Spanish and one in English, with notes, three open tasks and two facts", () => {
  const s = sampleMemory(NOW);
  assert.equal(s.meetings.length, 2);
  const [beta, launch] = s.meetings;
  assert.equal(beta!.title, `${SAMPLE_TITLE_PREFIX}Planificación de la beta`);
  assert.equal(launch!.title, `${SAMPLE_TITLE_PREFIX}Launch marketing sync`);
  assert.equal(new Date(beta!.startedAt).toISOString(), "2026-11-04T14:00:00.000Z", "two days ago at 9:00 in Bogotá");
  assert.equal(new Date(launch!.startedAt).toISOString(), "2026-11-05T20:00:00.000Z", "yesterday at 15:00 in Bogotá");
  assert.notEqual(beta!.id, launch!.id);
  for (const m of s.meetings) {
    assert.equal(m.status, "done");
    assert.match(m.id, /^m\d{14}$/);
    assert.ok(m.endedAt! > m.startedAt && m.endedAt! <= NOW);
    const turnIds = new Set(m.turns.map((t) => t.id));
    for (const e of [...m.notes!.decisions, ...m.notes!.commitments, ...m.notes!.openQuestions].flatMap((x) => x.evidence)) assert.ok(turnIds.has(e), `${m.id} cites ${e}`);
  }
  // «¿Qué se decidió sobre la beta?» has its line and its decision.
  assert.match(beta!.turns.find((t) => t.id === beta!.notes!.decisions[0]!.evidence[0])!.text, /beta el 20 de noviembre con 50 usuarios/);
  assert.equal(s.tasks.length, 3);
  assert.equal(s.facts.length, 2);
  for (const t of [...s.tasks, ...s.facts]) assert.ok(s.meetings[t.meeting]!.turns.some((x) => x.id === t.evidence[0]));
});

test("only invented PROBE- people speak, besides the wearer", () => {
  const speakers = new Set(sampleMemory(NOW).meetings.flatMap((m) => m.turns.map((t) => t.speaker)));
  for (const s of speakers) assert.ok(s === "Tú" || s!.startsWith("PROBE-"), s);
});

test("a sample meeting needs both marks: the title and a sample project", () => {
  const ids = new Set(["p1"]);
  assert.equal(isSampleMeeting({ title: `${SAMPLE_TITLE_PREFIX}Algo` }, "p1", ids), true);
  assert.equal(isSampleMeeting({ title: `${SAMPLE_TITLE_PREFIX}Algo` }, "p2", ids), false, "the person's own meeting in their own project");
  assert.equal(isSampleMeeting({ title: "Mi reunión" }, "p1", ids), false, "the person's meeting moved into the sample project");
  assert.equal(isSampleMeeting({ title: `${SAMPLE_TITLE_PREFIX}Algo` }, undefined, ids), false);
  assert.equal(SAMPLE_PROJECT_NAME, "PROBE · Proyecto de ejemplo");
});
