// add-voice-mode 1.2: the voice tools over a fake backend. Synthetic names only.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../src/agent-tools.ts";
import { MAX_LISTED_TASKS, type VoiceBackend, type VoiceTask, VoiceTools } from "../src/voice-tools.ts";

function backend() {
  const tasks: VoiceTask[] = [
    { id: "uuid-a", title: "PROBE Enviar la cotización", who: "me", meetingId: "m1", evidence: [], done: false, createdAt: 1, projectIdResolved: "proj-a" },
    { id: "uuid-b", title: "PROBE Revisar el contrato", who: "other", otherName: "Ana", meetingId: "m2", evidence: [], done: false, createdAt: 2 },
    { id: "uuid-c", title: "PROBE Ya hecha", who: "me", meetingId: "", evidence: [], done: true, createdAt: 3 },
  ];
  const calls: string[] = [];
  const sheets: unknown[] = [];
  const b: VoiceBackend = {
    ask: async (q, p) => (calls.push(`ask:${q}:${p ?? ""}`), { ok: true, answer: "PROBE respuesta", found: true, sources: [{ id: "m1.t3", kind: "meeting", label: "PROBE Reunión · 10:00", at: 0, meetingId: "m1", turnId: "t3" }] }),
    projects: async () => [{ id: "proj-a", name: "PROBE Alfa", openTasks: 1 }, { id: "proj-b", name: "PROBE Beta", openTasks: 0 }],
    tasks: async () => tasks,
    addTask: async (t) => {
      const task: Task = { ...t, id: `uuid-${tasks.length + 1}`, meetingId: "", evidence: [], done: false, createdAt: 9 };
      tasks.push({ ...task, projectIdResolved: t.projectId });
      calls.push(`add:${JSON.stringify(t)}`);
      return task;
    },
    setDone: async (id) => (calls.push(`done:${id}`), true),
    remove: async (id) => (calls.push(`remove:${id}`), true),
    reassign: async (id, who, other) => (calls.push(`reassign:${id}:${who}:${other ?? ""}`), true),
    openRecordSheet: (c) => void sheets.push(c),
  };
  return { b, tasks, calls, sheets };
}

test("tasks reach the model with short ids, filtered by owner and project; done ones are left out", async () => {
  const { b } = backend();
  const tools = new VoiceTools(b);
  const h = tools.handlers();
  await tools.projectRefs();
  const all = (await h.list_tasks({})).result as any;
  assert.equal(all.total, 2);
  assert.deepEqual(all.tasks.map((t: any) => [t.id, t.title, t.who]), [["t1", "PROBE Enviar la cotización", "me"], ["t2", "PROBE Revisar el contrato", "other"]]);
  assert.equal(all.tasks[0].project, "PROBE Alfa");
  assert.equal(((await h.list_tasks({ who: "other" })).result as any).tasks[0].other, "Ana");
  assert.equal(((await h.list_tasks({ project: "p1" })).result as any).total, 1);
  assert.equal(((await h.list_tasks({ project: "PROBE Beta" })).result as any).total, 0, "a project name works as well as its id");
  assert.ok(MAX_LISTED_TASKS >= 10);
});

test("adding a task keeps the owner, the due hint and the project; a bad owner becomes the wearer's", async () => {
  const { b, calls } = backend();
  const h = new VoiceTools(b).handlers();
  const out = await h.add_task({ title: "  Llamar a Ana  ", who: "me", due: "viernes", project: "p2" });
  assert.equal(calls.at(-1), `add:${JSON.stringify({ title: "Llamar a Ana", who: "me", due: "viernes", projectId: "proj-b", source: "manual" })}`, "short ids follow the backend's order");
  assert.equal((out.result as any).id, "t1", "the first task this conversation shows");
  await h.add_task({ title: "PROBE x", who: "boss", project: "p2" });
  assert.match(calls.at(-1)!, /"who":"me".*"projectId":"proj-b"/);
  assert.match(String(((await h.add_task({ title: " " })).result as any).error), /empty/);
});

test("completing and deleting only ask; the next yes runs it, a no leaves it", async () => {
  const { b, calls } = backend();
  const tools = new VoiceTools(b);
  const h = tools.handlers();
  await h.list_tasks({});
  const ask = await h.complete_task({ id: "t1" });
  assert.deepEqual(ask.result, { needsConfirmation: true, ask: "¿Marco como hecha «PROBE Enviar la cotización»?" });
  assert.ok(!calls.some((c) => c.startsWith("done:")), "nothing done before the yes");
  assert.equal(await tools.confirmPending(), "Listo, marqué «PROBE Enviar la cotización» como hecha.");
  assert.ok(calls.includes("done:uuid-a"));
  await h.delete_task({ id: "t2" });
  assert.equal(tools.cancelPending(), "De acuerdo, dejo «PROBE Revisar el contrato» como está.");
  assert.ok(!calls.some((c) => c.startsWith("remove:")));
  assert.equal(tools.pending, undefined);
});

