import assert from "node:assert/strict";
import { test } from "node:test";
import { NarrationGuard, words } from "../src/self-voice.ts";

test("words ignores case, accents and punctuation", () => {
  assert.deepEqual(words("¡Está ahí, María!"), ["esta", "ahi", "maria"]);
});

test("a turn that repeats a narration is an echo", () => {
  const g = new NarrationGuard();
  g.narrated("Hay una mesa de madera con dos laptops y una taza de café", 1000);
  assert.equal(g.repeats("hay una mesa de madera con dos laptops", 4000), true);
  assert.equal(g.repeats("Hay una mesa de madera con dos laptops y una taza de café.", 5000), true);
});

test("a turn with a few misheard words is still an echo", () => {
  const g = new NarrationGuard();
  g.narrated("Dile que el presupuesto del proyecto queda para el lunes", 0);
  assert.equal(g.repeats("dile que el presupuesto del proyecto queda para el limes", 3000), true);
});

test("a different turn passes", () => {
  const g = new NarrationGuard();
  g.narrated("Hay una mesa de madera con dos laptops", 0);
  assert.equal(g.repeats("¿Cuándo tienes listo el presupuesto?", 2000), false);
  assert.equal(g.repeats("Hay que revisar la mesa de ayuda", 2000), false);
});

test("short turns match only as a whole phrase of the narration", () => {
  const g = new NarrationGuard();
  g.narrated("Sí, el lunes por la mañana", 0);
  assert.equal(g.repeats("el lunes", 1000), true);
  assert.equal(g.repeats("lunes el", 1000), false);
  assert.equal(g.repeats("sí", 1000), true);
  assert.equal(g.repeats("no", 1000), false);
});

test("narration is forgotten after the window", () => {
  const g = new NarrationGuard(10_000);
  g.narrated("Hay una mesa de madera con dos laptops", 0);
  assert.equal(g.repeats("Hay una mesa de madera con dos laptops", 11_000), false);
});

test("empty text and no narration are never echoes", () => {
  const g = new NarrationGuard();
  assert.equal(g.repeats("hola a todos", 0), false);
  g.narrated("hola a todos", 0);
  assert.equal(g.repeats("...", 0), false);
});
