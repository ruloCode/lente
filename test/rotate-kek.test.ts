// add-accounts 2.4: KEK rotation against the fake PostgREST. Two accounts with memory under KEK v1;
// after rotating to v2 every key opens under v2 alone, the memory still opens, and no content row
// was written. Synthetic text, keys made in the test.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { rotateKeys } from "../scripts/rotate-kek.ts";
import { withRotatedKek } from "../scripts/new-kek.ts";
import { Accounts } from "../src/accounts.ts";
import { keksFromEnv } from "../src/kek-check.ts";
import type { Kek } from "../src/seal.ts";
import { openUserStores, SupabaseAccounts, supabaseCanaries } from "../src/supabase-stores.ts";
import { checkKekAtStart } from "../src/kek-check.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const kek = (version: number): Kek => ({ version, key: randomBytes(32) });

async function setup() {
  const fake = fakePostgrest();
  const v1 = kek(1);
  await checkKekAtStart([v1], supabaseCanaries(fake.rest));
  const accounts = new Accounts(new SupabaseAccounts(fake.rest), [v1], new Set(["alice@example.com", "bob@example.com"]));
  for (const [id, email, title] of [[ALICE, "alice@example.com", "PROBE-ROTATE-ALICE"], [BOB, "bob@example.com", "PROBE-ROTATE-BOB"]] as const) {
    await accounts.admit(id, email);
    const stores = await openUserStores(fake.rest, id, await accounts.dek(id));
    await stores.meetings.save({ id: "m20261102090000", title, startedAt: Date.UTC(2026, 10, 2, 9), status: "done", turns: [{ id: "t1", at: Date.UTC(2026, 10, 2, 9, 1), text: `${title} turno` }] });
  }
  return { fake, v1 };
}

const content = (fake: ReturnType<typeof fakePostgrest>) => JSON.stringify([...fake.tables.entries()].filter(([t]) => t !== "user_keys" && t !== "kek_canaries"));

test("rotating re-wraps every key under the new version, the memory still opens, and no content is rewritten", async () => {
  const { fake, v1 } = await setup();
  const before = content(fake);
  const v2 = kek(2);
  fake.requests.length = 0;
  const report = await rotateKeys(fake.rest, [v2, v1], Date.UTC(2026, 10, 2, 12));
  assert.deepEqual(report, { version: 2, users: 2, rewrapped: 2, alreadyCurrent: 0 });
  assert.equal(content(fake), before, "content rows are untouched");
  const writes = fake.requests.filter((r) => r.method !== "GET");
  assert.deepEqual([...new Set(writes.map((r) => r.table))].sort(), ["kek_canaries", "user_keys"]);
  for (const row of fake.tables.get("user_keys")!) {
    assert.equal(row.kek_version, 2);
    assert.equal(row.rotated_at, "2026-11-02T12:00:00.000Z");
  }
  // A hub with only the new KEK opens both memories.
  const after = new Accounts(new SupabaseAccounts(fake.rest), [v2], new Set());
  for (const [id, title] of [[ALICE, "PROBE-ROTATE-ALICE"], [BOB, "PROBE-ROTATE-BOB"]] as const) {
    const stores = await openUserStores(fake.rest, id, await after.dek(id));
    assert.deepEqual((await stores.meetings.list()).map((m) => m.title), [title]);
  }
  // Running it again changes nothing.
  assert.deepEqual(await rotateKeys(fake.rest, [v2, v1]), { version: 2, users: 2, rewrapped: 0, alreadyCurrent: 2 });
});

test("a wrong previous KEK stops the rotation before any key changes", async () => {
  const { fake } = await setup();
  const keys = JSON.stringify(fake.tables.get("user_keys"));
  await assert.rejects(rotateKeys(fake.rest, [kek(2), kek(1)]), /canary check failed for version 1.*nothing was changed/);
  assert.equal(JSON.stringify(fake.tables.get("user_keys")), keys);
  assert.deepEqual(fake.tables.get("kek_canaries")!.map((r) => r.kek_version), [1], "no canary is sealed for the new version");
});

test("without LENTE_KEK_PREVIOUS there is nothing to rotate from", async () => {
  const { fake } = await setup();
  await assert.rejects(rotateKeys(fake.rest, [kek(2)]), /LENTE_KEK_PREVIOUS/);
});

test("new-kek --rotate moves the key to LENTE_KEK_PREVIOUS and bumps the version; the hub loads both", () => {
  const old = randomBytes(32).toString("base64");
  const fresh = randomBytes(32);
  const { text, version } = withRotatedKek(`A=1\n# Key-encryption key\nLENTE_KEK=${old}\nLENTE_KEK_VERSION=1\n`, fresh);
  assert.equal(version, 2);
  assert.match(text, /^A=1\n# Key-encryption key\n/);
  const env = Object.fromEntries(text.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const keks = keksFromEnv(env);
  assert.deepEqual(keks.map((k) => k.version), [2, 1]);
  assert.ok(keks[0]!.key.equals(fresh));
  assert.equal(keks[1]!.key.toString("base64"), old);
  assert.throws(() => withRotatedKek(text, randomBytes(32)), /already set/);
  assert.throws(() => withRotatedKek("A=1\n", randomBytes(32)), /nothing to rotate/);
});
