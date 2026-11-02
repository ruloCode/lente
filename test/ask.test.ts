import assert from "node:assert/strict";
import { test } from "node:test";
import { ASK_HISTORY, NOT_FOUND, ask, buildMemory, parseAsk } from "../src/ask.ts";
import type { ChatMessage } from "../src/chat.ts";
import type { DayEntry } from "../src/day-log.ts";
import type { Fact } from "../src/fact-store.ts";
import type { Meeting } from "../src/meetings.ts";

const T0 = new Date(2026, 10, 1, 10, 24).getTime();
const MIN = 60_000;

const MEETING: Meeting = {
  id: "m20261101102400",
  title: "Fecha de lanzamiento",
  startedAt: T0,
  endedAt: T0 + 12 * MIN,
  status: "done",
  turns: [
    { id: "t1", at: T0 + MIN, speaker: "A", text: "¿Puedes mandar los números de ventas antes del viernes?" },
    { id: "t2", at: T0 + 2 * MIN, speaker: "B", wearer: true, text: "Sí, los mando el jueves." },
  ],
  notes: { summary: "Se fijó el lanzamiento para el 14.", decisions: [{ text: "Lanzar el 14", evidence: ["t1"] }], commitments: [{ what: "mandar los números de ventas", owner: "you", due: "viernes", evidence: ["t2"] }], openQuestions: [], glossary: [] },
} as Meeting;

const DAY: DayEntry[] = [
  { at: T0 + 5 * MIN, kind: "turn", speaker: "A", text: "dentro de la reunión" },
  { at: T0 + 40 * MIN, kind: "live", text: "Una pizarra con tres columnas: Ahora, Siguiente y Después." },
  { at: T0 + 50 * MIN, kind: "turn", speaker: "C", text: "El café de la esquina abre a las ocho." },
];
const FACTS: Fact[] = [{ id: "f1", text: "Marcos prefiere los informes en PDF.", status: "kept", meetingId: MEETING.id, evidence: ["t1"], createdAt: T0 }];

test("the memory numbers meetings, their turns, what was heard and seen outside them, and kept facts", () => {
  const { text, sources } = buildMemory({ meetings: [MEETING], day: DAY, facts: FACTS });
  assert.match(text, /\[M1\] Reunión «Fecha de lanzamiento»/);
  assert.match(text, /\[M1\.t2\] .*los mando el jueves/);
  assert.match(text, /\[S1\] .*la cámara vio: Una pizarra/);
  assert.match(text, /\[H1\] .*El café de la esquina/);
  assert.match(text, /\[F1\] Recuerdo: Marcos prefiere/);
  // A turn inside a meeting is already in the meeting; it is not repeated as heard.
  assert.doesNotMatch(text, /dentro de la reunión/);
  assert.deepEqual(sources.get("M1.t2"), { id: "M1.t2", kind: "meeting", label: "Fecha de lanzamiento · 10:26", at: T0 + 2 * MIN, meetingId: MEETING.id, turnId: "t2" });
  assert.equal(sources.get("S1")?.label, "Lo viste · 11:04");
});

test("the memory keeps the newest material when it does not all fit", () => {
  const { text } = buildMemory({ meetings: [MEETING], day: DAY, facts: [] }, 120);
  assert.ok(text.length <= 120);
  assert.match(text, /El café/); // newest heard line first
});

test("answers cite real ids; unknown ids are dropped and an answer with only unknown ids is not trusted", () => {
  const { sources } = buildMemory({ meetings: [MEETING], day: DAY, facts: FACTS });
  const good = parseAsk('{"found":true,"answer":"Prometiste mandar los números el jueves.","sources":["M1.t2","X9","M1.t2"]}', sources);
  assert.equal(good.found, true);
  assert.deepEqual(good.sources.map((s) => s.id), ["M1.t2"]);
  assert.deepEqual(parseAsk('{"found":true,"answer":"El 14.","sources":["M7"]}', sources), { answer: NOT_FOUND, sources: [], found: false });
  assert.deepEqual(parseAsk('{"found":false,"answer":"","sources":[]}', sources), { answer: NOT_FOUND, sources: [], found: false });
  assert.deepEqual(parseAsk("not json", sources), { answer: NOT_FOUND, sources: [], found: false });
  // Small talk has no ids.
  assert.equal(parseAsk('{"found":true,"answer":"¡Hola! Pregúntame por tus reuniones.","sources":[]}', sources).found, true);
});

test("one call per question, with the memory, the recent conversation and the question last", async () => {
  const calls: ChatMessage[][] = [];
  let t = 0;
  const history = Array.from({ length: ASK_HISTORY + 4 }, (_, i) => ({ role: i % 2 ? "lente" : "user", text: `m${i}` }));
  const out = await ask(
    { question: "  ¿Qué había en la pizarra? ", history: [...history, { role: "system", text: "ignored" }], meetings: [MEETING], day: DAY, facts: FACTS, now: T0 + 60 * MIN },
    async (m) => (calls.push(m), '{"found":true,"answer":"Tres columnas: Ahora, Siguiente y Después.","sources":["S1"]}'),
    () => (t += 700),
  );
  assert.deepEqual(out, { ok: true, answer: "Tres columnas: Ahora, Siguiente y Después.", sources: [{ id: "S1", kind: "seen", label: "Lo viste · 11:04", at: T0 + 40 * MIN }], found: true, ms: 700 });
  const sent = calls[0];
  assert.equal(sent[0].role, "system");
  assert.match(String(sent[0].content), /MEMORIA:\n[\s\S]*\[S1\]/);
  assert.equal(sent.length, 1 + ASK_HISTORY + 1);
  assert.equal(sent.at(-1)?.content, "¿Qué había en la pizarra?");
  assert.equal(sent.at(-2)?.role, "assistant");
});

test("an empty question is refused without a model call", async () => {
  let called = false;
  const out = await ask({ question: "  ", history: [], meetings: [], day: [], facts: [], now: T0 }, async () => ((called = true), ""));
  assert.equal(out.ok, false);
  assert.equal(called, false);
});
