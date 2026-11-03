// add-accounts 5.3 with a stubbed model: an answer from a three-month-old meeting, a question with
// nothing behind it, and a plan that names an id it was never shown. Synthetic data only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { NOT_FOUND } from "../src/ask.ts";
import { type TierCall, type TierInput, type TierLoaders, askTiers, buildTierContext, entriesInSpans, fold, lookUp, parsePlan, scopeTierInput } from "../src/ask-tiers.ts";
import { CutOffError } from "../src/ask.ts";
import type { ChatMessage } from "../src/chat.ts";
import type { Digest } from "../src/digests.ts";
import type { Meeting } from "../src/meetings.ts";

const NOW = Date.UTC(2026, 10, 1, 15);
const OLD = Date.UTC(2026, 7, 4, 14); // three months earlier
const OLD_ID = "m20260804140000";

const oldMeeting: Meeting = {
  id: OLD_ID,
  title: "Proveedor de empaques",
  startedAt: OLD,
  status: "done",
  turns: [
    { id: "t1", at: OLD + 60_000, speaker: "Camila", text: "Buenos días, empecemos." },
    { id: "t2", at: OLD + 120_000, speaker: "Camila", text: "Acordamos un descuento del 12 % si el pedido pasa de 5.000 cajas." },
    { id: "t3", at: OLD + 180_000, speaker: "A", text: "Perfecto, lo confirmo por correo." },
  ],
  notes: { summary: "Negociación con el proveedor de empaques.", decisions: [], commitments: [], openQuestions: [] },
};

const month: Digest = { scope: "month", periodStart: "2026-08-01", text: "En agosto se negoció con el proveedor de empaques (Camila).", sources: [OLD_ID, "d2026-08-04"], createdAt: NOW };
const input = (): TierInput => ({ profile: { scope: "profile", periodStart: "2026-11-01", text: "Gerente de compras.", sources: [], createdAt: NOW }, days: [], weeks: [], months: [month], recentMeetings: [], keptFacts: [] });

/** Answers the plan call and the answer call with what the test gives; records what it saw. */
function model(plan: object, answer: object) {
  const seen: { name: string; messages: ChatMessage[] }[] = [];
  const call: TierCall = async (messages, _schema, name) => {
    seen.push({ name, messages });
    return JSON.stringify(name === "lookup_plan" ? plan : answer);
  };
  return { call, seen };
}

function loaders(log: unknown[] = []): TierLoaders {
  return {
    meetings: async (ids) => (log.push({ meetings: ids }), ids.includes(OLD_ID) ? [oldMeeting] : []),
    meetingsBetween: async (from, to, limit) => (log.push({ from, to, limit }), OLD >= from && OLD < to ? [oldMeeting] : []),
    days: async (days) => (log.push({ days }), []),
  };
}

test("a question answered from a meeting three months ago: the plan opens it, the turn is shown and cited", async () => {
  const log: unknown[] = [];
  const { call, seen } = model(
    { needs_lookup: true, meetings: [OLD_ID], days: [], from: null, to: null, terms: ["descuento", "Camila"] },
    { found: true, answer: "Con Camila acordaron un 12 % de descuento sobre 5.000 cajas.", sources: [`${OLD_ID}:t2`] },
  );
  const out = await askTiers({ ...input(), question: "¿Qué descuento acordé con Camila?", history: [], now: NOW }, loaders(log), call);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.equal(out.found, true);
  assert.deepEqual(out.sources.map((s) => [s.meetingId, s.turnId]), [[OLD_ID, "t2"]]);
  assert.deepEqual(seen.map((s) => s.name), ["lookup_plan", "ask"]);
  const answerPrompt = String(seen[1]!.messages[1]!.content);
  assert.ok(answerPrompt.indexOf(`[${OLD_ID}:t2]`) < answerPrompt.indexOf(`[${OLD_ID}:t1]`), "the matching turn ranks first");
  assert.deepEqual(log, [{ meetings: [OLD_ID] }]);
  assert.ok(!JSON.stringify(log).includes("descuento"), "the loaders never receive a word of the question");
});

test("a date range opens the meetings in it, bounded", async () => {
  const log: { from?: number; to?: number; limit?: number }[] = [];
  const { call } = model({ needs_lookup: true, meetings: [], days: [], from: "2026-08-01", to: "2026-08-31", terms: ["descuento"] }, { found: true, answer: "Un 12 %.", sources: [`${OLD_ID}:t2`] });
  const out = await askTiers({ ...input(), question: "¿Qué pasó en agosto con el descuento?", history: [], now: NOW }, loaders(log as unknown[]), call);
  assert.ok(out.ok && out.found);
  const ranged = log.find((l) => "from" in l)!;
  assert.equal(ranged.limit, 5);
  assert.equal(new Date(ranged.from!).toISOString().slice(0, 10), "2026-08-01");
});

