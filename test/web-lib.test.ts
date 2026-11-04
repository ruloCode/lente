// add-web-desktop: the web app's pure modules (web/app/lib), with synthetic data only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { actionPreview, actionTitle, editedArgs } from "../web/app/lib/actions.js";
import { BACKOFF_MAX_MS, backoffDelay } from "../web/app/lib/backoff.js";
import { askBody, askHistory } from "../web/app/lib/chat.js";
import { initialState, isCard, notificationsFor, parseEvent, reduce } from "../web/app/lib/events.js";
import { ago, clock, dayLabel, dayTime, duration, hhmm, money, startOfWeek, timeRange } from "../web/app/lib/format.js";
import { groupByDay, isImported, meetingTitle, thisWeek, topicsIn, topicTone } from "../web/app/lib/meetings.js";
import { matchRoute, meetingPath, navFor, pathFor } from "../web/app/lib/routes.js";
import { matches, normalize, searchAll } from "../web/app/lib/search.js";
import { shortcutFor } from "../web/app/lib/shortcuts.js";
import { NO_PROJECT, doneTasks, filterTasks, groupByOwner, groupByProject, nextOwner, projectNames } from "../web/app/lib/tasks.js";
import { count, deviceLabel, firstName, greeting, listeningLabel, namesLine, ownerTag } from "../web/app/lib/words.js";

const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 2, 15, 30); // Monday

test("format: times, days, durations, clocks and money in Spanish", () => {
  assert.equal(hhmm(at(2026, 11, 2, 9, 5)), "09:05");
  assert.equal(dayLabel(at(2026, 11, 2, 1), NOW), "Hoy");
  assert.equal(dayLabel(at(2026, 11, 1, 23, 59), NOW), "Ayer");
  assert.equal(dayLabel(at(2026, 10, 27), NOW), "mar 27 oct");
  assert.equal(dayLabel(at(2025, 4, 12), NOW), "sáb 12 abr 2025");
  assert.equal(dayTime(at(2026, 11, 1, 16, 37), NOW), "Ayer, 16:37");
  assert.equal(duration(30_000), "menos de 1 min");
  assert.equal(duration(12 * 60_000), "12 min");
  assert.equal(duration(65 * 60_000), "1 h 05 min");
  assert.equal(duration(120 * 60_000), "2 h");
  assert.equal(timeRange(at(2026, 11, 2, 10, 24), at(2026, 11, 2, 10, 36)), "10:24 – 10:36");
  assert.equal(timeRange(at(2026, 11, 2, 10, 24), null), "10:24");
  assert.equal(clock(247_000), "4:07");
  assert.equal(clock(3_729_000), "1:02:09");
  assert.equal(money(0.4249), "US$ 0,42");
  assert.equal(money(1234.5), "US$ 1.234,50");
  assert.equal(money(Number.NaN), "US$ 0,00");
  assert.equal(ago(NOW - 10_000, NOW), "hace un momento");
  assert.equal(ago(NOW - 5 * 60_000, NOW), "hace 5 min");
  assert.equal(ago(NOW - 3 * 3_600_000, NOW), "hace 3 h");
  assert.equal(ago(at(2026, 11, 1, 20), NOW), "ayer");
  assert.equal(ago(at(2026, 10, 29), NOW), "hace 4 días");
  assert.equal(startOfWeek(at(2026, 11, 8, 12)), at(2026, 11, 2, 0), "Sunday belongs to the week that started Monday");
});

test("words: plurals, greeting by the hour, owners, listening and device", () => {
  assert.equal(count(1, "tarea", "tareas"), "1 tarea");
  assert.equal(count(0, "tarea", "tareas"), "0 tareas");
  assert.equal(firstName("PROBE Rulo, Raúl"), "PROBE Rulo");
  assert.equal(firstName(["", " PROBE Ana ", "Anita"]), "PROBE Ana", "the hub sends a list");
  assert.equal(greeting(["PROBE Rulo"], 9), "Buenos días, PROBE Rulo");
  assert.equal(namesLine(["PROBE Rulo", "Raúl"]), "PROBE Rulo, Raúl");
  assert.equal(greeting("Ana", 8), "Buenos días, Ana");
  assert.equal(greeting("", 15), "Buenas tardes");
  assert.equal(greeting(undefined, 21), "Buenas noches");
  assert.equal(ownerTag({ who: "other", otherName: "PROBE Ana" }), "PROBE Ana");
  assert.equal(ownerTag({ who: "lente" }), "Lente");
  assert.equal(ownerTag({}), "Tú");
  assert.equal(listeningLabel({ listening: true, assistMode: "record" }), "Grabando");
  assert.equal(listeningLabel({ listening: false, pause: { reason: "idle" } }), "En pausa (sin voz)");
  assert.equal(listeningLabel(null), "Conectando…");
  assert.equal(deviceLabel({ clip: true, device: "phone" }), "Teléfono");
  assert.equal(deviceLabel({ clip: false }), "Sin dispositivo");
});

