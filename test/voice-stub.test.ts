// add-voice-mode 1.3: the voice agent's loop on the stubbed Meta API (scripts/stub-meta.ts), over
// the real wire adapter and tools with a fake backend. Synthetic data only; no key, no network.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type StubMeta, STUB_WEB_URL, startStubMeta } from "../scripts/stub-meta.ts";
import type { Task } from "../src/agent-tools.ts";
import type { ChatTarget } from "../src/providers.ts";
import { VOICE_FUNCTIONS, type VoiceTurnEvent, runVoiceTurn, voiceInstructions } from "../src/voice-agent.ts";
import { type VoiceTask, VoiceTools } from "../src/voice-tools.ts";
import { responsesVoiceModel } from "../src/voice-wire.ts";

let stub: StubMeta;
before(async () => (stub = await startStubMeta()));
after(() => stub.server.close());

function setup() {
  const tasks: VoiceTask[] = [{ id: "uuid-1", title: "PROBE Enviar la cotización", who: "me", meetingId: "m1", evidence: [], done: false, createdAt: 1 }];
  const effects: string[] = [];
  const tools = new VoiceTools({
    ask: async () => ({ ok: true, answer: "Decidieron lanzar la beta PROBE el viernes.", found: true, sources: [{ id: "m1.t4", kind: "meeting", label: "PROBE Planeación · 10:00", at: 0, meetingId: "m1", turnId: "t4" }] }),
    projects: async () => [],
    tasks: async () => tasks,
    addTask: async (t) => {
      const task: Task = { ...t, id: `uuid-${tasks.length + 1}`, meetingId: "", evidence: [], done: false, createdAt: 2 };
      tasks.push(task);
      effects.push(`add:${t.title}`);
      return task;
    },
    setDone: async (id) => (effects.push(`done:${id}`), true),
    remove: async (id) => (effects.push(`remove:${id}`), true),
    reassign: async () => true,
    openRecordSheet: (c) => void effects.push(`sheet:${JSON.stringify(c)}`),
  });
  const target: ChatTarget = { id: "spark-1.3-minimal", label: "", baseUrl: `http://127.0.0.1:${stub.port}/v1`, model: "muse-spark-1.3", apiKey: "stub", keyEnv: "MODEL_API_KEY", provider: "Meta" };
  const model = responsesVoiceModel(target, { instructions: voiceInstructions({ names: ["PROBE"], now: Date.now(), timeZone: "America/Bogota" }), functions: VOICE_FUNCTIONS, webSearch: true });
  const turn = async (utterance: string) => {
    const events: VoiceTurnEvent[] = [];
    const result = await runVoiceTurn({ model, tools: tools.handlers(), history: [], utterance, signal: new AbortController().signal, emit: (e) => events.push(e) });
    return { result, events, spoken: events.filter((e) => e.kind === "sentence").map((e) => e.kind === "sentence" && e.text) };
  };
  return { tasks, effects, tools, turn };
}

test("a memory question answers from ask_memory and cites its meeting", async () => {
  const { turn } = setup();
  const { result, spoken } = await turn("¿Qué se decidió sobre la beta?");
  assert.equal(result.stopped, "answered");
  assert.deepEqual(result.tools, ["ask_memory"]);
  assert.deepEqual(spoken, ["Lo busco en tus reuniones.", "Decidieron lanzar la beta PROBE el viernes."]);
  assert.deepEqual(result.sources, [{ kind: "meeting", label: "PROBE Planeación · 10:00", meetingId: "m1", turnId: "t4" }]);
});

test("«agrega que llame a Ana el viernes» adds the wearer's task with its due hint", async () => {
  const { tasks, turn } = setup();
  const { result, spoken } = await turn("Agrega que llame a Ana el viernes");
  const added = tasks.at(-1)!;
  assert.deepEqual([added.title, added.who, added.due, added.source], ["Llamar a Ana", "me", "viernes", "manual"]);
  assert.equal(spoken.at(-1), "Listo, agregué «Llamar a Ana».");
  assert.equal(result.steps, 2);
});

test("completing asks first and changes nothing until the yes", async () => {
  const { effects, tools, turn } = setup();
  const { result, spoken } = await turn("Marca como hecha la de la cotización");
  assert.deepEqual(result.tools, ["list_tasks", "complete_task"]);
  assert.equal(spoken.at(-1), "¿Marco como hecha «PROBE Enviar la cotización»?");
  assert.deepEqual(effects, [], "nothing done yet");
  assert.ok(tools.pending);
  assert.equal(await tools.confirmPending(), "Listo, marqué «PROBE Enviar la cotización» como hecha.");
  assert.deepEqual(effects, ["done:uuid-1"]);
});

test("delegating leaves a task for Lente and runs nothing", async () => {
  const { tasks, effects, turn } = setup();
  const { spoken } = await turn("Que un agente prepare el resumen para el cliente");
  assert.deepEqual([tasks.at(-1)!.who, tasks.at(-1)!.source], ["lente", "agent"]);
  assert.deepEqual(effects, ["add:Preparar el resumen para el cliente (para PROBE)"]);
  assert.match(String(spoken.at(-1)), /aprobación/);
});

test("web search names its page, and recording only opens the sheet", async () => {
  const { effects, turn } = setup();
  const web = await turn("Busca en internet la capital de PROBE");
  assert.equal(web.result.usage.searches, 1);
  assert.equal(web.result.sources[0].url, STUB_WEB_URL);
  assert.match(String(web.spoken[0]), /example\.org/);
  await turn("Empieza a grabar con cámara");
  assert.deepEqual(effects, ['sheet:{"camera":true}']);
});
