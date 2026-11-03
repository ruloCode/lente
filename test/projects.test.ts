// add-projects 1.1: assignment and the per-project summary. Synthetic names only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type Project, assignMessages, cleanName, parseAssignment, sameName, summarize } from "../src/projects.ts";

const p = (id: string, name: string, status: Project["status"] = "active", createdAt = 1): Project => ({ id, name, status, createdAt });
const projects = [p("a", "Lente"), p("b", "Careways Sintético"), p("c", "Viejo", "archived")];

test("the input lists active projects as P1… and carries only the title, topic and summary", () => {
  const [system, user] = assignMessages(projects, { title: "Demo", topic: "Proyecto", notes: { summary: "Se habló del demo.", decisions: [], commitments: [], openQuestions: [] } });
  assert.match(String(system!.content), /semanas o meses/);
  assert.match(String(user!.content), /P1: Lente\nP2: Careways Sintético\n\nReunión: «Demo» \(tema: Proyecto\)\nResumen: Se habló del demo\./);
  assert.ok(!String(user!.content).includes("Viejo"), "archived projects are not offered");
  assert.match(String(assignMessages([], { title: "", notes: undefined })[1]!.content), /\(ninguno todavía\)[\s\S]*sin título[\s\S]*\(sin resumen\)/);
});

test("parsing: an existing id, an unknown id, a new name, a new name that already exists, and junk", () => {
  assert.deepEqual(parseAssignment('{"choice":"existing","project":"P2","name":""}', projects), { kind: "existing", projectId: "b" });
  assert.deepEqual(parseAssignment('{"choice":"existing","project":"P9","name":""}', projects), { kind: "none" });
  assert.deepEqual(parseAssignment('{"choice":"new","project":"","name":"  «Kuadra»  "}', projects), { kind: "new", name: "Kuadra" });
  assert.deepEqual(parseAssignment('{"choice":"new","project":"","name":"LÉNTE"}', projects), { kind: "existing", projectId: "a" });
  assert.deepEqual(parseAssignment('{"choice":"new","project":"","name":"viejo"}', projects), { kind: "existing", projectId: "c" }, "an archived name is reused, not duplicated");
  assert.deepEqual(parseAssignment('{"choice":"new","project":"","name":"   "}', projects), { kind: "none" });
  assert.deepEqual(parseAssignment('{"choice":"none","project":"","name":""}', projects), { kind: "none" });
  assert.deepEqual(parseAssignment("sin json", projects), { kind: "none" });
});

test("names: trimmed to 40 characters, compared without case or accents", () => {
  assert.equal(cleanName("x".repeat(60)).length, 40);
  assert.equal(sameName("  Café   Lente "), "cafe lente");
});

test("the summary counts meetings, this week's meetings and open tasks, names the oldest open task, and sorts by activity", () => {
  const now = Date.UTC(2026, 10, 2);
  const day = 24 * 3600 * 1000;
  const meetings = [{ id: "m1", startedAt: now - 10 * day }, { id: "m2", startedAt: now - day }, { id: "m3", startedAt: now - 2 * day }, { id: "m4", startedAt: now }];
  const assignments = new Map([["m1", "a"], ["m2", "a"], ["m3", "b"], ["m4", "c"]]);
  const tasks = [
    { title: "Grabar el demo", meetingId: "m2", done: false, createdAt: 5 },
    { title: "Escribir el README", meetingId: "m1", done: false, createdAt: 3 },
    { title: "Hecha", meetingId: "m1", done: true, createdAt: 1 },
    { title: "Otra", meetingId: "m3", done: false, createdAt: 9 },
  ];
  const out = summarize([...projects, p("d", "Vacío", "active", now - 30 * day)], assignments, meetings, tasks, now);
  assert.deepEqual(out.map((s) => s.id), ["a", "b", "d", "c"], "active by activity, archived last");
  assert.deepEqual(out[0], { id: "a", name: "Lente", status: "active", lastActivityAt: now - day, meetings: 2, meetingsThisWeek: 1, openTasks: 2, next: "Escribir el README" });
  assert.deepEqual([out[2]!.meetings, out[2]!.next, out[2]!.lastActivityAt], [0, null, now - 30 * day]);
});

test("asking within a project opens only that project's meetings (add-record-sheet 1.1)", async () => {
  const { scopeMeetings } = await import("../src/projects.ts");
  const meetings = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  const assignments = new Map([["m1", "a"], ["m3", "a"], ["m2", "b"]]);
  assert.deepEqual(scopeMeetings(meetings, assignments, "a").map((m) => m.id), ["m1", "m3"]);
  assert.deepEqual(scopeMeetings(meetings, assignments, undefined).map((m) => m.id), ["m1", "m2", "m3"]);
  assert.deepEqual(scopeMeetings(meetings, assignments, "none"), []);
});