test("nothing behind it: no lookup, found false, the not-found sentence, no chips", async () => {
  const log: unknown[] = [];
  const { call } = model({ needs_lookup: false, meetings: [], days: [], from: null, to: null, terms: [] }, { found: false, answer: "", sources: [] });
  const out = await askTiers({ ...input(), question: "¿Cuál es la contraseña del wifi de la oficina?", history: [], now: NOW }, loaders(log), call);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.equal(out.found, false);
  assert.equal(out.answer, NOT_FOUND);
  assert.deepEqual(out.sources, []);
  assert.deepEqual(log, []);
});

test("a plan that names ids it was never shown: they are dropped and never opened", () => {
  const shown = buildTierContext(input());
  const plan = parsePlan(JSON.stringify({ needs_lookup: true, meetings: [OLD_ID, "m20250101000000", "drop table"], days: ["2026-08-04", "2026-01-01", "d2026-08-04"], from: null, to: null, terms: ["x"] }), shown, NOW);
  assert.deepEqual(plan?.meetings, [OLD_ID]);
  assert.deepEqual(plan?.days, ["2026-08-04"]);
});

test("an answer citing an id that was not shown is not trusted", async () => {
  const { call } = model({ needs_lookup: true, meetings: ["m20250101000000"], days: [], from: null, to: null, terms: [] }, { found: true, answer: "Fue el 1 de enero.", sources: ["m20250101000000:t9"] });
  const out = await askTiers({ ...input(), question: "¿Cuándo fue?", history: [], now: NOW }, loaders(), call);
  assert.ok(out.ok && !out.found && out.answer === NOT_FOUND);
});

test("a digest can be cited, and its chip names the period", async () => {
  const { call } = model({ needs_lookup: false, meetings: [], days: [], from: null, to: null, terms: [] }, { found: true, answer: "En agosto negociaste con empaques.", sources: ["month:2026-08-01"] });
  const out = await askTiers({ ...input(), question: "¿Con quién negocié en agosto?", history: [], now: NOW }, loaders(), call);
  assert.ok(out.ok && out.found);
  if (out.ok) assert.equal(out.sources[0]!.label, "Resumen · 2026-08-01");
});

test("the context puts oldest tiers first, so it only grows at the end, and stays in budget", () => {
  const days: Digest[] = Array.from({ length: 14 }, (_, i) => ({ scope: "day", periodStart: `2026-10-${String(31 - i).padStart(2, "0")}`, text: "x".repeat(1500), sources: [], createdAt: NOW }));
  const shown = buildTierContext({ ...input(), days }, 10_000);
  const text = shown.lines.join("\n");
  assert.ok(text.length <= 10_000);
  assert.ok(text.indexOf("Mes 2026-08") < text.indexOf("Día 2026-10-18"));
});

test("lookup ranks by terms without accents or case, newest first on ties, and fits its budget", async () => {
  const many: Meeting = { ...oldMeeting, turns: Array.from({ length: 2000 }, (_, i) => ({ id: `t${i + 1}`, at: OLD + i, text: i === 7 ? "El DÉSCUENTO quedó firmado" : `relleno ${i}` })) };
  const shown = await lookUp({ meetings: [OLD_ID], days: [], terms: ["descuento"] }, { ...loaders(), meetings: async () => [many] }, 3000);
  assert.ok(shown.lines.join("\n").length <= 3000);
  assert.match(shown.lines[1]!, /DÉSCUENTO/);
  assert.equal(fold("Ñandú ÁRBOL"), "nandu arbol");
});

// add-memory-engine 1.2 to 1.4: a cut-off reply, the shared cache prefix and the project scope.

test("the plan and the answer share their first message, the memory, so the answer reuses the cached prefix", async () => {
  const { call, seen } = model({ needs_lookup: false, meetings: [], days: [], from: null, to: null, terms: [] }, { found: false, answer: "", sources: [] });
  await askTiers({ ...input(), question: "¿Qué pasó en agosto?", history: [{ role: "user", text: "hola" }], now: NOW }, loaders(), call);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0]!.messages[0], seen[1]!.messages[0]);
  assert.match(String(seen[0]!.messages[0]!.content), /^Hoy es 2026-11-01\.\n\nMEMORIA:\n/);
  assert.doesNotMatch(String(seen[0]!.messages[0]!.content), /Decides qué abrir|Eres Lente/, "the instructions come after the shared prefix");
  assert.equal(seen[1]!.messages.at(-1)!.content, "¿Qué pasó en agosto?");
});

