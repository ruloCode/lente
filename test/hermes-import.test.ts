// add-hermes-import 1.1: mapping hermes rows to Lente records. Synthetic rows only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { factsFromHermes, hermesMeetingId, meetingFromHermes, splitSpeaker } from "../src/hermes-import.ts";

const row = (over: Partial<Parameters<typeof meetingFromHermes>[0]> = {}) => ({
  id: 7,
  meeting_id: "2026-07-07-1830-Kickoff Sintético",
  title: "Kickoff sintético",
  meeting_date: "2026-07-07T18:30:00Z",
  duration_sec: 600,
  transcript: "Ana: ¿movemos el lanzamiento al viernes?\nRulo (yo): Sí, el viernes.\n\nNota suelta sin hablante",
  summary: "Se movió el lanzamiento al viernes.",
  ...over,
});

test("a hermes meeting becomes a finished Lente meeting with speakers, spread turns and notes", () => {
  const m = meetingFromHermes(row())!;
  assert.equal(m.id, "hermes-2026-07-07-1830-kickoff-sint-tico");
  assert.equal(m.status, "done");
  assert.equal(m.startedAt, Date.parse("2026-07-07T18:30:00Z"));
  assert.equal(m.endedAt, m.startedAt + 600_000);
  assert.deepEqual(m.turns.map((t) => [t.id, t.speaker, t.text]), [
    ["t1", "Ana", "¿movemos el lanzamiento al viernes?"],
    ["t2", "Rulo (yo)", "Sí, el viernes."],
    ["t3", undefined, "Nota suelta sin hablante"],
  ]);
  assert.deepEqual(m.turns.map((t) => t.at - m.startedAt), [200_000, 400_000, 600_000]);
  assert.equal(m.notes?.summary, "Se movió el lanzamiento al viernes.");
  assert.deepEqual(m.notes?.decisions, []);
});

test("ids are stable across runs, and a meeting with nothing to ask about is skipped", () => {
  assert.equal(meetingFromHermes(row())!.id, meetingFromHermes(row())!.id);
  assert.equal(hermesMeetingId("  ///  "), "hermes-sin-id");
  assert.equal(meetingFromHermes(row({ transcript: "  \n ", summary: null })), undefined);
  const onlySummary = meetingFromHermes(row({ transcript: null, duration_sec: null }))!;
  assert.deepEqual(onlySummary.turns, []);
  assert.equal(onlySummary.endedAt! - onlySummary.startedAt, 30 * 60 * 1000);
  assert.equal(meetingFromHermes(row({ title: "  " }))!.title, "Reunión de hermes");
  assert.throws(() => meetingFromHermes(row({ meeting_date: "no es fecha" })), /no valid date/);
});

test("a colon inside a sentence or a URL does not make a speaker", () => {
  assert.deepEqual(splitSpeaker("La hora es 10: luego vemos"), { speaker: "La hora es 10", text: "luego vemos" });
  assert.deepEqual(splitSpeaker("Ojo, esto: no es un nombre"), { text: "Ojo, esto: no es un nombre" });
  assert.deepEqual(splitSpeaker("https://example.com/x"), { text: "https://example.com/x" });
  assert.deepEqual(splitSpeaker(`${"x".repeat(41)}: texto`), { text: `${"x".repeat(41)}: texto` });
  assert.deepEqual(splitSpeaker("Ana:"), { text: "Ana:" });
});

test("memories become kept facts from hermes, summary first, cut, and never duplicated", () => {
  let n = 0;
  const id = () => `f${++n}`;
  const rows = [
    { id: "a", content: "contenido largo", summary: "Prefiere reuniones cortas", created_at: "2026-06-01T10:00:00Z" },
    { id: "b", content: "x".repeat(600), summary: null, created_at: "2026-06-02T10:00:00Z" },
    { id: "c", content: "prefiere reuniones CORTAS", summary: null, created_at: "2026-06-03T10:00:00Z" },
  ];
  const facts = factsFromHermes(rows, [], id);
  assert.deepEqual(facts.map((f) => [f.id, f.status, f.meetingId]), [["f1", "kept", "hermes"], ["f2", "kept", "hermes"]]);
  assert.equal(facts[0]!.text, "Prefiere reuniones cortas");
  assert.equal(facts[1]!.text.length, 500);
  assert.equal(facts[0]!.createdAt, Date.parse("2026-06-01T10:00:00Z"));
  assert.deepEqual(factsFromHermes(rows, facts, id), [], "a second run adds nothing");
});
