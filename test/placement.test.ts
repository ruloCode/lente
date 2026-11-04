// add-language-coach 2.3: the placement's pure parts. A synthetic learner transcript with known audio spans.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COACH_LANGUAGES } from "../src/coach.ts";
import { ESTIMATE_SCHEMA, NOT_AN_EXAM, type PlacementTurn, checkEvidence, closingLine, enoughForBand, estimateInput, fluency, parseEstimate } from "../src/placement.ts";

const PT = COACH_LANGUAGES.pt;

/** Three answers: 6, 9 and 12 words over 3, 4.5 and 6 s of speech (120 words per minute), started 800, 1200 and 1000 ms after each question. */
const TURNS: PlacementTurn[] = [
  { text: "Meu nome é Rulo, sou da Colômbia.", promptEndMs: 10_000, startMs: 10_800, endMs: 13_800 },
  { text: "Eu trabalho com software e moro em Bogotá agora.", promptEndMs: 20_000, startMs: 21_200, endMs: 25_700 },
  { text: "Ontem eu fui ao mercado e comprei frutas para a minha família.", promptEndMs: 30_000, startMs: 31_000, endMs: 37_000 },
];

test("fluency: words per minute from the audio spans, the median time to start answering, words per turn", () => {
  const f = fluency(TURNS);
  assert.equal(f.words, 7 + 9 + 12);
  assert.equal(f.turns, 3);
  assert.equal(f.wordsPerMinute, Math.round((28 / 13_500) * 60_000));
  assert.equal(f.medianStartMs, 1_000);
  assert.equal(f.wordsPerTurn, 9.3);
  assert.deepEqual(fluency([{ text: "olá" }]), { words: 1, turns: 1, wordsPerTurn: 1 }, "no spans, no timing numbers");
});

test("too few words → no band, and the line still says it is not an exam", () => {
  assert.equal(enoughForBand(fluency(TURNS)), false, "28 words is under the floor");
  const line = closingLine(undefined, PT);
  assert.match(line, /conversación más larga/);
  assert.ok(line.endsWith(NOT_AN_EXAM));
});

test("a quote the wearer never said is dropped; three answers keep the model's confidence, fewer lower it", () => {
  const estimate = parseEstimate(JSON.stringify({
    band: "A2",
    confidence: "medium",
    vocabulary: { note: "Usas palabras del día a día con soltura", quotes: ["comprei frutas", "eu falo francês muito bem"] },
    grammar: { note: "Usas el pasado simple", quotes: ["Ontem eu fui ao mercado"], patterns: ["pretérito perfeito"] },
    plan: ["Practica el pasado", "Aprende diez verbos", "Habla dos minutos al día"],
  }))!;
  const checked = checkEvidence(estimate, TURNS);
  assert.deepEqual(checked.vocabulary.quotes, ["comprei frutas"]);
  assert.deepEqual(checked.grammar.quotes, ["Ontem eu fui ao mercado"]);
  assert.equal(checked.confidence, "medium");
  assert.equal(checkEvidence(estimate, TURNS.slice(0, 2)).confidence, "low");
  const line = closingLine(checked, PT);
  assert.match(line, /^Tu nivel estimado de portugués es A2, con seguridad media\. Usas palabras del día a día con soltura\./);
  assert.ok(line.endsWith(NOT_AN_EXAM));
});

test("parseEstimate refuses what is not an estimate; the schema's bands are A1 to C1", () => {
  assert.equal(parseEstimate("not json"), undefined);
  assert.equal(parseEstimate(JSON.stringify({ band: "C2" })), undefined);
  assert.equal(parseEstimate(JSON.stringify({ band: "B1", confidence: "certain" }))!.confidence, "low");
  assert.deepEqual(ESTIMATE_SCHEMA.properties.band.enum, ["A1", "A2", "B1", "B2", "C1"]);
  assert.match(estimateInput(["Como você se chama?"], TURNS, fluency(TURNS)), /median time to start answering 1000 ms/);
});
