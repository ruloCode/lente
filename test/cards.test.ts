// add-memory-engine 6.1 to 6.5: consolidation while recording. Live segments become searchable on the
// next flush; card fields are validated against a model that invents turn and fact ids; window cards
// fall due on a fake clock and skip silent or held windows; supersession closes an older fact (the
// spec's launch-date scenario) and never touches a kept one; briefs and people cards are written from
// a fake model and bounded. Synthetic PROBE- data only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_FIELDS, type MemoryCard, WINDOW_MS, applySupersession, cardPrompt, cardUnits, cardedUntil, dueWindow, factsToShow, firstUncarded, validateCard, withCardFields } from "../src/cards.ts";
import { BRIEF_EVERY_MS, briefsDue, personKey, recurringPeople, writeBrief, writePersonCard } from "../src/digests.ts";
import { type Meeting, notesSchema } from "../src/meetings.ts";
import { RecallRuntime, isName } from "../src/recall-runtime.ts";
import { parseQuestion, retrieve } from "../src/recall.ts";
import { terms } from "../src/terms.ts";

const TZ = "America/Bogota";
const MON = Date.parse("2026-11-02T10:00:00-05:00");
const THU = Date.parse("2026-11-05T10:00:00-05:00");
const NOW = Date.parse("2026-11-05T15:00:00-05:00");
const dayStart = (d: string) => Date.parse(`${d}T00:00:00-05:00`);

const meeting = (id: string, at: number, lines: [string, string][], extra: Partial<Meeting> = {}): Meeting => ({
  id,
  title: `PROBE ${id}`,
  startedAt: at,
  endedAt: at + lines.length * 30_000 + 60_000,
  status: "done",
  turns: lines.map(([speaker, text], i) => ({ id: `t${i + 1}`, at: at + (i + 1) * 30_000, speaker, text })),
  ...extra,
});

test("6.1: speech said in a running meeting is searchable on the next flush, with no model call", async () => {
  const live = meeting("m1", NOW - 600_000, [["PROBE-Ana", "Buenos días."]], { status: "running", endedAt: undefined });
  const rt = new RecallRuntime({ meetings: () => [live], assignments: () => new Map(), today: () => [], recent: () => [], keptFacts: () => [] }, TZ, () => NOW);
  await rt.flush();
  assert.equal(rt.index.lexical(terms("cotización")).length, 0);
  live.turns.push({ id: "t2", at: NOW - 15_000, speaker: "PROBE-Ana", text: "La cotización llega el 14 de diciembre." });
  await rt.flush();
  const hits = rt.index.lexical(terms("cotización"));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.unit.refs, "m1:t2–t2", "nine minutes after the first turn: a segment of its own");
});

const raw = (facts: object[], extra: object = {}) => ({ people: [{ name: "PROBE-Ana", role: "marketing" }], card_facts: facts, keys_es: ["presupuesto de marketing", "18 mil dólares"], keys_en: ["marketing budget", "18,000 dollars"], ...extra });

test("6.2: card fields ride in the notes schema; facts without a real turn or with an unshown supersedes are dropped", () => {
  const schema = withCardFields(notesSchema(["t1", "t2"]), ["t1", "t2"], ["cm0:1"]);
  for (const f of CARD_FIELDS) assert.ok(schema.required.includes(f) && f in schema.properties);
  assert.ok(schema.required.includes("summary"), "the notes fields stay");
  assert.match(cardPrompt([{ id: "cm0:1", text: "El lanzamiento es el 20." }]), /cm0:1: El lanzamiento es el 20\./);
  const m = meeting("m2", MON, [["PROBE-Ana", "The marketing budget is 18,000 dollars."], ["Tú", "Perfecto."]]);
  const { card, dropped } = validateCard(
    raw([
      { text: "El presupuesto de marketing es de 18,000 dólares.", about: ["PROBE-Ana"], evidence: ["t1 'quote'"], valid_from: "", supersedes: "" },
      { text: "Inventado.", about: [], evidence: ["t9"], valid_from: "", supersedes: "" },
      { text: "Cambia algo que nunca se mostró.", about: [], evidence: ["t2"], valid_from: "2026-11-03", supersedes: "cm9:9" },
    ]),
    { episodeId: m.id, turnIds: ["t1", "t2"], turnAt: new Map(m.turns.map((t) => [t.id, t.at])), shown: [{ id: "cm0:1", text: "x" }], from: m.startedAt, to: m.endedAt!, window: false, firstN: 0, dayStart },
  );
  assert.deepEqual(card.facts.map((f) => [f.id, f.evidence, f.supersedes]), [["cm2:1", ["t1"], undefined], ["cm2:2", ["t2"], undefined]]);
  assert.equal(card.facts[1]!.validFrom, dayStart("2026-11-03"), "a said date becomes its validity start");
  assert.equal(card.facts[0]!.validFrom, m.turns[0]!.at, "otherwise when it was said");
  assert.equal(dropped, 2, "the invented turn and the unshown supersedes");
  assert.deepEqual(card.keysEn, ["marketing budget", "18,000 dollars"]);
});