test("backoff: 1, 2, 4… seconds up to 30", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(backoffDelay(500), BACKOFF_MAX_MS);
  assert.equal(backoffDelay(-1), 1000);
});

test("routes: each screen, detail ids, unknown paths go home, paths round-trip", () => {
  assert.deepEqual(matchRoute("/app"), { name: "home", params: {} });
  assert.deepEqual(matchRoute("/app/"), { name: "home", params: {} });
  assert.deepEqual(matchRoute("/app/tareas"), { name: "tasks", params: {} });
  assert.deepEqual(matchRoute("/app/reuniones/hermes-2026-10-01?turno=t3"), { name: "meeting", params: { id: "hermes-2026-10-01" } });
  assert.deepEqual(matchRoute("/app/proyectos/p%201"), { name: "project", params: { id: "p 1" } });
  assert.deepEqual(matchRoute("/app/nada/aqui"), { name: "home", params: {} });
  for (const name of ["home", "tasks", "projects", "meetings", "memory", "today", "apps", "devices", "settings"]) assert.equal(matchRoute(pathFor(name)).name, name);
  assert.equal(pathFor("meeting", { id: "m 1" }), "/app/reuniones/m%201");
  assert.equal(meetingPath("m1", "t5"), "/app/reuniones/m1?turno=t5");
  assert.equal(navFor("meeting"), "meetings");
  assert.equal(navFor("project"), "projects");
  // add-lens-apps 3.1: the catalog and an app's page light «Apps».
  assert.deepEqual(matchRoute("/app/apps"), { name: "apps", params: {} });
  assert.deepEqual(matchRoute("/app/apps/ver"), { name: "app", params: { id: "ver" } });
  assert.equal(pathFor("app", { id: "idiomas" }), "/app/apps/idiomas");
  assert.equal(navFor("app"), "apps");
});

test("events: the connect snapshot, live turns, cards, speakers, meetings, actions and unknown kinds", () => {
  let s = initialState();
  const apply = (e: object) => {
    const out = reduce(s, e);
    s = out.state;
    return out.changed;
  };
  assert.equal(parseEvent("not json"), null);
  assert.equal(parseEvent('{"x":1}'), null);
  assert.deepEqual(parseEvent('{"kind":"level","rms":3}'), { kind: "level", rms: 3 });

  assert.deepEqual(apply({ kind: "status", listening: true, clip: true }), ["status"]);
  assert.equal(s.status.listening, true);
  apply({ kind: "history", items: [{ at: 1, kind: "turn", text: "PROBE uno", turnId: "7" }, { at: 2, kind: "cue", label: "DILO", text: "PROBE line" }] });
  assert.equal(s.entries.length, 2);
  assert.equal(s.cue.text, "PROBE line", "the last card of the snapshot");
  apply({ kind: "partial", text: "PROBE med" });
  assert.equal(s.partial, "PROBE med");
  assert.deepEqual(apply({ kind: "turn", at: 3, text: "PROBE dos" }), ["entries", "partial"]);
  assert.equal(s.partial, "", "a completed turn clears the partial");
  apply({ kind: "speaker", turnId: 7, speaker: "B" });
  assert.equal(s.entries[0].speaker, "B");
  assert.deepEqual(apply({ kind: "cue", label: "PHOTO", text: "x", photo: "data:image/jpeg;base64,AA" }), ["frame"]);
  assert.equal(s.entries.length, 3, "a photo is not a day entry");
  apply({ kind: "cue", label: "ON SCREEN", text: "PROBE slide" });
  assert.equal(s.cue.text, "PROBE line", "what the camera read is not a card");
  apply({ kind: "meetings", items: [{ id: "m1", startedAt: 1 }], language: { glossary: [{ term: "PROBE" }], asked: 3, answered: 2 } });
  assert.deepEqual([s.meetings.length, s.glossary.length, s.asked, s.loaded.meetings], [1, 1, 3, true]);
  apply({ kind: "actions", pending: [{ id: "a1" }], decided: [], tasks: [{ id: "t1", title: "PROBE" }] });
  assert.deepEqual([s.pending.length, s.tasks.length, s.loaded.actions], [1, 1, true]);
  apply({ kind: "spend", usd: 0.1, seconds: 9 });
  assert.equal(s.spend.usd, 0.1);
  apply({ kind: "recorded", ms: 5000 });
  assert.equal(s.recorded, 5000);
  assert.deepEqual(apply({ kind: "status", listening: false }), ["status"], "no partial to drop");
  assert.deepEqual(apply({ kind: "whatever" }), []);
});

