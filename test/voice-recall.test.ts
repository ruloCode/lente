// add-memory-engine 5.1 to 5.3: voice with fast recall. The session's first developer message carries
// the memory prefix and stays first; retrieval runs on scripted partials (debounced) and on the final
// words; a memory question gets lines attached and is answered in the first step, its [[id]] markers
// never spoken but shown as chips; a task request gets no lines; ask_memory returns lines to answer
// from. Synthetic PROBE- memory, fake models and timers; no key, no network.

import assert from "node:assert/strict";
import { test } from "node:test";
import { PEOPLE, PROJECTS, memorySet } from "../scripts/eval/memory-set.ts";
import { RecallRuntime, voiceRecall } from "../src/recall-runtime.ts";
import { type AttachedMemory, type VoiceItem, type VoiceModel, type VoiceStep, type VoiceTurnEvent, runVoiceTurn, speakable, withMemoryPrefix } from "../src/voice-agent.ts";
import { SPECULATE_DEBOUNCE_MS, SpeculativeRecall, type Timer } from "../src/voice-recall.ts";
import { VoiceTools } from "../src/voice-tools.ts";
import { voiceBody } from "../src/voice-wire.ts";

const TZ = "America/Bogota";
const set = memorySet({ days: 14 });
const projects = PROJECTS.map((p) => ({ id: p.id, name: p.name }));
const runtime = new RecallRuntime({ meetings: () => set.meetings, assignments: () => set.assignments, today: () => [], recent: () => [], keptFacts: () => set.keptFacts }, TZ, () => set.now);

/** A model that answers each step with what the script says, and records what it was sent. */
function scripted(steps: ((input: VoiceItem[]) => Partial<VoiceStep> & { text?: string })[]) {
  const seen: VoiceItem[][] = [];
  const model: VoiceModel = async (input, _signal, on) => {
    seen.push([...input]);
    const step = steps[seen.length - 1]!(input);
    for (const piece of (step.text ?? "").match(/.{1,7}/gs) ?? []) on.text(piece, false);
    return { items: step.items ?? [], calls: step.calls ?? [], sources: [], searches: [] };
  };
  return { model, seen };
}

const turn = async (model: VoiceModel, utterance: string, extra: { attached?: AttachedMemory; tools?: Record<string, never> | ReturnType<VoiceTools["handlers"]> } = {}) => {
  const events: VoiceTurnEvent[] = [];
  const result = await runVoiceTurn({ model, tools: extra.tools ?? {}, history: [], utterance, signal: new AbortController().signal, emit: (e) => events.push(e), ...(extra.attached ? { attached: extra.attached } : {}) });
  return { result, events, spoken: events.flatMap((e) => (e.kind === "sentence" ? [e.text] : [])), chips: events.flatMap((e) => (e.kind === "sources" ? e.sources.map((s) => s.label) : [])) };
};

test("5.1: the memory prefix rides in the session's first developer message, once, ahead of everything", () => {
  const rules = "PROBE reglas de voz.";
  const instructions = withMemoryPrefix(rules, "[profile:2026-11-05] Trabaja en PROBE-Atlas.");
  assert.ok(instructions.startsWith(rules));
  assert.match(instructions, /MEMORIA[^\n]*\n\[profile:2026-11-05\] Trabaja en PROBE-Atlas\.$/);
  assert.equal(withMemoryPrefix(rules, "  "), rules);
  const attached: VoiceItem = { type: "message", role: "developer", text: "MEMORIA PARA ESTE TURNO: …" };
  const first = voiceBody("m", { instructions, functions: [], webSearch: false }, [{ type: "message", role: "user", text: "hola" }]);
  const second = voiceBody("m", { instructions, functions: [], webSearch: false }, [{ type: "message", role: "user", text: "hola" }, { type: "message", role: "assistant", text: "¡Hola!" }, attached, { type: "message", role: "user", text: "¿y Ana?" }]);
  for (const body of [first, second]) {
    const input = body.input as { role?: string; content?: unknown }[];
    assert.deepEqual(input[0], { role: "developer", content: instructions });
    assert.equal(input.filter((i) => i.content === instructions).length, 1);
  }
  assert.deepEqual((second.input as { role?: string }[]).slice(-2).map((i) => i.role), ["developer", "user"], "this turn's lines come right before the wearer's words");
});

