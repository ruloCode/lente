// add-language-coach 1.2: the coach's pure parts. Synthetic sentences only, written for this test.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COACH_LANGUAGES, checkRepeat, coachInstructions, coachLanguage, coachLanguageBias, coachLookPrompt, likelyLanguage, parseNames, seenLine, sentenceLanguage } from "../src/coach.ts";

test("only verified languages open the coach; the bias names the target, then Spanish", () => {
  assert.equal(coachLanguage("pt")?.locale, "pt-BR");
  assert.equal(coachLanguage("fr"), undefined, "French has not passed its check");
  assert.equal(coachLanguage("de"), undefined);
  assert.equal(coachLanguage(undefined), undefined);
  assert.deepEqual(coachLanguageBias(COACH_LANGUAGES.pt), ["Portuguese", "Spanish"]);
});

test("likelyLanguage classifies Spanish, Portuguese, French and English sentences", () => {
  assert.equal(likelyLanguage("¿Cómo se dice tenedor en portugués?"), "es");
  assert.equal(likelyLanguage("Muy bien, ahora dime la palabra otra vez."), "es");
  assert.equal(likelyLanguage("Isso é um garfo. O garfo."), "pt");
  assert.equal(likelyLanguage("Eu quero um café com leite, por favor."), "pt");
  assert.equal(likelyLanguage("Você pode falar mais devagar? Não entendi."), "pt");
  assert.equal(likelyLanguage("Je suis très content, merci beaucoup."), "fr");
  assert.equal(likelyLanguage("C'est la fourchette, sur la table."), "fr");
  assert.equal(likelyLanguage("What is this and where is it?"), "en");
});

test("a sentence mixing Spanish and Portuguese is «unsure», and the tutor speaks it as Spanish", () => {
  const mixed = "Se dice obrigado, y muito bem.";
  assert.equal(likelyLanguage(mixed), "unsure");
  assert.equal(likelyLanguage("garfo"), "unsure", "no function word, no evidence");
  assert.equal(sentenceLanguage(mixed, "pt"), "es");
  assert.equal(sentenceLanguage("Muito bem! Você falou muito bem.", "pt"), "pt");
  assert.equal(sentenceLanguage("Repítelo conmigo, despacio.", "pt"), "es");
});

test("the tutor's instructions carry the band, the target language and Lente's rules", () => {
  const base = { lang: COACH_LANGUAGES.pt, mode: "tutor" as const, names: ["Rulo"], now: Date.UTC(2026, 10, 4, 20), timeZone: "America/Bogota" };
  const a1 = coachInstructions(base);
  assert.match(a1, /nivel A1/, "A1 with no placement");
  assert.match(a1, /portugués/);
  assert.match(a1, /colombiano/);
  assert.match(a1, /pronounce/);
  assert.match(a1, /check_repeat/);
  assert.match(a1, /nunca le digas que se mueva/);
  assert.match(a1, /nunca identifiques a nadie por su cara/);
  assert.match(a1, /no das consejos médicos/);
  assert.match(a1, /nunca mezcles español y portugués/);
  assert.match(coachInstructions({ ...base, band: "B1" }), /nivel B1/);
});

test("the look prompt asks for article + noun lines and keeps the rules on people", () => {
  const p = coachLookPrompt("pt", "A2");
  assert.match(p, /Brazilian Portuguese at level A2/);
  assert.match(p, /at most 3 things/);
  assert.match(p, /Never name a person/);
  assert.match(p, /o garfo = el tenedor/);
});

test("parseNames keeps well-formed lines, at most three, and drops the rest", () => {
  assert.deepEqual(parseNames("o garfo = el tenedor\na xícara = la taza"), [{ text: "o garfo", meaning: "el tenedor" }, { text: "a xícara", meaning: "la taza" }]);
  assert.deepEqual(parseNames("1. **o garfo** = el tenedor.\n- a mesa = la mesa\n- o prato = el plato\n- o copo = el vaso"), [
    { text: "o garfo", meaning: "el tenedor" },
    { text: "a mesa", meaning: "la mesa" },
    { text: "o prato", meaning: "el plato" },
  ]);
  assert.deepEqual(parseNames("?"), []);
  assert.deepEqual(parseNames("Vejo um garfo na mesa."), [], "a sentence is not a name line");
  assert.deepEqual(parseNames("o garfo =\n= la taza\no garfo = el tenedor\nO garfo = el tenedor"), [{ text: "o garfo", meaning: "el tenedor" }]);
  assert.deepEqual(parseNames(`${"x".repeat(80)} = algo`), []);
});

test("the first name in Portuguese is said in a sentence, then alone", () => {
  assert.equal(seenLine({ text: "o garfo", meaning: "el tenedor" }, "pt", true), "Isso é um garfo. O garfo.");
  assert.equal(seenLine({ text: "a xícara", meaning: "la taza" }, "pt", true), "Isso é uma xícara. A xícara.");
  assert.equal(seenLine({ text: "a xícara", meaning: "la taza" }, "pt", false), "A xícara.");
  assert.equal(seenLine({ text: "os óculos", meaning: "las gafas" }, "pt", true), "Os óculos.");
});

test("checkRepeat says whether the transcription held the key words, ignoring case, accents and articles", () => {
  assert.equal(checkRepeat("o garfo", "Garfo", "pt").result, "understood");
  assert.equal(checkRepeat("o garfo", "o gato", "pt").result, "missed");
  assert.deepEqual(checkRepeat("o garfo", "o gato", "pt").missing, ["garfo"]);
  assert.equal(checkRepeat("a xícara", "a xicara", "pt").result, "understood");
  assert.equal(checkRepeat("Eu quero um café com leite", "quero café com leite", "pt").result, "understood");
  assert.equal(checkRepeat("Eu quero um café com leite", "quero", "pt").result, "missed");
});
