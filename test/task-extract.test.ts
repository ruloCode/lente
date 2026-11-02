// add-task-owners 1.1: extracting tasks with owners from a meeting's notes. Synthetic text only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerOf } from "../src/agent-tools.ts";
import { MAX_TASKS_PER_MEETING, parseTasks, tasksMessages } from "../src/task-extract.ts";

test("the input carries the title, summary, decisions and commitments with their owners", () => {
  const [system, user] = tasksMessages({
    title: "Kickoff sintético",
    notes: { summary: "Se acordó la cotización.", decisions: [{ text: "Lanzar el viernes", evidence: [] }], commitments: [{ what: "Enviar la cotización", owner: "you", due: "viernes", evidence: [] }, { what: "Revisar el contrato", owner: "Ana", evidence: [] }], openQuestions: [] },
  });
  assert.match(String(system!.content), /redactar un correo, poner un recordatorio o preparar un resumen/);
  assert.equal(String(user!.content), "Reunión: «Kickoff sintético»\nResumen: Se acordó la cotización.\nDecisión: Lanzar el viernes\nCompromiso de el usuario: Enviar la cotización (para viernes)\nCompromiso de Ana: Revisar el contrato");
  assert.match(String(tasksMessages({ title: "", notes: undefined })[1]!.content), /sin título[\s\S]*\(sin resumen\)/);
});

test("parsing keeps owners, names who promised, drops repeats and empties, caps at eight", () => {
  const raw = JSON.stringify({
    tasks: [
      { title: "  Enviar   la cotización ", who: "me", other: "", due: "viernes" },
      { title: "Redactar el correo de seguimiento", who: "lente", other: "", due: "" },
      { title: "Revisar el contrato", who: "other", other: "Ana", due: "" },
      { title: "enviar la COTIZACIÓN", who: "me", other: "", due: "" },
      { title: "", who: "me", other: "", due: "" },
      { title: "Algo raro", who: "jefe", other: "", due: "" },
    ],
  });
  assert.deepEqual(parseTasks(raw), [
    { title: "Enviar la cotización", who: "me", due: "viernes" },
    { title: "Redactar el correo de seguimiento", who: "lente" },
    { title: "Revisar el contrato", who: "other", otherName: "Ana" },
    { title: "Algo raro", who: "me" },
  ]);
  assert.deepEqual(parseTasks(raw, [{ title: "Enviar la cotizacion" }]).map((t) => t.title), ["Redactar el correo de seguimiento", "Revisar el contrato", "Algo raro"], "a task the meeting already has is not repeated");
  const many = JSON.stringify({ tasks: Array.from({ length: 12 }, (_, i) => ({ title: `Tarea ${i}`, who: "me", other: "", due: "" })) });
  assert.equal(parseTasks(many).length, MAX_TASKS_PER_MEETING);
  assert.equal(parseTasks(JSON.stringify({ tasks: [{ title: "x".repeat(200), who: "me", other: "", due: "" }] }))[0]!.title.length, 140);
  assert.deepEqual(parseTasks("sin json"), []);
});

test("the wearer's names go first, so a task about them done by someone else is not theirs", () => {
  const user = String(tasksMessages({ title: "x", notes: undefined }, ["Rulo", "Andrés"])[1]!.content);
  assert.match(user, /^El usuario se llama Rulo o Andrés\. Lo que otra persona hará por él o con él \(por ejemplo, «incluir a Rulo»\) es `other`, no `me`\.\nReunión: «x»/);
  assert.ok(!String(tasksMessages({ title: "x", notes: undefined })[1]!.content).includes("se llama"));
});

test("tasks stored before owners existed are the wearer's", () => {
  assert.equal(ownerOf({}), "me");
  assert.equal(ownerOf({ who: "lente" }), "lente");
});

test("task stores: update who and title, drop the other name when it no longer applies, and remove (file and Supabase)", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { TaskStore } = await import("../src/agent-tools.ts");
  const { newDek } = await import("../src/seal.ts");
  const { openUserStores } = await import("../src/supabase-stores.ts");
  const { fakePostgrest } = await import("./fake-postgrest.ts");
  const fake = fakePostgrest();
  const sealed = await openUserStores(fake.rest, "aaaaaaaa-0000-4000-8000-000000000001", newDek());
  for (const store of [new TaskStore(join(mkdtempSync(join(tmpdir(), "lente-tasks-")), "tasks.json")), sealed.tasks]) {
    const t = await store.add({ title: "PROBE-TASK revisar", who: "other", otherName: "Ana", meetingId: "", evidence: [] }, 1000);
    const mine = await store.update(t.id, { who: "me" });
    assert.equal(mine?.who, "me");
    assert.equal(mine?.otherName, undefined, "the other person's name goes with the owner");
    assert.equal((await store.update(t.id, { title: "PROBE-TASK revisar el contrato" }))?.title, "PROBE-TASK revisar el contrato");
    assert.deepEqual((await store.list()).map((x) => [x.title, x.who]), [["PROBE-TASK revisar el contrato", "me"]]);
    assert.equal(await store.update("nope", { who: "me" }), undefined);
    assert.equal(await store.remove(t.id), true);
    assert.equal(await store.remove(t.id), false);
    assert.deepEqual(await store.list(), []);
  }
  assert.ok(!fake.dump().includes("PROBE-TASK"), "owners and titles stay sealed");
});
