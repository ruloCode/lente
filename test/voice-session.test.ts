// add-voice-mode 2.1: one voice session with a fake agent turn. Synthetic text only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { NarrationGuard } from "../src/self-voice.ts";
import type { VoiceTurnEvent, VoiceTurnResult } from "../src/voice-agent.ts";
import { type VoiceEvent, type VoiceLine, VoiceSession, parsePhoneMessage } from "../src/voice-session.ts";

const done = (text: string, extra: Partial<VoiceTurnResult> = {}): VoiceTurnResult => ({ stopped: "answered", text, sources: [], tools: [], steps: 1, usage: { input: 1, cached: 0, output: 1, searches: 0 }, ...extra });

function session(run: (utterance: string, signal: AbortSignal, emit: (e: VoiceTurnEvent) => void) => Promise<VoiceTurnResult>, pending?: { value: unknown }) {
  const sent: VoiceEvent[] = [];
  const saved: VoiceLine[] = [];
  const narration = new NarrationGuard();
  let clock = 1_000;
  const confirmations = {
    get pending() {
      return pending?.value;
    },
    confirmPending: async () => ((pending!.value = undefined), "Listo, marqué «PROBE» como hecha."),
    cancelPending: () => ((pending ? (pending.value = undefined) : undefined), "De acuerdo, dejo «PROBE» como está."),
  };
  const s = new VoiceSession({
    send: (e) => sent.push(e),
    runTurn: (u, _h, signal, emit) => run(u, signal, emit),
    confirmations,
    narration,
    save: (lines) => saved.push(...lines),
    now: () => (clock += 10),
  });
  return { s, sent, saved, narration, types: () => sent.map((e) => e.type) };
}

test("a turn: heard, thinking, sentences as they come, done; the chat keeps both lines", async () => {
  const { s, sent, saved } = session(async (_u, _sig, emit) => {
    emit({ kind: "tool", name: "list_tasks", label: "Revisando tus tareas" });
    emit({ kind: "sentence", text: "Tienes dos tareas en PROBE.", commentary: false });
    emit({ kind: "sources", sources: [{ kind: "meeting", label: "PROBE · 10:00", meetingId: "m1" }] });
    return done("Tienes dos tareas en PROBE.");
  });
  s.heardTurn("¿Qué tengo pendiente?");
  await s.running;
  const kinds = sent.map((e) => (e.type === "state" ? `state:${e.state}` : e.type));
  assert.deepEqual(kinds, ["heard", "thinking", "state:thinking", "tool", "reply", "state:speaking", "sources", "done"]);
  assert.deepEqual(saved.map((l) => [l.role, l.text, l.sources.length]), [["user", "¿Qué tengo pendiente?", 0], ["lente", "Tienes dos tareas en PROBE.", 1]]);
  assert.equal(s.state, "speaking");
  s.phone({ type: "spoken", turn: 1, count: 1 });
  assert.equal(s.state, "listening", "back to listening once the phone spoke every sentence");
});

test("the phone finishing early does not end the speaking state while sentences are still coming", async () => {
  let release!: () => void;
  const { s } = session(async (_u, _sig, emit) => {
    emit({ kind: "sentence", text: "Primera frase de la respuesta.", commentary: false });
    await new Promise<void>((r) => (release = r));
    emit({ kind: "sentence", text: "Segunda frase de la respuesta.", commentary: false });
    return done("x");
  });
  s.heardTurn("PROBE pregunta");
  await new Promise((r) => setImmediate(r));
  s.phone({ type: "spoken", turn: 1, count: 1 });
  assert.equal(s.state, "speaking");
  release();
  await s.running;
  assert.equal(s.state, "speaking", "the second sentence is not spoken yet");
  s.phone({ type: "spoken", turn: 1, count: 2 });
  assert.equal(s.state, "listening");
});

