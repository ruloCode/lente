import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MeetingStore } from "../src/meeting-store.ts";
import { EPISODE_MAX_MS, EPISODE_SILENCE_MS, MEETING_SILENCE_MS, addTurn, applyTitleAndTopic, episodeEnd, extractionMessages, isTooShort, newMeeting, notesAsText, notesSchema, searchMeetings, silenceExpired, validateNotes } from "../src/meetings.ts";

const AT = Date.UTC(2026, 9, 28, 15, 7, 12);

function meetingWith(texts: string[]) {
  const m = newMeeting("  Sprint   review ", AT);
  texts.forEach((text, i) => addTurn(m, { at: AT + i * 1000, speaker: i % 2 ? "B" : "A", wearer: i % 2 === 0, text }));
  return m;
}

test("a new meeting has a readable id, a tidy title and no turns", () => {
  const m = newMeeting("  Sprint   review ", AT);
  assert.equal(m.id, "m20261028150712");
  assert.equal(m.title, "Sprint review");
  assert.equal(m.status, "running");
  assert.deepEqual(m.turns, []);
});

test("turns get sequential ids", () => {
  const m = meetingWith(["one", "two"]);
  assert.deepEqual(m.turns.map((t) => t.id), ["t1", "t2"]);
});

test("fewer than three turns is too short", () => {
  assert.equal(isTooShort(meetingWith(["a", "b"])), true);
  assert.equal(isTooShort(meetingWith(["a", "b", "c"])), false);
});

test("ten minutes without speech ends a meeting; a shorter timeout can be given", () => {
  assert.equal(silenceExpired(0, MEETING_SILENCE_MS - 1), false);
  assert.equal(silenceExpired(0, MEETING_SILENCE_MS), true);
  assert.equal(silenceExpired(1000, 5000, 3000), true);
});

test("the transcript marks the wearer as YOU", () => {
  const messages = extractionMessages(meetingWith(["Hello", "Andres will send the estimate"]));
  assert.match(messages[1].content, /t1 YOU: Hello/);
  assert.match(messages[1].content, /t2 B: Andres will send/);
  assert.match(messages[1].content, /"Sprint review"/);
});

test("notes are asked for in Spanish whatever the meeting language, names and terms as said", () => {
  const [system] = extractionMessages(meetingWith(["Hello"]));
  assert.match(system.content, /summary, decisions, commitments and open questions in Spanish/);
  assert.match(system.content, /whatever language the meeting was held in/);
  assert.match(system.content, /names, product terms and quoted words exactly as they were said/);
  assert.doesNotMatch(system.content, /Answer in the language the meeting was held in/);
});

test("the schema only allows evidence ids that exist", () => {
  const schema = notesSchema(["t1", "t2"]);
  assert.deepEqual(schema.properties.decisions.items.properties.evidence.items.enum, ["t1", "t2"]);
  assert.equal(schema.additionalProperties, false);
});

test("validateNotes keeps grounded items and counts the dropped ones", () => {
  const raw = {
    summary: "  Shipping Friday. ",
    decisions: [{ text: "Ship Friday", evidence: ["t2"] }, { text: "Invented", evidence: ["t9"] }, { text: "No evidence", evidence: [] }],
    commitments: [
      { what: "Send the estimate", owner: "you", due: "Thursday", evidence: ["t1", "t1"] },
      { what: "Fix the bug", owner: "", due: "", evidence: ["t2"] },
      { what: "", owner: "you", due: "", evidence: ["t1"] },
    ],
    openQuestions: [{ text: "Who owns the API?", evidence: ["t3"] }],
    glossary: [{ term: "GA", meaning: "disponibilidad general", evidence: ["t2"] }, { term: "ghost", meaning: "x", evidence: ["t7"] }, { term: "", meaning: "x", evidence: ["t1"] }],
  };
  const { notes, dropped } = validateNotes(raw, ["t1", "t2", "t3"]);
  assert.equal(notes.summary, "Shipping Friday.");
  assert.deepEqual(notes.decisions, [{ text: "Ship Friday", evidence: ["t2"] }]);
  assert.deepEqual(notes.commitments, [
    { what: "Send the estimate", owner: "you", due: "Thursday", evidence: ["t1"] },
    { what: "Fix the bug", owner: "?", evidence: ["t2"] },
  ]);
  assert.equal(notes.openQuestions.length, 1);
  assert.deepEqual(notes.glossary, [{ term: "GA", meaning: "disponibilidad general", evidence: ["t2"] }]);
  assert.equal(dropped, 5, "t9, no evidence, the empty commitment, an unknown turn and an empty term");
});

