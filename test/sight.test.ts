import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movementGuard,
  parseSight,
  SIGHT_LIVE_MAX_CHARS,
  SIGHT_LIVE_PROMPT,
  sightLookPrompt,
  spokenChunks,
  trimAtSentence,
} from "../src/sight.ts";

test("unchanged, empty and marker-only replies say nothing", () => {
  assert.equal(parseSight("="), undefined);
  assert.equal(parseSight(" = "), undefined);
  assert.equal(parseSight("=."), undefined);
  assert.equal(parseSight(""), undefined);
  assert.equal(parseSight("   \n "), undefined);
});

test("a description comes back trimmed, with a stray leading marker dropped", () => {
  assert.equal(parseSight("  Al frente hay una puerta   azul. "), "Al frente hay una puerta azul.");
  assert.equal(parseSight("= Ahora hay una taza a tu derecha."), "Ahora hay una taza a tu derecha.");
});

test("a long description is cut at a sentence end, never mid-word", () => {
  const long = `${"Hay una hoja con un texto largo sobre la mesa. ".repeat(10)}Fin`;
  const out = parseSight(long);
  assert.ok(out);
  assert.ok(out.length <= SIGHT_LIVE_MAX_CHARS);
  assert.ok(out.endsWith("."));
  const noStops = "palabra ".repeat(80);
  const cut = trimAtSentence(noStops, 50);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes("palab…"));
});

test("spoken chunks are sentences of at most 200 characters", () => {
  const text = `Primera frase. ¿Segunda pregunta? ${"una cláusula larga, ".repeat(20)}final. Última.`;
  const chunks = spokenChunks(text);
  assert.equal(chunks[0], "Primera frase.");
  assert.equal(chunks[1], "¿Segunda pregunta?");
  assert.ok(chunks.every((c) => c.length <= 200 && c.length > 0));
  assert.equal(chunks.at(-1), "Última.");
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " ").trim());
});

test("the movement guard catches questions about moving safely", () => {
  for (const q of ["¿Puedo cruzar?", "¿es seguro bajar?", "¿Hay carros?", "¿Hay escaleras al frente?", "¿Puedo pasar?", "¿Por dónde salgo?", "¿Hay alguien detrás?", "¿Está en verde el semáforo?"]) {
    assert.equal(movementGuard(q), true, q);
  }
  for (const q of ["¿Qué dice el letrero?", "¿Qué tengo en la mano?", "Léeme este papel", "¿Cuánto es este billete?", "¿De qué color es la camisa?"]) {
    assert.equal(movementGuard(q), false, q);
  }
});

test("a look about moving gets the safety rule; others do not", () => {
  assert.match(sightLookPrompt("¿puedo cruzar?"), /no puedo saber si es seguro moverte/);
  assert.doesNotMatch(sightLookPrompt("¿qué dice el letrero?"), /no puedo saber si es seguro moverte/);
});

test("every sight prompt forbids movement guidance and naming people", () => {
  for (const p of [SIGHT_LIVE_PROMPT, sightLookPrompt("¿qué hay?")]) {
    assert.match(p, /never tell the person to move/);
    assert.match(p, /never name a person/);
  }
  assert.match(SIGHT_LIVE_PROMPT, /answer exactly = and nothing else/);
  assert.match(SIGHT_LIVE_PROMPT, /never say what is absent/);
});
