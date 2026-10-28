import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type AddressTurn, addressMessages, isAddressed, mentionsName, parseNames, parseYesNo } from "../src/addressing.ts";
import { ProfileStore } from "../src/profile.ts";

const t = (speaker: string, text: string, startMs: number, endMs = startMs + 3000): AddressTurn => ({ speaker, text, startMs, endMs });
const NAMES = ["Andrés", "Andy"];

test("named: a colleague says the wearer's name, no model needed", () => {
  const d = isAddressed(t("B", "Andres, can you ship the beta by Friday?", 10_000), [], "A", NAMES);
  assert.deepEqual(d, { verdict: "addressed", rule: "name" });
});

test("named: works before the wearer is identified", () => {
  assert.equal(isAddressed(t("B", "Hey ANDY, are you there?", 0), [], undefined, NAMES).rule, "name");
});

test("the wearer's own question is never addressed to them, even with their name in it", () => {
  const d = isAddressed(t("A", "Andrés, what was I saying?", 5000), [t("B", "ok", 0)], "A", NAMES);
  assert.deepEqual(d, { verdict: "not-addressed", rule: "wearer" });
});

test("reply: the question right after the wearer spoke", () => {
  const history = [t("B", "How was the demo?", 0), t("A", "It went well.", 4000, 7000)];
  const d = isAddressed(t("B", "And did they like the price?", 9000), history, "A", NAMES);
  assert.deepEqual(d, { verdict: "addressed", rule: "reply" });
});

test("reply: not after more than 20 s of silence", () => {
  const history = [t("A", "It went well.", 0, 3000)];
  const d = isAddressed(t("B", "And the price?", 30_000), history, "A", NAMES);
  assert.equal(d.verdict, "ask");
});

test("reply: needs the wearer's turn to be the one right before", () => {
  const history = [t("A", "It went well.", 0, 3000), t("B", "Great.", 4000, 5000)];
  assert.equal(isAddressed(t("B", "Who builds the deck?", 6000), history, "A", NAMES).verdict, "ask");
});

test("someone else: three voices and no name is not for the wearer", () => {
  const history = [t("B", "Monica, status?", 0), t("A", "Same here.", 4000), t("C", "Almost done.", 8000)];
  const d = isAddressed(t("B", "Monica, can you send the report?", 12_000), history, "A", NAMES);
  assert.deepEqual(d, { verdict: "not-addressed", rule: "none" });
});

test("ambiguous: two voices, no name, wearer did not just speak", () => {
  const history = [t("B", "Let's review the plan.", 0), t("B", "First, the budget.", 4000)];
  const d = isAddressed(t("B", "Do we have the numbers?", 8000), history, "A", NAMES);
  assert.deepEqual(d, { verdict: "ask", rule: "ambiguous" });
});

test("unknown wearer without a name asks the model", () => {
  assert.equal(isAddressed(t("B", "Can you hear me?", 0), [], undefined, NAMES).verdict, "ask");
});

test("name matching is whole-word", () => {
  assert.equal(mentionsName("Handy tools for everybody", ["Andy"]), false);
  assert.equal(mentionsName("Mary Ann, are you free?", ["Mary Ann"]), true);
  assert.equal(mentionsName("anything", []), false);
});

test("parseNames trims, dedupes ignoring accents and caps the list", () => {
  assert.deepEqual(parseNames(" Andrés, andres ;Andy\n\n"), ["Andrés", "Andy"]);
  assert.equal(parseNames("a,b,c,d,e,f,g,h,i,j").length, 8);
  assert.deepEqual(parseNames(""), []);
});

test("parseYesNo reads short answers in both languages", () => {
  assert.equal(parseYesNo("Yes."), true);
  assert.equal(parseYesNo("  no, it was for Sam"), false);
  assert.equal(parseYesNo("Sí"), true);
  assert.equal(parseYesNo("Maybe"), undefined);
  assert.equal(parseYesNo(""), undefined);
});

test("the model prompt marks the wearer and names", () => {
  const messages = addressMessages(t("B", "Do you agree?", 8000), [t("A", "I think so.", 0)], "A", NAMES);
  assert.match(messages[1].content, /called Andrés \/ Andy/);
  assert.match(messages[1].content, /WEARER: I think so\./);
  assert.match(messages[1].content, /B: Do you agree\?/);
});

test("profile names survive a restart", () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-profile-")), "profile.json");
  assert.deepEqual(new ProfileStore(file).names, []);
  new ProfileStore(file).setNames("Rulo, Raúl");
  assert.deepEqual(new ProfileStore(file).names, ["Rulo", "Raúl"]);
});
