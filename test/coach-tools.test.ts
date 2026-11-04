// add-language-coach 2.1: the coach's tools over a fake backend, and the agent loop saying their lines.
// Synthetic phrases only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COACH_FUNCTIONS, COACH_TAP_QUESTION, type VoiceModel, type VoiceTurnEvent, coachTapModel, runVoiceTurn } from "../src/voice-agent.ts";
import { parsePhoneMessage } from "../src/voice-session.ts";
import { type VoiceBackend, VoiceTools } from "../src/voice-tools.ts";

function backend(seen = "o garfo = el tenedor\na xícara = la taza") {
  const looks: { question: string; prompt?: string }[] = [];
  const b: VoiceBackend = {
    ask: async () => ({ ok: true, answer: "", found: false, sources: [] }),
    projects: async () => [],
    tasks: async () => [],
    addTask: async () => { throw new Error("not in the coach"); },
    setDone: async () => false,
    remove: async () => false,
    reassign: async () => false,
    openRecordSheet: () => {},
    look: async (question, _mode, coach) => (looks.push({ question, ...(coach ? { prompt: coach.prompt } : {}) }), { ok: true, text: seen }),
  };
  return { b, looks };
}

const session = (heard = "") => {
  const said: string[] = [];
  return { said, coach: { lang: "pt" as const, band: "A1" as const, heard: () => heard, pronounced: (t: string) => void said.push(t) } };
};

test("the coach's functions are pronounce, look, check_repeat and ask_memory", () => {
  assert.deepEqual(COACH_FUNCTIONS.map((f) => f.name), ["pronounce", "look", "check_repeat", "ask_memory"]);
});

test("start with persona coach keeps its language and mode; anything else stays as before", () => {
  assert.deepEqual(parsePhoneMessage(JSON.stringify({ type: "start", persona: "coach", lang: "PT", mode: "tutor" })), { type: "start", persona: "coach", intro: false, mode: "tutor", lang: "pt" });
  assert.deepEqual(parsePhoneMessage(JSON.stringify({ type: "start", persona: "coach", lang: "pt", mode: "nope", intro: true })), { type: "start", persona: "coach", intro: true, mode: "tutor", lang: "pt" });
  assert.deepEqual(parsePhoneMessage(JSON.stringify({ type: "start", persona: "sight", intro: true })), { type: "start", persona: "sight", intro: true });
  assert.deepEqual(parsePhoneMessage(JSON.stringify({ type: "look" })), { type: "look" });
});

test("pronounce says the phrase in Portuguese and shows its card", async () => {
  const { b } = backend();
  const s = session();
  const out = await new VoiceTools(b).coachHandlers(s.coach).pronounce!({ text: "o garfo", meaning: "el tenedor" });
  assert.deepEqual(out.say, [{ text: "O garfo.", phrase: "o garfo", lang: "pt", meaning: "el tenedor" }]);
  assert.deepEqual(s.said, ["o garfo"]);
});

test("a coach look asks with the coach's prompt and says the names, the first in a sentence", async () => {
  const { b, looks } = backend();
  const out = await new VoiceTools(b).coachHandlers(session().coach).look!({ question: "¿Qué es esto?" });
  assert.match(looks[0]!.prompt!, /language tutor naming things/);
  assert.deepEqual((out.result as any).names, ["o garfo = el tenedor", "a xícara = la taza"]);
  assert.deepEqual(out.say!.map((l) => [l.text, l.phrase, l.meaning, l.lang]), [["Isso é um garfo. O garfo.", "o garfo", "el tenedor", "pt"], ["A xícara.", "a xícara", "la taza", "pt"]]);
  const blurred = await new VoiceTools(backend("?").b).coachHandlers(session().coach).look!({ question: "¿Qué es esto?" });
  assert.equal(blurred.say, undefined, "nothing clear, nothing said");
});

test("check_repeat compares the wearer's turn with the phrase", async () => {
  const { b } = backend();
  assert.equal(((await new VoiceTools(b).coachHandlers(session("O garfo.").coach).check_repeat!({ expected: "o garfo" })).result as any).result, "understood");
  assert.equal(((await new VoiceTools(b).coachHandlers(session("o gato").coach).check_repeat!({ expected: "o garfo" })).result as any).result, "missed");
});

test("the loop shows a tool's phrase card, says its line in its language, and keeps it in the chat", async () => {
  let step = 0;
  const model: VoiceModel = async (_input, _signal, on) => {
    if (step++ === 0) return { items: [], calls: [{ callId: "c1", name: "pronounce", args: { text: "o garfo", meaning: "el tenedor" } }], sources: [], searches: [] };
    on.text("Repítelo conmigo, despacio.", false);
    return { items: [], calls: [], sources: [], searches: [] };
  };
  const events: VoiceTurnEvent[] = [];
  const tools = new VoiceTools(backend().b).coachHandlers(session().coach);
  const result = await runVoiceTurn({ model, tools, history: [], utterance: "¿Cómo se dice tenedor?", signal: new AbortController().signal, emit: (e) => events.push(e) });
  assert.deepEqual(events.filter((e) => e.kind !== "tool"), [
    { kind: "pronounce", text: "o garfo", meaning: "el tenedor", lang: "pt" },
    { kind: "sentence", text: "O garfo.", commentary: false, lang: "pt" },
    { kind: "sentence", text: "Repítelo conmigo, despacio.", commentary: false },
  ]);
  assert.equal(result.text, "O garfo. Repítelo conmigo, despacio.");
});

test("a tap looks at once with no model call, and says the names as cards and Portuguese lines", async () => {
  const run = async (seen: string) => {
    const events: VoiceTurnEvent[] = [];
    const tools = new VoiceTools(backend(seen).b).coachHandlers(session().coach);
    const result = await runVoiceTurn({ model: coachTapModel(COACH_TAP_QUESTION), tools, history: [], utterance: COACH_TAP_QUESTION, signal: new AbortController().signal, emit: (e) => events.push(e) });
    return { events: events.filter((e) => e.kind !== "tool"), result };
  };
  const named = await run("o garfo = el tenedor\na xícara = la taza");
  assert.deepEqual(named.events.map((e) => (e.kind === "pronounce" ? `card:${e.text}` : e.kind === "sentence" ? `${e.lang}:${e.text}` : e.kind)), ["card:o garfo", "pt:Isso é um garfo. O garfo.", "card:a xícara", "pt:A xícara."]);
  assert.deepEqual(named.result.tools, ["look"]);
  const blurred = await run("?");
  assert.deepEqual(blurred.events.map((e) => (e.kind === "sentence" ? e.text : e.kind)), ["No veo nada claro; acerca la cámara o busca más luz."]);
});