test("5.2: retrieval runs once per pause in the partials and is reused when the final words match", async () => {
  let clock: (() => void) | undefined;
  const timer: Timer = { set: (fn) => ((clock = fn), 1), clear: () => (clock = undefined) };
  const asked: string[] = [];
  const spec = new SpeculativeRecall(async (text) => (asked.push(text), { text: `lines for ${text}`, citable: new Map() }), timer);
  spec.partial("¿Qué se");
  spec.partial("¿Qué se decidió");
  spec.partial("¿Qué se decidió sobre la beta");
  assert.equal(asked.length, 0, `nothing runs before ${SPECULATE_DEBOUNCE_MS} ms of quiet`);
  clock!();
  assert.deepEqual(asked, ["¿Qué se decidió sobre la beta"]);
  assert.equal((await spec.final("¿Qué se decidió sobre la beta?"))?.text, "lines for ¿Qué se decidió sobre la beta");
  assert.equal(spec.runs, 1, "the final words matched the last partial: no second retrieval");
  spec.partial("Y el presupuesto");
  assert.equal((await spec.final("¿Y el presupuesto de marketing?"))?.text, "lines for ¿Y el presupuesto de marketing?");
  assert.equal(spec.runs, 2);
  assert.equal(clock, undefined, "the pending partial was cancelled by the final words");
});

test("5.2: a memory question gets lines and is answered in the first step; markers are never spoken, cited lines become chips", async () => {
  const found = await voiceRecall({ runtime, text: "¿Qué se decidió sobre la beta?", projects, now: set.now, timeZone: TZ });
  assert.equal(found.attach, true);
  assert.ok(found.lines.length > 0 && found.lines.length <= 6);
  const beta = found.lines.find((u) => u.text.includes("20 de noviembre"))!;
  const attached: AttachedMemory = { text: found.text, citable: new Map([...found.citable].map(([id, s]) => [id, { kind: s.kind, label: s.label, ...(s.meetingId ? { meetingId: s.meetingId } : {}) }])) };
  const { model, seen } = scripted([() => ({ text: `Se decidió abrir la beta el 20 de noviembre con 50 usuarios [[${beta.id}, inventado]]. ¿Algo más?` })]);
  const out = await turn(model, "¿Qué se decidió sobre la beta?", { attached });
  assert.equal(seen.length, 1, "one model step");
  assert.equal((seen[0]!.at(-2) as { role: string }).role, "developer");
  assert.match((seen[0]!.at(-2) as { text: string }).text, /20 de noviembre/);
  assert.deepEqual(out.spoken, ["Se decidió abrir la beta el 20 de noviembre con 50 usuarios.", "¿Algo más?"]);
  assert.ok(out.spoken.every((s) => !s.includes("[[")));
  assert.deepEqual(out.chips, [found.citable.get(beta.id)!.label]);
  assert.equal(out.result.text, "Se decidió abrir la beta el 20 de noviembre con 50 usuarios. ¿Algo más?");
  assert.equal(speakable("Hola [[a, b]]."), "Hola.");
});

test("5.2: a task request gets no memory lines, even when it names a person", async () => {
  const found = await voiceRecall({ runtime, text: "Agrega que llame a Ana el viernes", projects, now: set.now, timeZone: TZ });
  assert.equal(found.attach, false);
  assert.equal((await voiceRecall({ runtime, text: "Oye Lente, recuérdame mandar la propuesta", projects, now: set.now, timeZone: TZ })).attach, false);
});

test("5.3: ask_memory returns lines with a time and person filter; the model answers from them and cites a chip", async () => {
  const calls: unknown[] = [];
  const tools = new VoiceTools({
    ask: async () => assert.fail("the nested answer is not used when lines are available"),
    lines: async (question, projectId, filters) => {
      calls.push({ question, projectId, filters });
      const found = await voiceRecall({ runtime, text: question, ...filters, projects, now: set.now, timeZone: TZ });
      return { lines: found.text.split("\n").slice(1), citable: found.citable };
    },
    projects: async () => [],
    tasks: async () => [],
    addTask: async () => assert.fail("no task"),
    setDone: async () => false,
    remove: async () => false,
    reassign: async () => false,
    openRecordSheet: () => {},
  });
  let lineId = "";
  const { model, seen } = scripted([
    () => ({ items: [{ type: "function_call", callId: "c1", name: "ask_memory", arguments: "{}" }], calls: [{ callId: "c1", name: "ask_memory", args: { question: "¿Qué dijo sobre el presupuesto de marketing?", person: "Ana", when: "el lunes" } }] }),
    (input) => {
      const output = JSON.parse((input.at(-1) as { output: string }).output) as { lines: string[] };
      const line = output.lines.find((l) => l.includes("18,000"))!;
      lineId = /^\[([^\]]+)\]/.exec(line)![1]!;
      return { text: `Ana dijo que el presupuesto es de 18,000 dólares [[${lineId}]].` };
    },
  ]);
  const out = await turn(model, "¿Qué dijo Ana el lunes del presupuesto?", { tools: tools.handlers() });
  assert.deepEqual(calls, [{ question: "¿Qué dijo sobre el presupuesto de marketing?", projectId: undefined, filters: { when: "el lunes", person: "Ana" } }]);
  assert.equal(seen.length, 2);
  assert.deepEqual(out.spoken, ["Ana dijo que el presupuesto es de 18,000 dólares."]);
  assert.equal(out.chips.length, 1);
  assert.match(out.chips[0]!, /^PROBE-Orion marketing sync · /);
  assert.ok(lineId && !out.result.text.includes(lineId));
  void PEOPLE;
});
