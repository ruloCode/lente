import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { KEY_BYTES, type SealRef, SealError, newDek, open, openJson, openText, parseKek, seal, sealJson, unwrapDek, wrapDek } from "../src/seal.ts";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const ref = (over: Partial<SealRef> = {}): SealRef => ({ table: "meeting_turns", column: "text_enc", userId: ALICE, rowId: "m1:3", ...over });
const kek = (version = 1) => parseKek(randomBytes(KEY_BYTES).toString("base64"), version);

test("round trip: text, JSON and an empty string come back as they went in", () => {
  const dek = newDek();
  assert.equal(openText(dek, seal(dek, "¿Cuándo entregamos el informe?", ref()), ref()), "¿Cuándo entregamos el informe?");
  assert.equal(openText(dek, seal(dek, "", ref()), ref()), "");
  const notes = { summary: "s", decisions: ["d"] };
  assert.deepEqual(openJson(dek, sealJson(dek, notes, ref({ table: "meeting_notes", column: "body_enc" })), ref({ table: "meeting_notes", column: "body_enc" })), notes);
});

test("the same value sealed twice gives different bytes (fresh nonce), with the layout version first", () => {
  const dek = newDek();
  const a = seal(dek, "hola", ref());
  const b = seal(dek, "hola", ref());
  assert.notDeepEqual(a, b);
  assert.equal(a[0], 1);
  assert.equal(a.length, 1 + 12 + 4 + 16);
  assert.ok(!a.includes(Buffer.from("hola")));
});

test("tampered bytes fail to open, wherever the flip is", () => {
  const dek = newDek();
  const sealed = seal(dek, "texto de prueba", ref());
  for (const at of [1, 13, sealed.length - 1]) {
    const bad = Buffer.from(sealed);
    bad[at] ^= 0x01;
    assert.throws(() => open(dek, bad, ref()), SealError);
  }
  assert.throws(() => open(dek, sealed.subarray(0, 20), ref()), /too short/);
  const otherVersion = Buffer.from(sealed);
  otherVersion[0] = 9;
  assert.throws(() => open(dek, otherVersion, ref()), /layout version 9/);
});

test("a value moved to another row, column, table or user does not open", () => {
  const dek = newDek();
  const sealed = seal(dek, "texto", ref());
  for (const moved of [ref({ rowId: "m1:4" }), ref({ column: "speaker_enc" }), ref({ table: "day_entries" }), ref({ userId: BOB })]) {
    assert.throws(() => open(dek, sealed, moved), SealError);
  }
});

test("another user's key does not open the value, and the error names the place, not the content", () => {
  const sealed = seal(newDek(), "secreto de la reunión", ref());
  assert.throws(() => open(newDek(), sealed, ref()), (e: Error) => e instanceof SealError && e.message.includes("meeting_turns.text_enc") && !e.message.includes("secreto"));
});

test("a DEK wraps and unwraps under its KEK, bound to its user and version", () => {
  const k1 = kek(1);
  const dek = newDek();
  const wrapped = wrapDek(dek, k1, ALICE);
  assert.ok(!wrapped.includes(dek));
  assert.deepEqual(unwrapDek(wrapped, 1, [k1], ALICE), dek);
  assert.throws(() => unwrapDek(wrapped, 1, [k1], BOB), SealError);
  assert.throws(() => unwrapDek(wrapped, 1, [kek(1)], ALICE), SealError);
});

test("an unknown KEK version is refused by name, and rotation keeps both versions readable", () => {
  const k1 = kek(1);
  const k2 = kek(2);
  const dek = newDek();
  const old = wrapDek(dek, k1, ALICE);
  assert.throws(() => unwrapDek(old, 1, [k2], ALICE), /no KEK loaded for version 1 \(loaded: 2\)/);
  assert.throws(() => unwrapDek(old, 2, [k1, k2], ALICE), SealError);
  const rewrapped = wrapDek(unwrapDek(old, 1, [k1, k2], ALICE), k2, ALICE);
  assert.deepEqual(unwrapDek(rewrapped, 2, [k1, k2], ALICE), dek);
});

test("parseKek refuses a missing, short or badly versioned key", () => {
  assert.throws(() => parseKek(undefined, 1), /not set/);
  assert.throws(() => parseKek(randomBytes(16).toString("base64"), 1), /32 bytes/);
  assert.throws(() => parseKek(randomBytes(32).toString("base64"), 0), /version/);
  assert.equal(parseKek(randomBytes(32).toString("base64"), 3).version, 3);
});

test("seal references with an empty part or a slash are refused (they would make the AAD ambiguous)", () => {
  const dek = newDek();
  assert.throws(() => seal(dek, "x", ref({ rowId: "" })), /rowId/);
  assert.throws(() => seal(dek, "x", ref({ rowId: "a/b" })), /rowId/);
});
