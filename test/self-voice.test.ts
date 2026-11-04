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

test("a stretch heard across two sentences of a reply is still Lente's own voice", () => {
  const g = new NarrationGuard();
  // Ver's reply goes out a sentence at a time, and the hub and the phone both report each one.
  for (const line of ["Ya guardé tus datos, Ana.", "Soy una cámara en tus gafas que te cuenta lo que ve."]) {
    g.narrated(line, 0);
    g.narrated(line, 10);
  }
  assert.equal(g.repeats("datos Ana soy una cámara en tus", 2000), true);
  assert.equal(g.repeats("tus datos ana soy", 2000), true);
  // The wearer's own answer still passes.
  assert.equal(g.repeats("¿Qué tengo en la mano?", 2000), false);
  assert.equal(g.repeats("Me llamo Ana y tengo treinta años", 2000), false);
});