test("validateNotes accepts an id followed by a quote, and survives junk", () => {
  const quoted = validateNotes({ summary: "x", decisions: [{ text: "d", evidence: ["t1 'Andres will send it'"] }] }, ["t1"]);
  assert.deepEqual(quoted.notes.decisions[0].evidence, ["t1"]);
  for (const junk of [null, "text", 5, { decisions: "nope", commitments: [null, 3] }]) {
    const { notes } = validateNotes(junk, ["t1"]);
    assert.deepEqual([notes.decisions, notes.commitments, notes.openQuestions], [[], [], []]);
  }
});

test("store: save, list oldest first, delete one, delete all", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "lente-meetings-")), "meetings");
  const store = new MeetingStore(dir);
  assert.deepEqual(store.list(), []);
  const first = newMeeting("first", AT);
  const second = newMeeting("second", AT + 60_000);
  store.save(second);
  store.save(first);
  assert.deepEqual(store.list().map((m) => m.title), ["first", "second"]);
  assert.equal(store.delete(first.id), true);
  assert.equal(existsSync(join(dir, `${first.id}.json`)), false, "gone from disk");
  assert.equal(store.delete(first.id), false);
  store.save(first);
  writeFileSync(join(dir, "broken.json"), "{not json");
  assert.equal(store.deleteAll(), 3, "includes the unreadable file");
  assert.deepEqual(store.list(), []);
});

test("store refuses ids that are not meeting ids", () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-meetings-"));
  const store = new MeetingStore(dir);
  writeFileSync(join(dir, "profile.json"), "{}");
  assert.equal(store.delete("../profile"), false);
  assert.equal(store.delete("profile"), false);
  assert.equal(existsSync(join(dir, "profile.json")), true);
});

test("store gives a new id when two meetings start in the same second", () => {
  const store = new MeetingStore(join(mkdtempSync(join(tmpdir(), "lente-meetings-")), "m"));
  const first = newMeeting("a", AT);
  store.save(first);
  assert.equal(store.uniqueId(first.id), `${first.id}-2`);
});

test("an automatic episode ends on a silence gap or at its maximum length", () => {
  const start = 1_000_000;
  assert.equal(episodeEnd({ startedAt: start, lastSpeechAt: start + 60_000 }, start + 60_000 + EPISODE_SILENCE_MS - 1), undefined);
  assert.equal(episodeEnd({ startedAt: start, lastSpeechAt: start + 60_000 }, start + 60_000 + EPISODE_SILENCE_MS), "silence");
  assert.equal(episodeEnd({ startedAt: start, lastSpeechAt: start + EPISODE_MAX_MS - 1000 }, start + EPISODE_MAX_MS), "max-length");
  assert.equal(episodeEnd({ startedAt: start, lastSpeechAt: start }, start + EPISODE_MAX_MS), "silence", "silence wins when both apply");
  assert.equal(episodeEnd({ startedAt: 0, lastSpeechAt: 9000 }, 12_000, { silenceMs: 3000, maxMs: 60_000 }), "silence");
  assert.equal(episodeEnd({ startedAt: 0, lastSpeechAt: 9500 }, 12_000, { silenceMs: 3000, maxMs: 10_000 }), "max-length");
});

