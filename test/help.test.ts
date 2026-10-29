import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_PROMPTS, MEANING_MARK, REPLY_MAX_CHARS, TOPIC_MAX_CHARS } from "../src/briefing.ts";
import type { ChatMessage } from "../src/chat.ts";
import { HELP_TURNS, requestHelp } from "../src/help.ts";

const ENGLISH = [
  { speaker: "A", text: "So the deadline for the billing export is Friday." },
  { speaker: "B", text: "That's tight, QA still needs two days." },
  { speaker: "A", text: "Can we cut the CSV option for now?" },
];
const SPANISH = [
  { speaker: "A", text: "Entonces la entrega del reporte es el viernes." },
  { speaker: "B", text: "Está apretado, a QA le faltan dos días." },
];

/** A model that answers with `reply` and remembers what it was asked. */
function fakeModel(reply: string) {
  const calls: ChatMessage[][] = [];
  return { calls, ask: async (messages: ChatMessage[]) => (calls.push(messages), reply) };
}

/** A clock that moves 1234 ms between the request and the answer. */
function fakeClock() {
  let t = 1000;
  return () => (t += 1234) - 1234;
}

test("help: Pregunta in an English meeting gives one English question with its Spanish meaning and its time", async () => {
  const model = fakeModel(`Could we ship CSV in a follow-up release?\n${MEANING_MARK} ¿Podríamos sacar el CSV en una versión posterior?`);
  const out = await requestHelp({ kind: "pregunta", assistMode: "assist", turns: ENGLISH, memory: "" }, model.ask, fakeClock());
  assert.deepEqual(out, { ok: true, kind: "pregunta", label: "Pregunta", text: "Could we ship CSV in a follow-up release?", meaning: "¿Podríamos sacar el CSV en una versión posterior?", ms: 1234 });
  assert.equal(model.calls.length, 1);
  assert.match(model.calls[0][0].content as string, /ONE good question/);
  assert.match(model.calls[0][1].content as string, /A: Can we cut the CSV option for now\?/);
});

test("help: Aportar in a Spanish meeting has no separate meaning", async () => {
  const model = fakeModel("Puedo hablar con QA hoy para ver si lo acortamos.\nES: Puedo hablar con QA hoy.");
  const out = await requestHelp({ kind: "aportar", assistMode: "assist", turns: SPANISH, memory: "" }, model.ask);
  assert.equal(out.ok && out.label, "Aportar");
  assert.equal(out.ok && out.meaning, undefined);
});

test("help: ¿De qué hablan? is Spanish on one line, at most the topic cap, with no meaning", async () => {
  const model = fakeModel("Hablan de la fecha de entrega del export de facturación.\nQA pide dos días más.");
  const out = await requestHelp({ kind: "tema", assistMode: "assist", turns: ENGLISH, memory: "" }, model.ask);
  assert.ok(out.ok);
  assert.equal(out.label, "¿De qué hablan?");
  assert.equal(out.text, "Hablan de la fecha de entrega del export de facturación. QA pide dos días más.");
  assert.equal(out.meaning, undefined);
  assert.ok(out.text.length <= TOPIC_MAX_CHARS);
  assert.match(model.calls[0][0].content as string, /in Spanish what is being discussed/);
});

test("help: the line to say and its meaning keep the reply's 90-character cap", async () => {
  const long = "We could ship the billing export on Friday without the CSV option and add it back next sprint once QA is done";
  const out = await requestHelp({ kind: "aportar", assistMode: "assist", turns: ENGLISH, memory: "" }, fakeModel(`${long}\n${MEANING_MARK} ${long}`).ask);
  assert.ok(out.ok);
  assert.ok(out.text.length <= REPLY_MAX_CHARS);
  assert.ok((out.meaning ?? "").length <= REPLY_MAX_CHARS);
});

test("help: refused in Solo grabar, with no model call", async () => {
  const model = fakeModel("anything");
  const out = await requestHelp({ kind: "aportar", assistMode: "record", turns: ENGLISH, memory: "" }, model.ask);
  assert.deepEqual(out, { ok: false, reason: "record-only", message: "La ayuda está apagada en Solo grabar." });
  assert.equal(model.calls.length, 0);
});

test("help: refused before anything was said, with no model call", async () => {
  const model = fakeModel("anything");
  const out = await requestHelp({ kind: "tema", assistMode: "assist", turns: [{ text: "  " }], memory: "" }, model.ask);
  assert.equal(!out.ok && out.reason, "no-turns");
  assert.equal(model.calls.length, 0);
});

test("help: an unknown kind is refused", async () => {
  const model = fakeModel("anything");
  for (const kind of ["resumen", "toString", undefined, 3]) {
    const out = await requestHelp({ kind, assistMode: "assist", turns: ENGLISH, memory: "" }, model.ask);
    assert.equal(!out.ok && out.reason, "unknown-kind");
  }
  assert.equal(model.calls.length, 0);
});

test("help: an empty answer is reported, not shown", async () => {
  const out = await requestHelp({ kind: "pregunta", assistMode: "assist", turns: ENGLISH, memory: "" }, fakeModel("   ").ask);
  assert.equal(!out.ok && out.reason, "empty");
});

test("help: the model reads the last twelve turns, after the memory", async () => {
  const turns = Array.from({ length: HELP_TURNS + 5 }, (_, i) => ({ speaker: "A", text: `line ${i}` }));
  const model = fakeModel("Sounds good.");
  await requestHelp({ kind: "aportar", assistMode: "assist", turns, memory: "WHAT LENTE REMEMBERS" }, model.ask);
  const [system, user] = model.calls[0];
  assert.ok((system.content as string).startsWith("WHAT LENTE REMEMBERS\n\n"));
  assert.ok((system.content as string).includes(HELP_PROMPTS.aportar));
  assert.equal((user.content as string).split("\n").length - 1, HELP_TURNS);
  assert.doesNotMatch(user.content as string, /line 4\n/);
});

test("help: a failed model call throws for the hub to report", async () => {
  await assert.rejects(requestHelp({ kind: "aportar", assistMode: "assist", turns: ENGLISH, memory: "" }, async () => Promise.reject(new Error("HTTP 503"))), /HTTP 503/);
});