test("6.2: the call is shown the best-matching facts still valid, at most five", () => {
  const cards = (facts: [string, string, number?][]): MemoryCard[] => [{ from: MON, to: MON, window: false, people: [], facts: facts.map(([id, text, validTo]) => ({ id, text, about: [], evidence: ["t1"], validFrom: MON, ...(validTo ? { validTo } : {}) })), keysEs: [], keysEn: [] }];
  const old = meeting("m0", MON, [["A", "x"]], { cards: cards([["cm0:1", "El lanzamiento de la beta es el 20."], ["cm0:2", "El presupuesto de la beta es bajo.", MON + 1], ["cm0:3", "Ana lleva el diseño."]]) });
  const words = new Set(terms("la beta y su lanzamiento"));
  const shown = factsToShow([old], (t) => terms(t).filter((w) => words.has(w)).length);
  assert.deepEqual(shown.map((f) => f.id), ["cm0:1"], "closed facts and non-matching ones are not shown");
});

test("6.3: a window card falls due when its 10 minutes close with speech; silent and held windows are skipped", () => {
  const start = THU;
  const m = { startedAt: start, turns: [{ id: "t1", at: start + 60_000, text: "hola" }, { id: "t2", at: start + 2 * WINDOW_MS + 60_000, text: "otra vez" }] } as Pick<Meeting, "startedAt" | "turns">;
  const never = () => false;
  assert.equal(dueWindow(m, start, start + WINDOW_MS - 1, never), undefined, "the first window has not closed");
  assert.deepEqual(dueWindow(m, start, start + WINDOW_MS + 5_000, never), { from: start, to: start + WINDOW_MS });
  // After carding the first window: the second was silent, the third is still open.
  assert.equal(dueWindow(m, start + WINDOW_MS, start + 2 * WINDOW_MS + 30_000, never), undefined);
  assert.deepEqual(dueWindow(m, start + WINDOW_MS, start + 3 * WINDOW_MS, never), { from: start + 2 * WINDOW_MS, to: start + 3 * WINDOW_MS });
  assert.equal(dueWindow(m, start + WINDOW_MS, start + 3 * WINDOW_MS, (from) => from === start + 2 * WINDOW_MS), undefined, "a held window gets no card");
  const carded = { startedAt: start, turns: m.turns as Meeting["turns"], cards: [{ from: start, to: start + WINDOW_MS, window: true, people: [], facts: [], keysEs: [], keysEn: [] }] };
  assert.equal(cardedUntil(carded), start + WINDOW_MS);
  assert.equal(firstUncarded(carded), "t2", "the closing card covers only what no window card did");
  assert.equal(firstUncarded({ ...carded, cards: [] }), undefined);
});

test("6.4: the launch date moved — «¿Cuándo es el lanzamiento?» says the 27th, «¿Qué fecha se dijo el lunes?» the 20th; a kept fact is never offered", async () => {
  const monday = meeting("m20261102150000", MON, [["PROBE-Sofía", "Fijamos el lanzamiento para el 20 de noviembre."]]);
  monday.cards = [validateCard(raw([{ text: "El lanzamiento es el 20 de noviembre.", about: ["PROBE-Atlas"], evidence: ["t1"], valid_from: "", supersedes: "" }]), { episodeId: monday.id, turnIds: ["t1"], turnAt: new Map([["t1", monday.turns[0]!.at]]), shown: [], from: MON, to: monday.endedAt!, window: false, firstN: 0, dayStart }).card];
  const thursday = meeting("m20261105150000", THU, [["PROBE-Sofía", "Movemos el lanzamiento al 27 de noviembre."]]);
  const shown = factsToShow([monday], () => 1);
  assert.deepEqual(shown.map((f) => f.id), ["cm20261102150000:1"]);
  const { card } = validateCard(raw([{ text: "El lanzamiento pasó al 27 de noviembre.", about: ["PROBE-Atlas"], evidence: ["t1"], valid_from: "", supersedes: "cm20261102150000:1" }]), { episodeId: thursday.id, turnIds: ["t1"], turnAt: new Map([["t1", thursday.turns[0]!.at]]), shown, from: THU, to: thursday.endedAt!, window: false, firstN: 0, dayStart });
  thursday.cards = [card];
  assert.deepEqual(applySupersession(card, [monday]).map((m) => m.id), [monday.id]);
  assert.equal(monday.cards[0]!.facts[0]!.validTo, thursday.turns[0]!.at);
  assert.equal(monday.cards[0]!.facts[0]!.supersededBy, "cm20261105150000:1");

  const rt = new RecallRuntime({ meetings: () => [monday, thursday], assignments: () => new Map(), today: () => [], recent: () => [], keptFacts: () => [] }, TZ, () => NOW);
  await rt.ready;
  const ctx = { now: NOW, timeZone: TZ, people: [], projects: [] };
  const cardsFor = (q: string) => retrieve(rt.index, parseQuestion(q, ctx), { now: NOW, budget: 24_000 }).lines.filter((u) => u.kind === "card").map((u) => u.text.split(" · ")[0]);
  assert.deepEqual(cardsFor("¿Cuándo es el lanzamiento?"), ["El lanzamiento pasó al 27 de noviembre. (cambia un dato anterior)"]);
  assert.deepEqual(cardsFor("¿Qué fecha se dijo el lunes para el lanzamiento?"), ["El lanzamiento es el 20 de noviembre."]);

  // A kept fact (F…) is never among the facts shown, so no card can supersede it; naming it anyway is dropped.
  const out = validateCard(raw([{ text: "Otro dato.", about: [], evidence: ["t1"], valid_from: "", supersedes: "Ff1" }]), { episodeId: "m3", turnIds: ["t1"], turnAt: new Map([["t1", THU]]), shown, from: THU, to: THU, window: false, firstN: 0, dayStart });
  assert.equal(out.card.facts[0]!.supersedes, undefined);
  assert.equal(out.dropped, 1);
  assert.equal(cardUnits(thursday, "p-atlas")[0]!.projectId, "p-atlas");
});

