import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAnswer, sightSet, summarizeEval } from "../src/sight-eval.ts";

const set = sightSet("Probeta");
const item = (id: string) => set.find((i) => i.id === id)!;

test("the set has the six banknotes, two texts and three objects", () => {
  assert.equal(set.filter((i) => i.kind === "billete").length, 6);
  assert.equal(set.filter((i) => i.kind === "texto").length, 2);
  assert.equal(set.filter((i) => i.kind === "objeto").length, 3);
});

test("a banknote is right with its value in digits or words, and wrong with another value", () => {
  const b20 = item("billete-20000");
  assert.equal(scoreAnswer(b20, "Tienes un billete de 20.000 pesos."), true);
  assert.equal(scoreAnswer(b20, "Es un billete de veinte mil pesos colombianos."), true);
  assert.equal(scoreAnswer(b20, "Parece un billete de 20 000."), true);
  assert.equal(scoreAnswer(b20, "Es un billete de 2.000 pesos."), false);
  assert.equal(scoreAnswer(b20, "Veo un billete de 20.000 o de 50.000, no estoy seguro."), false, "hedging between two values is not right");
  assert.equal(scoreAnswer(item("billete-2000"), "Un billete de dos mil pesos."), true);
  assert.equal(scoreAnswer(item("billete-100000"), "Un billete de cien mil."), true);
  assert.equal(scoreAnswer(item("billete-10000"), "Billete de 100.000"), false);
});

test("texts and objects ignore accents and case", () => {
  assert.equal(scoreAnswer(item("letrero-salida"), "Al frente hay un letrero que dice SALIDA."), true);
  assert.equal(scoreAnswer(item("hoja"), "La hoja dice: la probeta está en la mesa."), true);
  assert.equal(scoreAnswer(item("celular"), "Tienes un teléfono en la mano."), true);
  assert.equal(scoreAnswer(item("taza"), "Tienes un vaso azul."), true);
  assert.equal(scoreAnswer(item("llaves"), "No estoy seguro de qué es."), false);
});

test("the summary counts per kind and in total, with the median time", () => {
  const rows = summarizeEval([
    { id: "a", kind: "billete", right: true, ms: 3000 },
    { id: "b", kind: "billete", right: false, ms: 5000 },
    { id: "c", kind: "texto", right: true, ms: 4000 },
    { id: "d", kind: "objeto", right: true },
  ]);
  assert.deepEqual(rows.find((r) => r.kind === "billete"), { kind: "billete", right: 1, of: 2, p50: 3000 });
  assert.deepEqual(rows.at(-1), { kind: "todo", right: 3, of: 4, p50: 4000 });
});
