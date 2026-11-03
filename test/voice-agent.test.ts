// add-voice-mode 1.2: sentences, confirmations and the tool loop with a fake model. Synthetic text only.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LONG_REPLY_NOTE,
  MODEL_ERROR_REPLY,
  STEP_LIMIT_REPLY,
  SentenceSplitter,
  VOICE_FUNCTIONS,
  VOICE_HISTORY_MESSAGES,
  VOICE_MAX_STEPS,
  type VoiceItem,
  type VoiceModel,
  type VoiceStep,
  type VoiceTurnEvent,
  confirmation,
  runVoiceTurn,
  speakable,
  trimHistory,
  voiceInstructions,
} from "../src/voice-agent.ts";

test("speakable strips markdown, bullets and URLs", () => {
  assert.equal(speakable("**Listo**: ver [la nota](https://x.example/a) en `chat`"), "Listo: ver la nota en chat");
  assert.equal(speakable("- uno\n2. dos"), "uno dos");
  assert.equal(speakable("Mira https://example.com ahora"), "Mira ahora");
});

test("the splitter cuts complete sentences as they stream and holds short pieces", () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push("Hola. "), [], "a piece under the minimum waits");
  assert.deepEqual(s.push("Tienes dos tareas abiertas en PROBE. La primera"), ["Hola. Tienes dos tareas abiertas en PROBE."]);
  assert.deepEqual(s.push(" es llamar a Ana?¡Y la"), [], "no space after the mark yet");
  assert.deepEqual(s.push(" otra!\nFin"), ["La primera es llamar a Ana?¡Y la otra!"]);
  assert.deepEqual(s.flush(), ["Fin"]);
  assert.deepEqual(s.flush(), []);
});

test("confirmation hears yes, no, and anything else as a new request", () => {
  for (const yes of ["Sí", "sí, márcala", "Dale", "claro que sí", "Confirmo", "ok"]) assert.equal(confirmation(yes), "yes", yes);
  for (const no of ["No", "no, mejor no", "Cancela", "déjalo así", "Espera"]) assert.equal(confirmation(no), "no", no);
  for (const other of ["sí, pero la otra", "¿Qué tareas tengo?", "", "agrega otra tarea"]) assert.equal(confirmation(other), undefined, other);
});

test("instructions name the wearer, the day and the projects, and stay the same within a day", () => {
  const ctx = { names: ["PROBE-Rulo"], now: Date.parse("2026-11-02T15:00:00Z"), timeZone: "America/Bogota", projects: [{ id: "p1", name: "PROBE Alfa" }] };
  const a = voiceInstructions(ctx);
  assert.match(a, /PROBE-Rulo/);
  assert.match(a, /2 de noviembre de 2026/);
  assert.match(a, /p1 PROBE Alfa/);
  assert.equal(a, voiceInstructions({ ...ctx, now: ctx.now + 3600_000 }));
  assert.ok(VOICE_FUNCTIONS.every((f) => !f.name.startsWith("browser.")), "names reserved by web_search are not used");
});

test("history keeps the last messages, starts with the wearer and drops commentary", () => {
  const items: VoiceItem[] = [];
  for (let i = 0; i < VOICE_HISTORY_MESSAGES; i++) items.push({ type: "message", role: i % 2 ? "assistant" : "user", text: `m${i}` });
  items.push({ type: "message", role: "assistant", text: "pre", phase: "commentary" }, { type: "message", role: "user", text: "last" });
  const kept = trimHistory(items);
  assert.equal(kept[0].type === "message" && kept[0].role, "user");
  assert.ok(kept.length <= VOICE_HISTORY_MESSAGES);
  assert.ok(!kept.some((i) => i.type === "message" && i.phase));
});

/** A fake model that plays scripted steps, streaming each text in small deltas. */
function scripted(steps: (Partial<VoiceStep> & { text?: string; commentary?: string; search?: string })[], seen: VoiceItem[][] = []): VoiceModel {
  let i = 0;
  return async (input, signal, on) => {
    seen.push(structuredClone(input));
    const s = steps[Math.min(i++, steps.length - 1)];
    if (s.search) on.search(s.search);
    for (const [text, commentary] of [[s.commentary, true], [s.text, false]] as const) {
      if (!text) continue;
      for (let k = 0; k < text.length; k += 7) {
        if (signal.aborted) throw new Error("aborted");
        on.text(text.slice(k, k + 7), commentary);
        await new Promise((r) => setImmediate(r));
      }
    }
    return {
      items: [...(s.commentary ? [{ type: "message" as const, role: "assistant" as const, text: s.commentary, phase: "commentary" as const }] : []), ...(s.items ?? [])],
      calls: s.calls ?? [],
      sources: s.sources ?? [],
      searches: s.search ? [s.search] : [],
      usage: s.usage ?? { input: 100, cached: 60, output: 10 },
    };
  };
}

const call = (name: string, args: Record<string, unknown>, id = `call_${name}`) => ({
  items: [{ type: "function_call" as const, callId: id, name, arguments: JSON.stringify(args) }],
  calls: [{ callId: id, name, args }],
});

