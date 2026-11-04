// ship-hackathon 3.2: the web app's side of the preview terms and «Borrar ejemplo» (web/app/lib/terms.js).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TERMS_LINKS, TERMS_STATUS, TERMS_SUMMARY, acceptBody, sampleDeleteResult, sessionNeedsTerms, termsGate } from "../web/app/lib/terms.js";

test("only a 428 with needsTerms: true opens the terms screen", () => {
  assert.equal(TERMS_STATUS, 428);
  assert.deepEqual(termsGate(428, { needsTerms: true }), { version: null });
  assert.deepEqual(termsGate(428, { needsTerms: true, version: "preview-2026-11-04" }), { version: "preview-2026-11-04" });
  assert.deepEqual(termsGate(428, { needsTerms: true, termsVersion: "preview-2026-11-04" }), { version: "preview-2026-11-04" });
  for (const [status, body] of [
    [428, null],
    [428, {}],
    [428, { needsTerms: "yes" }],
    [428, "needsTerms"],
    [401, { needsTerms: true }],
    [403, { needsTerms: true }],
    [200, { needsTerms: true }],
    [429, { error: "Por hoy llegaste al límite de la prueba." }],
  ] as const) {
    assert.equal(termsGate(status, body), null, `${status} ${JSON.stringify(body)}`);
  }
});

test("a session answer may carry needsTerms itself", () => {
  assert.equal(sessionNeedsTerms({ mode: "accounts", signedIn: true, needsTerms: true }), true);
  assert.equal(sessionNeedsTerms({ mode: "accounts", signedIn: true }), false);
  assert.equal(sessionNeedsTerms(null), false);
});

test("«Acepto» sends the version the hub named, or nothing", () => {
  assert.deepEqual(acceptBody({ version: "preview-2026-11-04" }), { version: "preview-2026-11-04" });
  assert.deepEqual(acceptBody({ version: null }), {});
  assert.deepEqual(acceptBody(null), {});
});

test("the summary covers what design decision 4 asks, and the links are the hub's pages", () => {
  const text = TERMS_SUMMARY.join(" ");
  for (const needle of [/prototipo/, /médico ni de movilidad/, /cifrada con una llave solo tuya/, /audio y las fotos no se guardan/, /créditos gratuitos/, /No compartas nada sensible/, /borrar tu cuenta/]) assert.match(text, needle);
  assert.deepEqual(TERMS_LINKS, { terms: "/terminos", privacy: "/privacidad" });
});

test("«Borrar ejemplo»: the answer in Spanish for each outcome", () => {
  assert.deepEqual(sampleDeleteResult({ ok: true, status: 200, body: { ok: true } }), { ok: true, text: "Ejemplo borrado. Lo tuyo sigue ahí." });
  assert.deepEqual(sampleDeleteResult({ ok: true, status: 200, body: { removed: 0 } }), { ok: true, text: "No quedaba ningún ejemplo por borrar." });
  assert.equal(sampleDeleteResult({ ok: false, status: 404, body: null }).ok, false);
  assert.match(sampleDeleteResult({ ok: false, status: 500, body: null }).text, /No se pudo borrar/);
});

test("the app boots through the terms check and Ajustes offers «Borrar ejemplo»", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(`../web/app/${path}`, import.meta.url)), "utf8");
  const main = read("main.js");
  assert.match(main, /pendingTerms\(\)/);
  assert.ok(main.indexOf("pendingTerms()") < main.indexOf("mountApp(root)"), "the terms check runs before the app mounts");
  assert.match(read("views/settings.js"), /post\("\/sample\/delete"\)/);
  assert.match(read("views/terms.js"), /post\("\/terms\/accept", acceptBody\(gate\)\)/);
});
