// add-memory-engine 3.2 and 3.3 (and the segments of 6.1): question parsing, records as units,
// retrieval with hard filters, the prompt in cache order within budget, and the streaming parser on
// chunked fake streams: a marker split across deltas, made-up ids, a command, «@none», a cut reply.

import assert from "node:assert/strict";
import { test } from "node:test";
import { NOT_FOUND } from "../src/ask.ts";
import { SEGMENT_MAX_MS, segmentTurns } from "../src/consolidate.ts";
import { MemoryIndex } from "../src/memory-index.ts";
import { RECALL_RULES, RecallStream, dayUnits, meetingUnits, memoryPrefix, parseQuestion, recallMessages, retrieve, sourceOf } from "../src/recall.ts";
import { memorySet, PEOPLE, PROJECTS } from "../scripts/eval/memory-set.ts";

const TZ = "America/Bogota";
const set = memorySet({ days: 14 });
const NOW = set.now;
const ctx = { now: NOW, timeZone: TZ, people: Object.values(PEOPLE), projects: PROJECTS.map((p) => ({ id: p.id, name: p.name })) };

function indexOf(): MemoryIndex {
  const idx = new MemoryIndex();
  for (const m of set.meetings) for (const u of meetingUnits(m, set.assignments.get(m.id))) idx.add(u);
  const spans = set.meetings.map((m) => ({ startedAt: m.startedAt, endedAt: m.endedAt, projectId: set.assignments.get(m.id) }));
  for (const d of set.days) for (const u of dayUnits(d, set.entriesOn(d), spans, NOW)) idx.add(u);
  return idx;
}

test("segments close on a pause, on a new speaker after 20 s and at 40 s", () => {
  const T = 1_000_000;
  const turn = (id: string, s: number, speaker = "A") => ({ id, at: T + s * 1000 + 2000, startAt: T + s * 1000, speaker, text: id });
  // a, b; a 9 s pause; c to h run 21 s with A and B; then C joins: a new segment.
  const segs = segmentTurns([turn("a", 0), turn("b", 3), turn("c", 14), turn("d", 17, "B"), turn("e", 21, "B"), turn("f", 25, "B"), turn("g", 29, "B"), turn("h", 33, "B"), turn("i", 36, "C")]);
  assert.deepEqual(segs.map((s) => s.turns.map((t) => t.id).join("")), ["ab", "cdefgh", "i"]);
  assert.deepEqual(segs[1]!.speakers, ["A", "B"]);
  const long = segmentTurns(Array.from({ length: 12 }, (_, i) => turn(`t${i}`, i * 5)));
  assert.ok(long.every((s) => s.to - s.from <= SEGMENT_MAX_MS));
});

test("parsing: terms, time, people by partial name, a named project and aggregate intent", () => {
  const q = parseQuestion("¿Qué dijo Ana el martes sobre el presupuesto?", ctx);
  assert.deepEqual(q.terms, ["ana", "presupuesto"]);
  assert.deepEqual(q.people, ["probe-ana ruiz"]);
  assert.ok(q.range && q.range.from < NOW);
  assert.equal(q.aggregate, false);
  assert.equal(parseQuestion("¿Qué pasó en Atlas?", ctx).project, "p-atlas");
  assert.equal(parseQuestion("Resume todo lo que hablé con Ana este mes", ctx).aggregate, true);
  assert.equal(parseQuestion("summarize everything about pricing", ctx).aggregate, true);
  assert.deepEqual(parseQuestion("¿Qué dijo Lucia?", ctx).people, ["probe-lucia paredes"]);
});

test("records become units: segments with their turns, notes, moments; chips open the right place", () => {
  const m = set.meetings.find((x) => x.title === "PROBE-Orion marketing sync")!;
  const units = meetingUnits(m, "p-orion");
  assert.equal(units[0]!.id, m.id);
  assert.equal(units[0]!.kind, "notes");
  const seg = units.find((u) => u.text.includes("18,000"))!;
  assert.match(seg.id, new RegExp(`^s${m.id}:\\d+$`));
  assert.match(seg.refs!, new RegExp(`^${m.id}:t\\d+–t\\d+$`));
  const chip = sourceOf(seg, TZ);
  assert.equal(chip.kind, "meeting");
  assert.equal(chip.meetingId, m.id);
  assert.match(chip.label, /^PROBE-Orion marketing sync · \d\d:\d\d$/);
  const day = set.days.at(-2)!;
  const du = dayUnits(day, set.entriesOn(day), [], NOW);
  assert.ok(du.some((u) => u.kind === "seen" && u.id.startsWith(`d${day}:`)));
  assert.equal(sourceOf(du.find((u) => u.kind === "segment")!, TZ).kind, "heard");
});

test("retrieval finds the concrete line, keeps a project's lines inside it, and reads a time range", () => {
  const idx = indexOf();
  const q = parseQuestion("¿Qué dijo Ana sobre el presupuesto de marketing?", ctx);
  const r = retrieve(idx, q, { now: NOW, budget: 24_000 });
  assert.ok(r.lines.some((u) => u.text.includes("18,000 dollars")));
  assert.equal(r.confident, true);
  const scoped = retrieve(idx, parseQuestion("¿A quién entrevistamos para diseño?", ctx), { now: NOW, budget: 24_000, projectId: "p-atlas" });
  assert.ok(scoped.lines.every((u) => u.projectId === "p-atlas"));
  assert.ok(!scoped.lines.some((u) => /Luc[ií]a|Orion/.test(u.text)));
  const whole = retrieve(idx, parseQuestion("¿A quién entrevistamos para diseño?", ctx), { now: NOW, budget: 24_000 });
  assert.ok(whole.lines.some((u) => u.text.includes("PROBE-Lucía")));
  const yesterday = retrieve(idx, parseQuestion("¿Qué pasó ayer?", ctx), { now: NOW, budget: 24_000 });
  assert.ok(yesterday.lines.length > 0 && yesterday.lines.every((u) => (u.to ?? u.at) >= yesterday.lines[0]!.at - 86_400_000));
  const small = retrieve(idx, q, { now: NOW, budget: 600 });
  assert.ok(small.lines.reduce((n, u) => n + u.text.length + 60, 0) <= 600);
});