test("a tool turn: commentary is spoken, the tool runs, its output goes back, the answer is spoken", async () => {
  const events: VoiceTurnEvent[] = [];
  const seen: VoiceItem[][] = [];
  const ran: unknown[] = [];
  const result = await runVoiceTurn({
    model: scripted([{ commentary: "Lo anoto en tu lista.", ...call("add_task", { title: "Llamar a Ana", who: "me" }) }, { text: "Listo, anoté llamar a Ana el viernes." }], seen),
    tools: { add_task: (args) => (ran.push(args), { result: { ok: true, id: "t1" }, label: "Tarea agregada" }) },
    history: [],
    utterance: "Agrega que llame a Ana el viernes",
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
  });
  assert.equal(result.stopped, "answered");
  assert.equal(result.steps, 2);
  assert.equal(result.text, "Listo, anoté llamar a Ana el viernes.");
  assert.deepEqual(ran, [{ title: "Llamar a Ana", who: "me" }]);
  assert.deepEqual(events.map((e) => e.kind === "sentence" ? `${e.commentary ? "c" : "a"}:${e.text}` : `${e.kind}:${"name" in e ? e.name : ""}`), ["c:Lo anoto en tu lista.", "tool:add_task", "a:Listo, anoté llamar a Ana el viernes."]);
  // The second step replays the commentary with its phase, the call and its output, in order.
  const second = seen[1];
  assert.deepEqual(second.slice(-3).map((i) => i.type === "message" ? `${i.type}:${i.phase}` : i.type), ["message:commentary", "function_call", "function_call_output"]);
  assert.equal(result.usage.input, 200);
  assert.ok(result.firstSentenceMs !== undefined && result.firstTextMs !== undefined);
});

test("web search: the tool chip and the pages it used are emitted, and searches are counted", async () => {
  const events: VoiceTurnEvent[] = [];
  const result = await runVoiceTurn({
    model: scripted([{ search: "capital de PROBE", text: "Es PROBE City, según example.org.", sources: [{ kind: "web", label: "example.org", url: "https://example.org/a" }] }]),
    tools: {},
    history: [],
    utterance: "Busca la capital de PROBE",
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
  });
  assert.equal(result.usage.searches, 1);
  assert.deepEqual(result.tools, ["web_search"]);
  assert.ok(events.some((e) => e.kind === "sources" && e.sources[0].url === "https://example.org/a"));
});

test("a long answer speaks three sentences and says the rest stays in the chat", async () => {
  const spoken: string[] = [];
  const text = "Primera frase de prueba. Segunda frase de prueba. Tercera frase de prueba. Cuarta frase de prueba. Quinta frase.";
  const result = await runVoiceTurn({ model: scripted([{ text }]), tools: {}, history: [], utterance: "x", signal: new AbortController().signal, emit: (e) => e.kind === "sentence" && spoken.push(e.text) });
  assert.deepEqual(spoken, ["Primera frase de prueba.", "Segunda frase de prueba.", "Tercera frase de prueba.", LONG_REPLY_NOTE]);
  assert.equal(result.text, text, "the chat keeps all of it");
});

test("an unknown tool or a throwing one answers the model with an error instead of stopping", async () => {
  const seen: VoiceItem[][] = [];
  const result = await runVoiceTurn({
    model: scripted([call("nope", {}), call("boom", {}), { text: "No pude hacerlo esta vez." }], seen),
    tools: { boom: () => { throw new Error("store down"); } },
    history: [],
    utterance: "x",
    signal: new AbortController().signal,
    emit: () => {},
  });
  assert.equal(result.stopped, "answered");
  const outputs = seen[2].filter((i) => i.type === "function_call_output").map((i) => i.type === "function_call_output" && i.output);
  assert.match(String(outputs[0]), /unknown tool nope/);
  assert.match(String(outputs[1]), /store down/);
});

test("the loop stops at the step limit and says so", async () => {
  const spoken: string[] = [];
  const result = await runVoiceTurn({ model: scripted([call("list_projects", {})]), tools: { list_projects: () => ({ result: [], label: "x" }) }, history: [], utterance: "x", signal: new AbortController().signal, emit: (e) => e.kind === "sentence" && spoken.push(e.text) });
  assert.equal(result.stopped, "step-limit");
  assert.equal(result.steps, VOICE_MAX_STEPS);
  assert.deepEqual(spoken, [STEP_LIMIT_REPLY]);
});

test("a model error is spoken as one short line", async () => {
  const spoken: string[] = [];
  const result = await runVoiceTurn({ model: async () => { throw new Error("HTTP 500"); }, tools: {}, history: [], utterance: "x", signal: new AbortController().signal, emit: (e) => e.kind === "sentence" && spoken.push(e.text) });
  assert.equal(result.stopped, "model-error");
  assert.deepEqual(spoken, [MODEL_ERROR_REPLY]);
});

test("cancelling mid-answer emits nothing more and runs no tool", async () => {
  const controller = new AbortController();
  const spoken: string[] = [];
  let toolRan = false;
  const turn = runVoiceTurn({
    model: scripted([{ text: "Una frase bastante larga para probar. Otra frase más que no debe salir. Y otra." }, call("add_task", { title: "x" })]),
    tools: { add_task: () => ((toolRan = true), { result: {}, label: "" }) },
    history: [],
    utterance: "x",
    signal: controller.signal,
    emit: (e) => {
      if (e.kind === "sentence") {
        spoken.push(e.text);
        controller.abort();
      }
    },
  });
  const result = await turn;
  assert.equal(result.stopped, "cancelled");
  assert.equal(spoken.length, 1);
  assert.equal(toolRan, false);
});