test("6.5: a brief from its last version and the new cards; people seen twice get a card; briefs wait 30 minutes", async () => {
  const m = meeting("m5", THU, [["PROBE-Ana", "Nuevo compromiso: la demo el viernes."]], { notes: { summary: "PROBE demo.", decisions: [], commitments: [{ what: "la demo", owner: "you", due: "viernes", evidence: ["t1"] }], openQuestions: [] } });
  m.cards = [{ from: THU, to: THU, window: false, people: [{ name: "PROBE-Ana", role: "" }], facts: [{ id: "cm5:1", text: "La demo es el viernes.", about: [], evidence: ["t1"], validFrom: THU }], keysEs: [], keysEn: [] }];
  const seen: string[] = [];
  const call = async (messages: { content: unknown }[], _schema: object, name: string) => (seen.push(`${name}:${String(messages[1]!.content)}`), JSON.stringify({ text: "PROBE-Atlas: demo el viernes. ".repeat(200), sources: ["m5", "cm5:1", "inventado"] }));
  const brief = await writeBrief({ project: { id: "p-atlas", name: "PROBE-Atlas" }, meetings: [m] }, call as never, NOW);
  assert.equal(brief.scope, "brief");
  assert.equal(brief.periodStart, "p-atlas");
  assert.ok(brief.text.length <= 2000);
  assert.deepEqual(brief.sources, ["m5", "cm5:1"]);
  assert.match(seen[0]!, /Hecho \[cm5:1\]: La demo es el viernes\./);
  const person = await writePersonCard({ person: "PROBE-Ana Ruiz", meetings: [m] }, call as never, NOW);
  assert.equal(person.periodStart, "probe-ana ruiz");
  assert.ok(person.text.length <= 600);
  assert.equal(personKey("PROBE-Lucía  Paredes"), "probe-lucia paredes");

  const other = meeting("m6", MON, [["PROBE-Ana", "hola"], ["B", "x"]]);
  assert.deepEqual([...recurringPeople([m, other, meeting("m7", MON, [["PROBE-Tom", "y"]])], isName).keys()], ["PROBE-Ana"], "seen in two episodes; a diarization label is not a person");
  assert.deepEqual(briefsDue(new Set(["p-atlas", "p-orion"]), new Map([["p-atlas", NOW - BRIEF_EVERY_MS + 1], ["p-orion", NOW - BRIEF_EVERY_MS]]), NOW), ["p-orion"]);
});

test("6.5: briefs and people cards join the index and a project's prefix", async () => {
  const m = meeting("m8", THU, [["PROBE-Ana", "hola"]]);
  const other = meeting("m9", MON, [["PROBE-Ana", "otra"]]);
  const brief = { scope: "brief" as const, periodStart: "p-atlas", text: "PROBE-Atlas: piloto el lunes 9.", sources: [], createdAt: NOW };
  const person = { scope: "person" as const, periodStart: "probe-ana", text: "PROBE-Ana lleva marketing.", sources: [], createdAt: NOW };
  const rt = new RecallRuntime({ meetings: () => [m, other], assignments: () => new Map([["m8", "p-atlas"]]), today: () => [], recent: () => [], keptFacts: () => [], memoryDigests: async () => ({ briefs: [brief], people: [person] }) }, TZ, () => NOW);
  await rt.ready;
  assert.equal(rt.index.get("brief:p-atlas")?.projectId, "p-atlas");
  const prefix = await rt.prefix("p-atlas");
  assert.equal(prefix[0]!.id, "brief:p-atlas");
  assert.ok(!prefix.some((u) => u.id.startsWith("person:")), "a person card can carry other projects: not inside one");
  assert.ok((await rt.prefix(undefined)).some((u) => u.id === "person:probe-ana"), "but it is in the whole memory's prefix");
  assert.ok(!(await rt.prefix("p-orion")).some((u) => u.id === "brief:p-atlas"), "another project's brief stays out");
});