test("the prompt: static rules first, then the memory prefix, then RECUPERADO, history and the question last", () => {
  const prefix = memoryPrefix([{ id: "day:2026-11-04", kind: "digest", at: NOW, text: "Día de PROBE." }], TZ);
  const msgs = recallMessages({ prefix: prefix.text, lines: [{ id: "s1:1", kind: "segment", at: NOW - 3600_000, title: "PROBE-T", text: "A: hola" }], history: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "lente" : "user", text: `m${i}` })), question: "¿Y?", now: NOW, timeZone: TZ });
  assert.equal(msgs[0]!.content, RECALL_RULES);
  assert.equal(msgs[0]!.role, "developer");
  assert.match(String(msgs[1]!.content), /^MEMORIA:\n\[day:2026-11-04\] Día de PROBE\./);
  assert.match(String(msgs[2]!.content), /RECUPERADO:\n\[s1:1\] 2026-11-05 14:00 en «PROBE-T»: A: hola/);
  assert.equal(msgs.length, 3 + 8 + 1);
  assert.equal(msgs.at(-1)!.content, "¿Y?");
});

const SOURCES = new Map([
  ["s1:4", { id: "s1:4", kind: "meeting" as const, label: "Marketing · 10:03", at: 1, meetingId: "m1", turnId: "t7" }],
  ["d2026-11-04:1", { id: "d2026-11-04:1", kind: "seen" as const, label: "Lo viste · 09:00", at: 2 }],
]);
const run = (chunks: string[], cut = false) => {
  const p = new RecallStream(SOURCES);
  const events = chunks.flatMap((c) => p.push(c));
  const end = p.finish(cut);
  return { events: [...events, ...end.events], end, text: [...events, ...end.events].filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("") };
};

test("stream: text flows without markers, a marker split in two deltas becomes one chip, unknown ids vanish", () => {
  const { events, end, text } = run(["@ans", "wer\nAna dijo 18", ",000 dólares [", "[s1:", "4]] y lo vio en la pizarra [[d2026-11-04:1, inventado]]."]);
  assert.equal(text, "Ana dijo 18,000 dólares y lo vio en la pizarra.");
  assert.deepEqual(events.filter((e) => e.type === "source").map((e) => (e as { source: { id: string } }).source.id), ["s1:4", "d2026-11-04:1"]);
  assert.equal(end.found, true);
  assert.equal(end.answer, text);
  assert.equal(end.replace, undefined);
  // The chip arrives before the text after the marker.
  const firstSource = events.findIndex((e) => e.type === "source");
  assert.ok(firstSource > 0 && firstSource < events.length - 1);
});

test("stream: only made-up ids → replaced by not found; small talk without ids is kept", () => {
  const made = run(["@answer\nEl lanzamiento es el 3 [[s9:9]]."]);
  assert.equal(made.end.replace, NOT_FOUND);
  assert.equal(made.end.found, false);
  assert.deepEqual(made.end.sources, []);
  const hello = run(["@answer\n", "¡Hola! Puedo buscar en lo que viviste."]);
  assert.equal(hello.end.found, true);
  assert.equal(hello.text, "¡Hola! Puedo buscar en lo que viviste.");
});

test("stream: «@none» is not found; «@command» is a job, never shown as text; a cut reply ends in «…»", () => {
  const none = run(["@no", "ne"]);
  assert.equal(none.end.answer, NOT_FOUND);
  assert.equal(none.text, "");
  const cmd = run(["@command\n{\"agent\": \"claude\", \"instr", "uction\": \"PROBE prepara el plan de lanzamiento\"}"]);
  assert.equal(cmd.text, "");
  assert.deepEqual(cmd.end.command, { agent: "claude", instruction: "PROBE prepara el plan de lanzamiento" });
  const cut = run(["@answer\nPrometiste la propuesta [[s1:4]], el contrato y"], true);
  assert.equal(cut.end.answer, "Prometiste la propuesta, el contrato y…");
  assert.equal(cut.end.found, true);
  assert.equal(cut.end.cut, true);
  const bare = run(["Sin marca, pero con fuente [[s1:4]]."]);
  assert.equal(bare.end.answer, "Sin marca, pero con fuente.");
});

test("a time question brings that range's meeting notes, where commitments are written, whatever words it used", () => {
  const idx = indexOf();
  const r = retrieve(idx, parseQuestion("¿Qué prometí entregar esta semana?", ctx), { now: NOW, budget: 24_000 });
  const notes = r.lines.filter((u) => u.kind === "notes");
  assert.ok(notes.some((u) => u.text.includes("Compromiso (el usuario): enviar la propuesta revisada")));
  assert.ok(notes.every((u) => u.at >= Date.parse("2026-11-02T00:00:00-05:00")));
  assert.equal(r.confident, true);
});
