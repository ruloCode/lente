import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Accounts, FileAccountStore, parseAllowList } from "../src/accounts.ts";
import { open, parseKek, seal } from "../src/seal.ts";

const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const STRANGER = "bbbbbbbb-0000-4000-8000-000000000002";
const kek = parseKek(randomBytes(32).toString("base64"), 1);
const allow = parseAllowList("Owner@Example.com");

test("the allow list: commas or spaces, case-insensitive, empty means nobody", () => {
  assert.deepEqual([...parseAllowList(" a@x.co, B@Y.co  c@z.co ")], ["a@x.co", "b@y.co", "c@z.co"]);
  assert.equal(parseAllowList(undefined).size, 0);
  assert.equal(parseAllowList(" , ").size, 0);
});

test("an email outside the allow list is refused and no account row is written", async () => {
  const store = new FileAccountStore();
  const accounts = new Accounts(store, [kek], allow);
  assert.deepEqual(await accounts.admit(STRANGER, "someone@else.com"), { ok: false, reason: "closed_test" });
  assert.equal(await store.get(STRANGER), undefined);
  assert.deepEqual(await new Accounts(store, [kek], parseAllowList("")).admit(OWNER, "owner@example.com"), { ok: false, reason: "closed_test" });
  assert.equal(await store.get(OWNER), undefined);
});

test("the first sign-in on the list creates one account with its own wrapped key; the next one finds it", async () => {
  const store = new FileAccountStore();
  const accounts = new Accounts(store, [kek], allow);
  const [a, b] = await Promise.all([accounts.admit(OWNER, "OWNER@example.com"), accounts.admit(OWNER, "owner@example.com")]);
  assert.deepEqual([a, b].map((x) => x.ok && x.created).sort(), [false, true]);
  const row = await store.get(OWNER);
  assert.equal(row?.kekVersion, 1);
  assert.deepEqual(await accounts.admit(OWNER, "owner@example.com"), { ok: true, created: false });
  const dek = await accounts.dek(OWNER);
  assert.ok(!Buffer.from(row!.wrappedDek, "base64").includes(dek));
});

test("an account whose email left the list is refused; a cookie or device caller needs an account already", async () => {
  const store = new FileAccountStore();
  await new Accounts(store, [kek], allow).admit(OWNER, "owner@example.com");
  assert.deepEqual(await new Accounts(store, [kek], parseAllowList("")).admit(OWNER, "owner@example.com"), { ok: false, reason: "closed_test" });
  const accounts = new Accounts(store, [kek], allow);
  assert.deepEqual(await accounts.admit(OWNER, undefined), { ok: true, created: false });
  assert.deepEqual(await accounts.admit(STRANGER, undefined), { ok: false, reason: "no_account" });
});

test("the data key survives a restart through the file store and opens what was sealed before", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-accounts-")), "accounts.json");
  const first = new Accounts(new FileAccountStore(file), [kek], allow);
  await first.admit(OWNER, "owner@example.com");
  const ref = { table: "facts", column: "text_enc", userId: OWNER, rowId: "f1" };
  const sealed = seal(await first.dek(OWNER), "dato sintético", ref);
  const dek = await first.dek(OWNER);
  assert.ok(!readFileSync(file, "utf8").includes(dek.toString("base64")));
  const second = new Accounts(new FileAccountStore(file), [kek], allow);
  assert.equal(open(await second.dek(OWNER), sealed, ref).toString(), "dato sintético");
  second.forget(OWNER);
  assert.equal(open(await second.dek(OWNER), sealed, ref).toString(), "dato sintético");
});

test("a wrong KEK cannot unwrap a stored key", async () => {
  const store = new FileAccountStore();
  await new Accounts(store, [kek], allow).admit(OWNER, "owner@example.com");
  await assert.rejects(new Accounts(store, [parseKek(randomBytes(32).toString("base64"), 1)], allow).dek(OWNER), /does not open/);
});