test("validateNotes parses the title and topic, trims the title and drops a topic outside the list", () => {
  const long = "Revisión   del presupuesto " + "x".repeat(80);
  const { notes } = validateNotes({ title: long, topic: "Cliente", summary: "s" }, ["t1"]);
  assert.ok(notes.title && notes.title.length <= 60 && !notes.title.includes("  "));
  assert.equal(notes.topic, "Cliente");
  const odd = validateNotes({ title: 5, topic: "Deportes", summary: "s" }, ["t1"]).notes;
  assert.equal(odd.title, undefined);
  assert.equal(odd.topic, undefined);
  const schema = notesSchema(["t1"]) as { required: string[]; properties: { topic: { enum: string[] } } };
  assert.ok(schema.required.includes("title") && schema.required.includes("topic"));
  assert.ok(schema.properties.topic.enum.includes("Otro"));
});

test("the generated title fills an untitled meeting, the wearer's title always wins", () => {
  const untitled = newMeeting("", AT);
  applyTitleAndTopic(untitled, { title: "Plan del trimestre", topic: "Equipo", summary: "", decisions: [], commitments: [], openQuestions: [] });
  assert.equal(untitled.title, "Plan del trimestre");
  assert.equal(untitled.titleGenerated, true);
  assert.equal(untitled.topic, "Equipo");
  const typed = newMeeting("Sprint review", AT);
  applyTitleAndTopic(typed, { title: "Otro título", topic: "Proyecto", summary: "", decisions: [], commitments: [], openQuestions: [] });
  assert.equal(typed.title, "Sprint review");
  assert.equal(typed.titleGenerated, undefined);
  assert.equal(typed.topic, "Proyecto");
});

test("searchMeetings ignores case and accents, returns matching lines and lists the newest first", () => {
  const old = newMeeting("Cliente", AT);
  addTurn(old, { at: AT, speaker: "A", text: "El Presupuesto sube un diez por ciento" });
  addTurn(old, { at: AT, speaker: "B", text: "Nada más" });
  const recent = newMeeting("Reunión semanal", AT + 86_400_000);
  addTurn(recent, { at: AT, speaker: "A", text: "hablemos del presupuesto" });
  recent.notes = { summary: "Se revisó el PRESUPUESTO.", decisions: [{ text: "Congelar gastos", evidence: ["t1"] }], commitments: [], openQuestions: [] };
  const other = newMeeting("Otra", AT + 2 * 86_400_000);
  addTurn(other, { at: AT, speaker: "A", text: "nada relevante" });
  const found = searchMeetings([old, recent, other], "presupuesto");
  assert.deepEqual(found.map((r) => r.id), [recent.id, old.id]);
  assert.deepEqual(found[1].matches, [{ where: "transcript", turnId: "t1", line: "El Presupuesto sube un diez por ciento" }]);
  assert.equal(found[0].matches.length, 2);
  assert.equal(searchMeetings([recent], "reunion")[0].matches[0].where, "title");
  assert.equal(searchMeetings([old, recent], "  PRESUPUESTO ").length, 2);
});

test("searchMeetings returns an empty list for no match or a blank query", () => {
  const m = newMeeting("Sprint", AT);
  addTurn(m, { at: AT, speaker: "A", text: "hola" });
  assert.deepEqual(searchMeetings([m], "zzz"), []);
  assert.deepEqual(searchMeetings([m], "   "), []);
});

test("notesAsText has title, date and notes but no transcript", () => {
  const m = meetingWith(["hola uno", "hola dos", "hola tres"]);
  m.notes = { summary: "Se acordó el plan.", decisions: [{ text: "Lanzar el lunes", evidence: ["t1"] }], commitments: [{ what: "Mandar el correo", owner: "you", due: "viernes", evidence: ["t2"] }], openQuestions: [], glossary: [{ term: "SLA", meaning: "acuerdo de servicio", evidence: ["t3"] }] };
  const text = notesAsText(m, "28 oct");
  assert.match(text, /^Sprint review\n28 oct\n\nSe acordó el plan\./);
  assert.match(text, /Decisiones:\n- Lanzar el lunes/);
  assert.match(text, /- Yo: Mandar el correo \(viernes\)/);
  assert.match(text, /- SLA: acuerdo de servicio/);
  assert.doesNotMatch(text, /hola uno|Preguntas abiertas/);
});