test("events: a status that stops listening drops the partial", () => {
  let { state } = reduce(initialState(), { kind: "status", listening: true });
  ({ state } = reduce(state, { kind: "partial", text: "PROBE" }));
  const out = reduce(state, { kind: "status", listening: false });
  assert.equal(out.state.partial, "");
  assert.deepEqual(out.changed, ["status", "partial"]);
});

test("notifications: DILO and Lente cards, and actions that just started waiting; nothing on the first snapshot", () => {
  const s = initialState();
  assert.deepEqual(notificationsFor(s, { kind: "cue", label: "DILO", text: "PROBE say this", at: 5 }), [{ tag: "cue-5", title: "Dilo", body: "PROBE say this" }]);
  assert.equal(notificationsFor(s, { kind: "cue", label: "ON SCREEN", text: "x" }).length, 0);
  assert.equal(notificationsFor(s, { kind: "turn", text: "x" }).length, 0);
  assert.equal(notificationsFor(s, { kind: "actions", pending: [{ id: "a1", tool: "create_task", args: { title: "PROBE" } }] }).length, 0, "the snapshot on connect is not news");
  const loaded = reduce(s, { kind: "actions", pending: [{ id: "a1" }], tasks: [] }).state;
  assert.deepEqual(notificationsFor(loaded, { kind: "actions", pending: [{ id: "a1" }, { id: "a2", tool: "create_task", args: { title: "PROBE tarea" } }] }), [{ tag: "action-a2", title: "Por aprobar", body: "Tarea: PROBE tarea" }]);
  assert.ok(isCard({ kind: "cue", label: "Aportar", text: "x" }));
});

test("actions: titles, previews and edits for the closing agent's tools", () => {
  const email = { tool: "draft_email", args: { to: ["PROBE Ana"], subject: "PROBE next steps", body: "Hi" } };
  assert.equal(actionTitle(email), "Correo: PROBE next steps");
  assert.deepEqual(actionPreview(email), { kind: "email", fields: [{ label: "Para", value: "PROBE Ana" }, { label: "Asunto", value: "PROBE next steps" }], body: "Hi", editable: ["subject", "body"] });
  assert.equal(actionTitle({ tool: "create_reminder", args: { title: "PROBE", date: "2026-11-05" } }), "Recordatorio: PROBE · 2026-11-05");
  assert.equal(actionPreview({ tool: "create_task", args: { title: "PROBE", due: "viernes" } }).fields[1]!.value, "viernes");
  assert.deepEqual(editedArgs({ subject: "a", body: "b" }, { subject: "  ", body: "c" }), { subject: "a", body: "c" });
  assert.equal(actionPreview({ tool: "mystery", args: { n: 1 } }).kind, "other");
});

const tasks = [
  { id: "1", title: "PROBE a", who: "me", projectName: "PROBE Alfa", createdAt: 1 },
  { id: "2", title: "PROBE b", who: "lente", projectName: "PROBE Beta", createdAt: 2 },
  { id: "3", title: "PROBE c", who: "other", otherName: "Ana", createdAt: 3 },
  { id: "4", title: "PROBE d", createdAt: 4 },
  { id: "5", title: "PROBE e", who: "me", done: true, projectName: "PROBE Alfa", createdAt: 5 },
];

test("tasks: by owner, by project, filters, done and the owner cycle", () => {
  assert.deepEqual(groupByOwner(tasks).map((g) => [g.label, g.tasks.map((t) => t.id)]), [["Te toca", ["4", "1"]], ["Lente puede hacerlo", ["2"]], ["Esperando a otros", ["3"]]]);
  assert.deepEqual(groupByProject(tasks).map((g) => [g.label, g.tasks.map((t) => t.id)]), [["PROBE Beta", ["2"]], ["PROBE Alfa", ["1"]], [NO_PROJECT, ["4", "3"]]]);
  assert.deepEqual(filterTasks(tasks, { project: "PROBE Alfa" }).map((t) => t.id), ["1", "5"]);
  assert.deepEqual(filterTasks(tasks, { owner: "me" }).map((t) => t.id), ["1", "4", "5"], "old tasks without who are the wearer's");
  assert.deepEqual(filterTasks(tasks, { project: NO_PROJECT, owner: "other" }).map((t) => t.id), ["3"]);
  assert.deepEqual(projectNames(tasks), ["PROBE Alfa", "PROBE Beta", NO_PROJECT]);
  assert.deepEqual(doneTasks(tasks).map((t) => t.id), ["5"]);
  assert.deepEqual([nextOwner("me"), nextOwner("lente"), nextOwner("other"), nextOwner(undefined)], ["lente", "other", "me", "lente"]);
});