test("only ids this conversation showed are accepted", async () => {
  const { b, calls } = backend();
  const h = new VoiceTools(b).handlers();
  for (const tool of ["complete_task", "delete_task", "reassign_task"]) {
    const out = await h[tool]({ id: "uuid-a", who: "me" });
    assert.match(String((out.result as any).error), /call list_tasks/, tool);
  }
  await h.list_tasks({});
  await h.reassign_task({ id: "t2", who: "lente" });
  assert.equal(calls.at(-1), "reassign:uuid-b:lente:");
  assert.match(String(((await h.reassign_task({ id: "t2", who: "boss" })).result as any).error), /who must be/);
});

test("ask_memory passes the project and returns chips; start_recording opens the sheet; delegate leaves a task for Lente", async () => {
  const { b, calls, sheets, tasks } = backend();
  const tools = new VoiceTools(b);
  const h = tools.handlers();
  await tools.projectRefs();
  const answer = await h.ask_memory({ question: "¿Qué se decidió?", project: "p1" });
  assert.equal(calls[0], "ask:¿Qué se decidió?:proj-a");
  assert.deepEqual(answer.sources, [{ kind: "meeting", label: "PROBE Reunión · 10:00", meetingId: "m1", turnId: "t3" }]);
  await h.start_recording({ project: "p2", camera: true });
  assert.deepEqual(sheets, [{ projectId: "proj-b", projectName: "PROBE Beta", camera: true }]);
  const before = tasks.length;
  const d = await h.delegate({ instruction: "Preparar el resumen para el cliente", agent: "Hermes" });
  assert.equal(tasks.length, before + 1);
  assert.deepEqual([tasks.at(-1)!.title, tasks.at(-1)!.who, tasks.at(-1)!.source], ["Preparar el resumen para el cliente (para Hermes)", "lente", "agent"]);
  assert.match(JSON.stringify(d.result), /nothing has run/);
  assert.ok(!calls.some((c) => c.startsWith("done:") || c.startsWith("remove:")), "delegating runs nothing");
});

test("look: describe and read reach the backend; no camera on the hub is an error the agent can say", async () => {
  const { b } = backend();
  const seen: string[] = [];
  b.look = async (q, mode) => (seen.push(`${mode}:${q}`), { ok: true, text: "PROBE una taza azul" });
  const h = new VoiceTools(b).handlers();
  const out = await h.look({ question: "¿qué tengo en la mano?" });
  assert.deepEqual(out.result, { ok: true, seen: "PROBE una taza azul" });
  assert.equal(out.label, "Mirando por la cámara");
  await h.look({ question: "léeme este papel", mode: "read" });
  assert.deepEqual(seen, ["describe:¿qué tengo en la mano?", "read:léeme este papel"]);
  b.look = async () => ({ ok: false, text: "No hay cámara conectada." });
  assert.deepEqual((await h.look({ question: "¿qué ves?" })).result, { error: "No hay cámara conectada." });
  delete b.look;
  assert.deepEqual((await new VoiceTools(b).handlers().look({ question: "¿qué ves?" })).result, { error: "no camera on this hub" });
});

test("Ver's companion tools: remember the person, turn narration on and off", async () => {
  const { b } = backend();
  const met: unknown[] = [];
  const narration: boolean[] = [];
  b.rememberPerson = (p) => void met.push(p);
  b.setNarration = (on) => void narration.push(on);
  const h = new VoiceTools(b).handlers();
  const r = await h.remember_person({ name: " PROBE Ana ", age: "40", wants: "leer cartas" });
  assert.deepEqual(met, [{ name: "PROBE Ana", age: "40", wants: "leer cartas" }]);
  assert.equal(r.label, "Ya te conozco, PROBE Ana");
  assert.deepEqual((await h.remember_person({ name: "" })).result, { error: "name is empty" });
  await h.narrate({ on: true });
  await h.narrate({ on: false });
  assert.deepEqual(narration, [true, false]);
});

test("where am I: the phone's address goes to the model; a refusal is said; quiet mode reaches the hub", async () => {
  const { b } = backend();
  b.locate = async () => ({ ok: true, address: "PROBE Calle 1 # 2-3, PROBE Barrio, Bogotá", place: "PROBE Parque", accuracy: 12.4 });
  const h = new VoiceTools(b).handlers();
  assert.deepEqual((await h.where_am_i({})).result, { ok: true, address: "PROBE Calle 1 # 2-3, PROBE Barrio, Bogotá", place: "PROBE Parque", accuracy_m: 12 });
  b.locate = async () => ({ ok: false, reason: "sin permiso de ubicación" });
  assert.deepEqual((await h.where_am_i({})).result, { error: "sin permiso de ubicación" });
  const quiet: boolean[] = [];
  b.setQuiet = (on) => void quiet.push(on);
  assert.equal((await h.quiet_mode({ on: true })).label, "Grabando en silencio");
  await h.quiet_mode({ on: false });
  assert.deepEqual(quiet, [true, false]);
});
