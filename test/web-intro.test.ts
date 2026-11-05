// The web's first-run introduction (web/app/lib/intro.js): the steps, their buttons, when to show it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { INTRO_STEPS, introButtons, needsIntro } from "../web/app/lib/intro.js";

test("the introduction has one names step and every step has a title and a body", () => {
  assert.equal(INTRO_STEPS.filter((s) => s.names).length, 1);
  for (const s of INTRO_STEPS) assert.ok(s.title && s.body && s.icon, s.key);
  assert.equal(new Set(INTRO_STEPS.map((s) => s.key)).size, INTRO_STEPS.length);
});

test("the buttons: no Atrás on the first step, Empezar and no Omitir on the last", () => {
  assert.deepEqual(introButtons(0, 5), { back: false, next: "Siguiente", skip: true, done: false });
  assert.deepEqual(introButtons(2, 5), { back: true, next: "Siguiente", skip: true, done: false });
  assert.deepEqual(introButtons(4, 5), { back: true, next: "Empezar", skip: false, done: true });
});

test("shown once per browser: until the pref says yes", () => {
  assert.equal(needsIntro(null), true);
  assert.equal(needsIntro(undefined), true);
  assert.equal(needsIntro("no"), true);
  assert.equal(needsIntro("yes"), false);
});
