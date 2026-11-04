import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COACH_PROMPT,
  LESSONS,
  MAX_ATTEMPT_NOTES,
  coachMessages,
  earlierAttempts,
  lessonById,
  noteName,
  practiceSummary,
  validateAttempt,
} from "../src/practice.ts";

const scale = [60, 62, 64, 65, 67, 69, 71, 72];

/** A played attempt at the scale: one note per expected note, 700 ms apart. */
const played = (notes: number[]) => notes.map((midi, i) => ({ midi, atMs: i * 700 }));

test("the three lessons and their notes", () => {
  assert.deepEqual(LESSONS.map((l) => l.id), ["escala-do", "estrellita", "himno-alegria"]);
  assert.deepEqual(lessonById("escala-do")?.notes, scale);
  assert.deepEqual(lessonById("estrellita")?.notes, [60, 60, 67, 67, 69, 69, 67]);
  assert.deepEqual(lessonById("himno-alegria")?.notes, [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]);
  assert.deepEqual(LESSONS.map((l) => l.title), ["Escala de Do", "Estrellita", "Himno de la alegría"]);
  assert.equal(lessonById("PROBE-nope"), undefined);
});

test("solfège names, with sharps spelled out", () => {
  assert.equal(noteName(60), "Do");
  assert.equal(noteName(67), "Sol");
  assert.equal(noteName(72), "Do");
  assert.equal(noteName(61), "Do sostenido");
  assert.equal(noteName(70), "La sostenido");
  assert.equal(noteName(59), "Si");
});

test("a valid attempt passes and is normalized", () => {
  const out = validateAttempt({ lessonId: "escala-do", expected: scale, played: played(scale), marks: scale.map(() => "right"), extra: 0, durationMs: 5400 });
  assert.ok(out.ok);
  assert.equal(out.lesson.id, "escala-do");
  assert.equal(out.attempt.played.length, 8);
  assert.equal(out.attempt.durationMs, 5400);
});

test("an unknown lesson is refused", () => {
  const out = validateAttempt({ lessonId: "PROBE-unknown", expected: scale, played: played(scale), marks: scale.map(() => "right"), extra: 0, durationMs: 5400 });
  assert.equal(out.ok, false);
  assert.match(!out.ok ? out.error : "", /lesson/);
});

test("more than 64 notes is refused", () => {
  const many = Array.from({ length: MAX_ATTEMPT_NOTES + 1 }, () => 60);
  assert.equal(validateAttempt({ lessonId: "escala-do", expected: many, played: [], marks: many.map(() => "missed"), extra: 0, durationMs: 1000 }).ok, false);
  assert.equal(validateAttempt({ lessonId: "escala-do", expected: scale, played: played(many), marks: scale.map(() => "right"), extra: 0, durationMs: 1000 }).ok, false);
});

test("out-of-range numbers and malformed fields are refused", () => {
  const base = { lessonId: "escala-do", expected: scale, played: played(scale), marks: scale.map(() => "right"), extra: 0, durationMs: 5400 };
  const bad: unknown[] = [
    { ...base, expected: [...scale.slice(0, 7), 128] },
    { ...base, expected: [...scale.slice(0, 7), 60.5] },
    { ...base, played: [{ midi: -1, atMs: 0 }] },
    { ...base, played: [{ midi: 60, atMs: -5 }] },
    { ...base, played: [{ midi: 60, atMs: 10 * 60_000 + 1 }] },
    { ...base, durationMs: -1 },
    { ...base, durationMs: 10 * 60_000 + 1 },
    { ...base, extra: -1 },
    { ...base, extra: 65 },
    { ...base, marks: ["right"] },
    { ...base, marks: scale.map(() => "maybe") },
    { ...base, matched: [60] },
    { ...base, matched: scale.map(() => 200) },
    { ...base, lessonId: 7 },
    "PROBE",
    null,
  ];
  for (const body of bad) assert.equal(validateAttempt(body).ok, false, JSON.stringify(body));
});

test("the summary of a perfect attempt", () => {
  const out = validateAttempt({ lessonId: "escala-do", expected: scale, played: played(scale), marks: scale.map(() => "right"), extra: 0, durationMs: 5400 });
  assert.ok(out.ok);
  const s = practiceSummary(out.lesson, out.attempt);
  assert.equal(s.text, "Piano · Escala de Do: 8 de 8 notas bien; 5 s");
  assert.equal(s.right, 8);
  assert.equal(s.total, 8);
});