test("barge-in: the wearer's words cancel the reply, nothing of it is sent after, and the new turn is answered", async () => {
  let firstSignal: AbortSignal | undefined;
  let release!: () => void;
  const { s, sent, saved } = session(async (u, signal, emit) => {
    if (u === "PROBE primera") {
      firstSignal = signal;
      emit({ kind: "sentence", text: "Una respuesta larga que empieza.", commentary: false });
      await new Promise<void>((r) => (release = r));
      emit({ kind: "sentence", text: "Esto ya no debe salir nunca.", commentary: false });
      return done("cancelled");
    }
    emit({ kind: "sentence", text: "Respuesta a la segunda.", commentary: false });
    return done("Respuesta a la segunda.");
  });
  s.heardTurn("PROBE primera");
  await new Promise((r) => setImmediate(r));
  s.heardPartial("espera otra");
  assert.equal(firstSignal?.aborted, true);
  assert.deepEqual(sent.filter((e) => e.type === "bargeIn"), [{ type: "bargeIn", turn: 1 }]);
  release();
  s.heardTurn("Espera, otra cosa");
  await s.running;
  const replies = sent.filter((e) => e.type === "reply").map((e) => e.type === "reply" && `${e.turn}:${e.text}`);
  assert.deepEqual(replies, ["1:Una respuesta larga que empieza.", "2:Respuesta a la segunda."]);
  assert.deepEqual(saved.map((l) => `${l.role}:${l.text}`), ["user:PROBE primera", "user:Espera, otra cosa", "lente:Respuesta a la segunda."], "the cancelled reply is not kept");
});

test("Lente's own voice coming back is neither a partial, nor barge-in, nor a turn", async () => {
  let turns = 0;
  const { s, sent } = session(async (_u, _sig, emit) => {
    turns++;
    emit({ kind: "sentence", text: "Tienes una reunión con Ana mañana a las diez.", commentary: false });
    return done("Tienes una reunión con Ana mañana a las diez.");
  });
  s.heardTurn("PROBE ¿qué tengo mañana?");
  await s.running;
  s.heardPartial("tienes una reunión con Ana");
  s.heardTurn("Tienes una reunión con Ana mañana a las diez.");
  await s.running;
  assert.equal(turns, 1);
  assert.equal(sent.filter((e) => e.type === "bargeIn").length, 0);
  assert.equal(sent.filter((e) => e.type === "partial").length, 0);
});

test("one word does not interrupt; pause stops listening until resume", async () => {
  let release!: () => void;
  const { s, sent } = session(async (_u, _sig, emit) => {
    emit({ kind: "sentence", text: "Respuesta de prueba en curso.", commentary: false });
    await new Promise<void>((r) => (release = r));
    return done("x");
  });
  s.heardTurn("PROBE");
  await new Promise((r) => setImmediate(r));
  s.heardPartial("mm");
  assert.equal(sent.filter((e) => e.type === "bargeIn").length, 0);
  s.phone({ type: "pause" });
  assert.equal(s.state, "paused");
  assert.equal(sent.filter((e) => e.type === "bargeIn").length, 1, "pausing cancels the reply in progress");
  release();
  await s.running;
  s.heardTurn("no me escuches");
  assert.equal(sent.filter((e) => e.type === "heard").length, 1);
  s.phone({ type: "resume" });
  assert.equal(s.state, "listening");
});

test("a pending completion is answered by yes or no without the model; anything else drops it", async () => {
  const pending = { value: { kind: "complete" } as unknown };
  let modelTurns = 0;
  const { s, sent } = session(async (_u, _sig, emit) => {
    modelTurns++;
    emit({ kind: "sentence", text: "Otra respuesta del modelo.", commentary: false });
    return done("Otra respuesta del modelo.");
  }, pending);
  s.heardTurn("Sí");
  await s.running;
  assert.equal(modelTurns, 0);
  assert.equal(pending.value, undefined);
  assert.deepEqual(sent.filter((e) => e.type === "reply").map((e) => e.type === "reply" && e.text), ["Listo, marqué «PROBE» como hecha."]);
  pending.value = { kind: "delete" };
  s.heardTurn("No, déjala");
  await s.running;
  assert.equal(modelTurns, 0);
  pending.value = { kind: "delete" };
  s.heardTurn("¿Qué tareas tengo?");
  await s.running;
  assert.equal(modelTurns, 1);
  assert.equal(pending.value, undefined, "a new request drops the pending action");
});

test("phone messages are parsed strictly", () => {
  assert.deepEqual(parsePhoneMessage('{"type":"spoken","turn":2,"count":3}'), { type: "spoken", turn: 2, count: 3 });
  assert.equal(parsePhoneMessage('{"type":"spoken"}'), undefined);
  assert.deepEqual(parsePhoneMessage('{"type":"bargeIn"}'), { type: "bargeIn" });
  assert.equal(parsePhoneMessage("nope"), undefined);
  assert.equal(parsePhoneMessage('{"type":"rm -rf"}'), undefined);
});
