import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Accounts, FileAccountStore } from "../src/accounts.ts";
import { TERMS, TERMS_VERSION, needsTerms, needsTermsBody, termsPage, termsRequired, termsView } from "../src/preview-terms.ts";
import { parseKek } from "../src/seal.ts";
import { SupabaseAccounts } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const JUDGE = "bbbbbbbb-0000-4000-8000-00000000000b";
const kek = parseKek(randomBytes(32).toString("base64"), 1);
const gate = (path: string, over: Partial<Parameters<typeof needsTerms>[0]> = {}) => needsTerms({ path, required: true, isOwner: false, acceptedVersion: undefined, ...over });

test("until the current version is accepted every data route waits; the terms, sign-out and account rights do not", () => {
  for (const path of ["/tasks", "/ask", "/events", "/meetings/search", "/devices", "/listen/on", "/device", "/voice", "/sample/delete"]) assert.equal(gate(path), true, path);
  for (const path of ["/terms", "/terms/accept", "/terminos", "/privacidad", "/auth/signout", "/account", "/account/export", "/account/delete", "/"]) assert.equal(gate(path), false, path);
  assert.equal(gate("/tasks", { acceptedVersion: TERMS_VERSION }), false);
  assert.equal(gate("/tasks", { acceptedVersion: "preview-2026-01-01" }), true, "a stale version is asked again");
  assert.equal(gate("/tasks", { isOwner: true }), false, "the owner is never locked out");
  assert.equal(gate("/device", { required: false }), false);
});

test("LENTE_TERMS: required or off; unset follows open sign-up", () => {
  assert.equal(termsRequired(undefined, true), true);
  assert.equal(termsRequired(undefined, false), false);
  assert.equal(termsRequired("required", false), true);
  assert.equal(termsRequired("off", true), false);
});

test("the text says what Lente is, what it keeps, the free-credit clause, deletion and who to write to, in Spanish and English", () => {
  const page = termsPage("terms");
  for (const phrase of ["No es un dispositivo médico ni de movilidad", "créditos gratuitos", "mejorar sus productos", "Borrarla elimina todo", "github.com/ruloCode/lente/issues", "not a medical or mobility device", TERMS_VERSION]) assert.ok(page.includes(phrase), phrase);
  const privacy = termsPage("privacy");
  for (const phrase of ["Audio ni fotos", "sellado con una clave propia", "Audio or photos", "Supabase"]) assert.ok(privacy.includes(phrase), phrase);
  assert.match(page, /<html lang="es">/);
  assert.match(page, /<section lang="en">/);
  assert.equal(TERMS.es.summary.length, TERMS.en.summary.length);
  assert.deepEqual(needsTermsBody(), { needsTerms: true, version: TERMS_VERSION, message: "Antes de seguir, lee y acepta los términos de la prueba.", links: { terms: "/terminos", privacy: "/privacidad" } });
  assert.equal(termsView(undefined).needsTerms, true);
  assert.deepEqual([termsView({ version: TERMS_VERSION, at: 5 }).needsTerms, termsView({ version: TERMS_VERSION, at: 5 }).acceptedAt], [false, 5]);
});

test("an acceptance is kept on the account: the file store across a restart, the Supabase store in accounts.terms_*", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-terms-")), "accounts.json");
  const first = new Accounts(new FileAccountStore(file), [kek], () => ({ ok: true }), () => 1_000);
  await first.admit(JUDGE, "probe-judge@example.com");
  assert.equal(await first.terms(JUDGE), undefined);
  assert.deepEqual(await first.acceptTerms(JUDGE, TERMS_VERSION), { version: TERMS_VERSION, at: 1_000 });
  assert.deepEqual(await new Accounts(new FileAccountStore(file), [kek], () => ({ ok: true })).terms(JUDGE), { version: TERMS_VERSION, at: 1_000 });

  const fake = fakePostgrest();
  const accounts = new Accounts(new SupabaseAccounts(fake.rest), [kek], () => ({ ok: true }), () => Date.parse("2026-11-04T15:00:00Z"));
  await accounts.admit(JUDGE, "probe-judge@example.com");
  assert.equal(await accounts.terms(JUDGE), undefined);
  await accounts.acceptTerms(JUDGE, TERMS_VERSION);
  const row = fake.tables.get("accounts")!.find((r) => r.user_id === JUDGE)!;
  assert.deepEqual([row.terms_version, row.terms_accepted_at], [TERMS_VERSION, "2026-11-04T15:00:00.000Z"]);
  assert.deepEqual(await new SupabaseAccounts(fake.rest).terms(JUDGE), { version: TERMS_VERSION, at: Date.parse("2026-11-04T15:00:00Z") });
  await assert.rejects(new SupabaseAccounts(fake.rest).acceptTerms("cccccccc-0000-4000-8000-00000000000c", { version: TERMS_VERSION, at: 1 }), /no account row/);
});