test("the summary of one wrong note names what was played, in solfège", () => {
  const himno = lessonById("himno-alegria")!.notes;
  const notes = [...himno];
  notes[3] = 65; // Fa instead of Sol
  const marks = himno.map((_, i) => (i === 3 || i === 9 ? "wrong" : "right"));
  notes[9] = 62;
  const out = validateAttempt({ lessonId: "himno-alegria", expected: himno, played: played(notes), marks, extra: 0, durationMs: 21_200 });
  assert.ok(out.ok);
  const s = practiceSummary(out.lesson, out.attempt);
  assert.equal(s.text, "Piano · Himno de la alegría: 13 de 15 notas bien; falló la 4.ª (tocó Fa en vez de Sol); 21 s");
});

test("an explicit match wins over walking the played notes, even with extra notes", () => {
  const notes = [60, 62, 64, 66, 67, 69, 71, 72, 72];
  const marks = scale.map((_, i) => (i === 3 ? "wrong" : "right"));
  const matched = [60, 62, 64, 66, 67, 69, 71, 72];
  const out = validateAttempt({ lessonId: "escala-do", expected: scale, played: played(notes), marks, matched, extra: 1, durationMs: 6000 });
  assert.ok(out.ok);
  assert.equal(practiceSummary(out.lesson, out.attempt).text, "Piano · Escala de Do: 7 de 8 notas bien; falló la 4.ª (tocó Fa sostenido en vez de Fa); 1 nota de más; 6 s");
});

test("with extra notes and no match, the wrong note is not guessed", () => {
  const notes = [60, 61, 62, 64, 67, 67, 69, 71, 72];
  const marks = scale.map((_, i) => (i === 3 ? "wrong" : "right"));
  const out = validateAttempt({ lessonId: "escala-do", expected: scale, played: played(notes), marks, extra: 1, durationMs: 6000 });
  assert.ok(out.ok);
  assert.equal(practiceSummary(out.lesson, out.attempt).text, "Piano · Escala de Do: 7 de 8 notas bien; falló la 4.ª (era Fa); 1 nota de más; 6 s");
});

test("the summary of a missed note", () => {
  const notes = scale.filter((_, i) => i !== 3);
  const marks = scale.map((_, i) => (i === 3 ? "missed" : "right"));
  const out = validateAttempt({ lessonId: "escala-do", expected: scale, played: played(notes), marks, extra: 0, durationMs: 4600 });
  assert.ok(out.ok);
  assert.equal(practiceSummary(out.lesson, out.attempt).text, "Piano · Escala de Do: 7 de 8 notas bien; faltó la 4.ª (Fa); 5 s");
});

test("earlier attempts: the last three of that lesson, oldest first", () => {
  const entries = [
    { at: 1, kind: "practice" as const, lessonId: "escala-do", text: "PROBE uno", right: 5, total: 8 },
    { at: 2, kind: "practice" as const, lessonId: "estrellita", text: "PROBE otra", right: 7, total: 7 },
    { at: 3, kind: "practice" as const, lessonId: "escala-do", text: "PROBE dos", right: 6, total: 8 },
    { at: 4, kind: "turn" as const, text: "PROBE hola" },
    { at: 5, kind: "practice" as const, lessonId: "escala-do", text: "PROBE tres", right: 7, total: 8 },
    { at: 6, kind: "practice" as const, lessonId: "escala-do", text: "PROBE cuatro", right: 8, total: 8 },
  ];
  assert.deepEqual(earlierAttempts(entries, "escala-do", 2), ["PROBE dos", "PROBE tres", "PROBE cuatro"]);
  assert.deepEqual(earlierAttempts(entries, "escala-do", 4), ["PROBE tres", "PROBE cuatro"]);
  assert.deepEqual(earlierAttempts(entries, "himno-alegria", 0), []);
});

test("the coach gets the prompt, the attempt and today's earlier attempts", () => {
  assert.match(COACH_PROMPT, /piano/i);
  assert.match(COACH_PROMPT, /Spanish/);
  assert.match(COACH_PROMPT, /medical|pain/);
  const [system, user] = coachMessages("Piano · Escala de Do: 8 de 8 notas bien; 5 s", ["Piano · Escala de Do: 6 de 8 notas bien; 7 s"]);
  assert.equal(system!.content, COACH_PROMPT);
  assert.match(String(user!.content), /Este intento: Piano · Escala de Do: 8 de 8/);
  assert.match(String(user!.content), /Antes, hoy:\n- Piano · Escala de Do: 6 de 8/);
  assert.doesNotMatch(String(coachMessages("PROBE", [])[1]!.content), /Antes, hoy/);
});
