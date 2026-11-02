// add-accounts 9.1: export and delete. Against the fake PostgREST: the deletion order (the key
// first), another user untouched, and an export that holds the user's own memory in the clear and
// nobody else's; then on the real hub. Synthetic text, test-only keys.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { after, test } from "node:test";
import { DELETE_ORDER, deleteAccount, exportAccount } from "../src/account-rights.ts";
import type { Meeting } from "../src/meetings.ts";
import { newDek } from "../src/seal.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest, servePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const meeting = (title: string): Meeting => ({ id: "m20261101100000", title, startedAt: Date.UTC(2026, 10, 1, 10), status: "done", turns: [{ id: "t1", at: Date.UTC(2026, 10, 1, 10, 1), text: `${title} turno` }] });

async function seed(fake: ReturnType<typeof fakePostgrest>, userId: string, title: string) {
  const dek = newDek();
  const s = await openUserStores(fake.rest, userId, dek);
  const db = fake.rest.forUser(userId);
  await db.insert("user_keys", [{ kek_version: 1, wrapped_dek: "\\x01" }]);
  await db.insert("accounts", [{ locale: "es-CO" }]);
  await s.meetings.save(meeting(title));
  await s.facts.propose("m20261101100000", [{ text: `${title} hecho`, evidence: ["t1"] }], Date.now());
  await s.day.add({ at: Date.now(), kind: "turn", text: `${title} día` });
  await s.digests.put({ scope: "day", periodStart: "2026-11-01", text: `${title} resumen`, sources: ["m20261101100000"], createdAt: Date.now() });
  await db.insert("devices", [{ id: "dddddddd-0000-4000-8000-00000000000" + (userId === ALICE ? "1" : "2"), kind: "clip", label: "Clip", token_hash: `\\x${userId === ALICE ? "aa" : "bb"}` }]);
  return dek;
}

const rowsOf = (fake: ReturnType<typeof fakePostgrest>, userId: string) => [...fake.tables.values()].flat().filter((r) => r.user_id === userId).length;

test("deleting an account removes the key first, then every row, then the sign-in; another user is untouched", async () => {
  const fake = fakePostgrest();
  await seed(fake, ALICE, "PROBE-ALICE");
  await seed(fake, BOB, "PROBE-BOB");
  const bobBefore = rowsOf(fake, BOB);
  const events: string[] = [];
  fake.requests.length = 0;
  const steps = await deleteAccount(fake.rest, ALICE, { forgetInMemory: async (id) => void events.push(`forget ${id}`), deleteSignIn: async (id) => void events.push(`auth ${id}`) });
  assert.deepEqual(steps, ["user_keys", "memory", ...DELETE_ORDER, "auth"]);
  assert.deepEqual(events, [`forget ${ALICE}`, `auth ${ALICE}`]);
  assert.equal(fake.requests[0]!.table, "user_keys", "the key goes first");
  assert.equal(fake.requests[0]!.method, "DELETE");
  for (const r of fake.requests) assert.equal(r.search.get("user_id"), `eq.${ALICE}`, `${r.method} ${r.table} was scoped to Alice`);
  assert.equal(rowsOf(fake, ALICE), 0);
  assert.equal(rowsOf(fake, BOB), bobBefore);
});

test("the export holds the user's own memory, readable, and nothing of anyone else's", async () => {
  const fake = fakePostgrest();
  const dek = await seed(fake, ALICE, "PROBE-ALICE");
  await seed(fake, BOB, "PROBE-BOB");
  let text = "";
  const sink = new Writable({ write: (chunk, _enc, done) => ((text += chunk), done()) });
  await exportAccount(fake.rest, ALICE, dek, sink);
  const doc = JSON.parse(text) as Record<string, unknown>;
  assert.equal(doc.format, "lente-export/v1");
  assert.equal((doc.meetings as Meeting[])[0]!.title, "PROBE-ALICE");
  assert.equal((doc.facts as { text: string }[])[0]!.text, "PROBE-ALICE hecho");
  assert.equal((doc.day as { text: string }[])[0]!.text, "PROBE-ALICE día");
  assert.equal((doc.digests as { text: string }[])[0]!.text, "PROBE-ALICE resumen");
  assert.equal((doc.devices as unknown[]).length, 1);
  assert.ok(!text.includes("PROBE-BOB"));
  assert.ok(!text.includes("token_hash"));
});

// --- On the real hub ----------------------------------------------------------------------------

const children: ChildProcess[] = [];
const closers: (() => void)[] = [];
after(() => {
  for (const c of children) c.kill();
  for (const c of closers) c();
});

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

test("on the hub: export downloads the memory; delete needs confirmation, then the account, its devices and its key are gone", { timeout: 30_000 }, async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const deletedSignIns: string[] = [];
  const db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] }, (path) => {
    const m = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(path);
    if (!m) return undefined;
    deletedSignIns.push(m[1]!);
    return { status: 200, body: {} };
  });
  closers.push(db.close);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: randomBytes(32).toString("base64"), LENTE_ALLOWED_EMAILS: "alice@example.com bob@example.com", PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-rights-")) },
    stdio: "ignore",
  });
  children.push(hub);
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.status > 0, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  const as = (sub: string, email: string) => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${db.url}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return { Authorization: `Bearer ${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}` };
  };
  const alice = as(ALICE, "alice@example.com");
  const bob = as(BOB, "bob@example.com");

  await fetch(`${base}/meeting/start`, { method: "POST", headers: alice, body: JSON.stringify({ title: "PROBE-EXPORT-titulo" }) });
  await fetch(`${base}/meeting/end`, { method: "POST", headers: alice });
  await fetch(`${base}/profile`, { method: "POST", headers: bob, body: JSON.stringify({ names: "Bob Sintético" }) });
  const clip = (await (await fetch(`${base}/devices`, { method: "POST", headers: alice, body: JSON.stringify({ label: "Clip" }) })).json()) as { token: string };

  const exported = await fetch(`${base}/account/export`, { headers: alice });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-disposition")!, /lente-export\.json/);
  const doc = (await exported.json()) as { meetings: { title: string }[]; devices: unknown[] };
  assert.deepEqual(doc.meetings.map((m) => m.title), ["PROBE-EXPORT-titulo"]);
  assert.equal(doc.devices.length, 1);

  assert.equal((await fetch(`${base}/account/delete`, { method: "POST", headers: alice, body: "{}" })).status, 400, "deletion needs confirmation");
  const bobRows = rowsOf(db.fake, BOB);
  assert.equal((await fetch(`${base}/account/delete`, { method: "POST", headers: alice, body: JSON.stringify({ confirm: true }) })).status, 204);
  assert.deepEqual(deletedSignIns, [ALICE]);
  assert.equal(rowsOf(db.fake, ALICE), 0);
  assert.equal(rowsOf(db.fake, BOB), bobRows, "Bob's data did not change");

  // Her clip is refused; signing in again starts a new, empty account.
  const upgrade = await new Promise<number>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/device?token=${clip.token}`);
    ws.onopen = () => (ws.close(), resolve(101));
    ws.onerror = () => resolve(401);
  });
  assert.equal(upgrade, 401);
  assert.deepEqual(await (await fetch(`${base}/facts`, { headers: alice })).json(), { facts: [] });
  assert.equal((db.fake.tables.get("user_keys") ?? []).filter((k) => k.user_id === ALICE).length, 1, "a fresh key for the new account");
});
