import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FactStore, keptFacts } from "../src/fact-store.ts";
import { MAX_FACTS, MAX_FACT_CHARS, extractionMessages, newMeeting, notesSchema, validateNotes } from "../src/meetings.ts";
import { briefingMessages, memoryPrefix, replyMessages } from "../src/briefing.ts";

const store = () => new FactStore(join(mkdtempSync(join(tmpdir(), "lente-facts-")), "facts.json"));

test("the schema asks for facts citing real turns, and the prompt asks for Spanish facts", () => {
  const schema = notesSchema(["t1", "t2"]) as any;
  assert.ok(schema.required.includes("facts"));
  assert.equal(schema.properties.facts.maxItems, MAX_FACTS);
  assert.deepEqual(schema.properties.facts.items.properties.evidence.items.enum, ["t1", "t2"]);
  assert.match(extractionMessages(newMeeting("x", 0))[0].content, /durable facts/);
});

test("validateNotes drops facts without a valid turn, trims, caps length and count", () => {
  const long = "x".repeat(300);
  const raw = {
    summary: "s",
    facts: [
      { text: "Ana lleva el release móvil", evidence: ["t1"] },
      { text: "Sin turno", evidence: ["t9"] },
      { text: long, evidence: ["t2"] },
      ...Array.from({ length: 6 }, (_, i) => ({ text: `Hecho ${i}`, evidence: ["t1"] })),
    ],
  };
  const { facts, dropped } = validateNotes(raw, ["t1", "t2"]);
  assert.equal(facts.length, MAX_FACTS);
  assert.equal(facts[0].text, "Ana lleva el release móvil");
  assert.equal(facts[1].text.length, MAX_FACT_CHARS);
  assert.ok(dropped >= 2, "the unsupported fact and the overflow");
  assert.deepEqual(validateNotes({ summary: "s" }, ["t1"]).facts, []);
});

test("facts wait as proposed, are kept or discarded, and persist as text", () => {
  const s = store();
  const added = s.propose("m1", [{ text: "Ana lleva el release", evidence: ["t1"] }, { text: "El cliente quiere precio fijo", evidence: ["t2"] }], 1000);
  assert.equal(added.length, 2);
  assert.equal(s.propose("m1", [{ text: "ana lleva el release", evidence: ["t1"] }], 2000).length, 0, "no duplicates");
  assert.equal(keptFacts(s.list()).length, 0);
  assert.ok(s.keep(added[0].id));
  assert.equal(s.keep(added[0].id), false, "already kept");
  assert.ok(s.remove(added[1].id));
  assert.equal(s.remove("nope"), false);
  assert.deepEqual(keptFacts(s.list()).map((f) => f.text), ["Ana lleva el release"]);
  assert.equal(s.list().length, 1);
});

test("deleting a meeting deletes its facts, kept or not", () => {
  const s = store();
  const [a] = s.propose("m1", [{ text: "A", evidence: ["t1"] }], 1);
  s.propose("m2", [{ text: "B", evidence: ["t1"] }], 2);
  s.keep(a.id);
  assert.equal(s.removeMeeting("m1"), 1);
  assert.deepEqual(s.list().map((f) => f.text), ["B"]);
  s.removeAll();
  assert.deepEqual(s.list(), []);
});

test("a missing or corrupt file reads as no facts", () => {
  const s = store();
  assert.deepEqual(s.list(), []);
});

test("kept facts reach the memory prefix and every prompt built on it; proposed ones never do", () => {
  const s = store();
  const [kept, proposed] = s.propose("m1", [{ text: "Ana lleva el release móvil", evidence: ["t1"] }, { text: "SECRETO propuesto sin revisar", evidence: ["t1"] }], 1);
  s.keep(kept.id);
  const memory = memoryPrefix({ phrases: [], glossary: [], meetings: [], facts: s.list() });
  assert.match(memory, /Ana lleva el release móvil/);
  assert.doesNotMatch(memory, /SECRETO/);
  const prompts = [...replyMessages(memory, "", "q"), ...briefingMessages(memory, "Kickoff", [])].map((m) => m.content).join("\n");
  assert.match(prompts, /Ana lleva el release móvil/);
  assert.doesNotMatch(prompts, /SECRETO/);
  assert.equal(memoryPrefix({ phrases: [], glossary: [], meetings: [], facts: [{ ...proposed }] }), "", "only proposed facts: no memory");
});