test("a reply cut at the length limit is retried once at double the cap; cut twice, it fails instead of saying not found", async () => {
  const caps: number[] = [];
  const answer = { found: true, answer: "Mandar el presupuesto, el contrato y la agenda.", sources: [] };
  const once: TierCall = async (_m, _s, name, maxTokens) => {
    caps.push(maxTokens);
    if (name === "lookup_plan") return JSON.stringify({ needs_lookup: false, meetings: [], days: [], from: null, to: null, terms: [] });
    return caps.length === 2 ? { text: '{"found":true,"answer":"Mandar el presu', finishReason: "length" } : { text: JSON.stringify(answer), finishReason: "stop" };
  };
  const out = await askTiers({ ...input(), question: "¿Qué prometí entregar esta semana?", history: [], now: NOW }, loaders(), once);
  assert.ok(out.ok && out.found);
  assert.deepEqual(caps, [1500, 1500, 3000]);

  const always: TierCall = async (_m, _s, name) => (name === "lookup_plan" ? JSON.stringify({ needs_lookup: false }) : { text: '{"found":true,"answer":"Mandar', finishReason: "length" });
  await assert.rejects(askTiers({ ...input(), question: "¿Qué prometí entregar esta semana?", history: [], now: NOW }, loaders(), always), CutOffError);
});

test("inside a project the prompt holds only that project: no profile, no digests, no other project's notes or facts", async () => {
  const atlas: Meeting = { id: "m20261030100000", title: "PROBE-Atlas semanal", startedAt: NOW - 2 * 86_400_000, endedAt: NOW - 2 * 86_400_000 + 3_600_000, status: "done", turns: [{ id: "t1", at: NOW - 2 * 86_400_000 + 60_000, speaker: "A", text: "PROBE-Atlas: el piloto arranca el lunes." }], notes: { summary: "PROBE-Atlas revisó el piloto.", decisions: [], commitments: [], openQuestions: [] } };
  const orion: Meeting = { id: "m20261031100000", title: "PROBE-Orion diseño", startedAt: NOW - 86_400_000, endedAt: NOW - 86_400_000 + 3_600_000, status: "done", turns: [], notes: { summary: "PROBE-Orion entrevistó a PROBE-Lucía para diseño.", decisions: [], commitments: [], openQuestions: [] } };
  const whole: TierInput = {
    profile: { scope: "profile", periodStart: "2026-11-01", text: "Trabaja en PROBE-Orion y PROBE-Atlas.", sources: [], createdAt: NOW },
    days: [{ scope: "day", periodStart: "2026-10-31", text: "PROBE-Orion entrevistó a PROBE-Lucía.", sources: [orion.id], createdAt: NOW }],
    weeks: [{ scope: "week", periodStart: "2026-10-26", text: "Semana de PROBE-Orion y PROBE-Atlas.", sources: [], createdAt: NOW }],
    months: [month],
    recentMeetings: [atlas, orion],
    keptFacts: [
      { id: "f1", text: "PROBE-Atlas usa el piloto en Bogotá.", status: "kept", meetingId: atlas.id, evidence: ["t1"], createdAt: NOW },
      { id: "f2", text: "PROBE-Lucía es la candidata de PROBE-Orion.", status: "kept", meetingId: orion.id, evidence: [], createdAt: NOW },
    ],
  };
  const scoped = scopeTierInput(whole, new Set([atlas.id]));
  const { call, seen } = model({ needs_lookup: false, meetings: [], days: [], from: null, to: null, terms: [] }, { found: false, answer: "", sources: [] });
  const out = await askTiers({ ...scoped, question: "¿A quién entrevistamos para diseño?", history: [], now: NOW }, loaders(), call);
  assert.ok(out.ok && !out.found);
  const prompt = JSON.stringify(seen.map((s) => s.messages));
  assert.match(prompt, /PROBE-Atlas revisó el piloto/);
  assert.match(prompt, /PROBE-Atlas usa el piloto/);
  assert.doesNotMatch(prompt, /Orion|Lucía|agosto|Gerente|empaques/, "nothing from another project, the profile or a digest");

  const day = [{ at: atlas.startedAt + 60_000, n: "in" }, { at: orion.startedAt + 60_000, n: "other" }, { at: atlas.startedAt - 60_000, n: "before" }];
  assert.deepEqual(entriesInSpans(day, [atlas], NOW).map((e) => e.n), ["in"]);
});