test("meetings: grouped by day newest first, imported mark, titles, this week, topics", () => {
  const ms = [
    { id: "m1", title: "PROBE uno", startedAt: at(2026, 11, 2, 10), topic: "Cliente" },
    { id: "m2", startedAt: at(2026, 11, 1, 16), topic: "Equipo" },
    { id: "hermes-2026-10-20-x", title: "PROBE viejo", startedAt: at(2026, 10, 20, 9) },
    { id: "m3", title: "PROBE dos", startedAt: at(2026, 11, 2, 14) },
  ];
  assert.deepEqual(groupByDay(ms, NOW).map((g) => [g.label, g.items.map((m) => m.id)]), [["Hoy", ["m3", "m1"]], ["Ayer", ["m2"]], ["mar 20 oct", ["hermes-2026-10-20-x"]]]);
  assert.ok(isImported(ms[2]!) && !isImported(ms[0]!));
  assert.equal(meetingTitle(ms[1]!), "Equipo");
  assert.equal(meetingTitle({ id: "x", startedAt: 0, auto: true }), "Grabación");
  assert.deepEqual(thisWeek(ms, NOW).map((m) => m.id), ["m1", "m3"]);
  assert.deepEqual(topicsIn(ms), ["Cliente", "Equipo"]);
  assert.equal(topicTone("Cliente"), "client");
  assert.equal(topicTone("Otro"), "neutral");
});

test("search: accents and case ignored, projects then meetings then tasks", () => {
  assert.equal(normalize("  Reunión   QA "), "reunion qa");
  assert.ok(matches("Planificación del sprint", "planificacion SPRINT"));
  assert.ok(!matches("Planificación", "sprint"));
  const out = searchAll("probe", {
    projects: [{ id: "p1", name: "PROBE Proyecto" }],
    meetings: [{ id: "m1", title: "PROBE vieja", startedAt: 1 }, { id: "m2", title: "PROBE nueva", startedAt: 2 }],
    tasks: [{ id: "t1", title: "PROBE tarea", projectName: "X" }, { id: "t2", title: "PROBE hecha", done: true }],
  });
  assert.deepEqual(out.map((r) => [r.kind, r.id]), [["project", "p1"], ["meeting", "m2"], ["meeting", "m1"], ["task", "t1"]]);
  assert.equal(out[1]!.href, "/app/reuniones/m2");
  assert.deepEqual(searchAll("   ", { meetings: [{ id: "m", title: "x", startedAt: 1 }] }), []);
});

test("shortcuts: ⌘ or Ctrl with K and J, R and ? only outside fields, Esc always", () => {
  assert.equal(shortcutFor({ key: "k", metaKey: true }), "search");
  assert.equal(shortcutFor({ key: "K", ctrlKey: true, inField: true }), "search");
  assert.equal(shortcutFor({ key: "j", metaKey: true }), "chat");
  assert.equal(shortcutFor({ key: "r" }), "record");
  assert.equal(shortcutFor({ key: "r", inField: true }), null);
  assert.equal(shortcutFor({ key: "r", metaKey: true }), null, "⌘R reloads, as the browser does");
  assert.equal(shortcutFor({ key: "?" }), "help");
  assert.equal(shortcutFor({ key: "Escape", inField: true }), "close");
  assert.equal(shortcutFor({ key: "x" }), null);
});

test("chat: history without pending or failed messages, the project only when chosen", () => {
  const messages = [
    { role: "user" as const, text: "PROBE q1" },
    { role: "lente" as const, text: "PROBE a1" },
    { role: "lente" as const, text: "No pude", error: true },
    { role: "user" as const, text: "PROBE q2", pending: true },
  ];
  assert.deepEqual(askHistory(messages), [{ role: "user", text: "PROBE q1" }, { role: "lente", text: "PROBE a1" }]);
  assert.deepEqual(askBody("  PROBE q2 ", messages, null), { question: "PROBE q2", history: askHistory(messages) });
  assert.equal(askBody("x", [], "p1").project, "p1");
  assert.equal(askHistory(Array.from({ length: 20 }, (_, i) => ({ role: "user" as const, text: String(i) }))).length, 8);
});
