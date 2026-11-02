// add-accounts 6.5: an account's runtime on the sealed stores. The real hub in accounts mode talks
// to a fake PostgREST over HTTP (with test-only keys and synthetic text): what the user does lands
// in the database sealed, survives a restart, and never shows up for another user.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { servePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const NAME = "PROBE-NAME-Alicia";
const TITLE = "PROBE-TITLE-cohete";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KEK = randomBytes(32).toString("base64");
let db: Awaited<ReturnType<typeof servePostgrest>>;
let hub: ChildProcess | undefined;
let base = "";
let dataDir = "";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

const token = (sub: string, email: string) => {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${db.url}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
};
const as = (sub: string, email: string) => ({ Authorization: `Bearer ${token(sub, email)}` });
const ALICE_H = () => as(ALICE, "alice@example.com");
const BOB_H = () => as(BOB, "bob@example.com");

async function startHub(): Promise<void> {
  const port = await freePort();
  base = `http://localhost:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: KEK, LENTE_ALLOWED_EMAILS: "alice@example.com bob@example.com", PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dataDir },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/health`).then((r) => r.status > 0, () => false)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("the hub did not start");
}

async function stopHub(): Promise<void> {
  if (!hub) return;
  const gone = new Promise((r) => hub!.once("exit", r));
  hub.kill();
  await gone;
  hub = undefined;
}

/** The first event of a kind on a user's stream. */
async function firstEvent(headers: Record<string, string>, kind: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events`, { headers, signal: ctrl.signal });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream ended before a ${kind} event`);
      buffer += new TextDecoder().decode(value);
      for (const chunk of buffer.split("\n\n")) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as Record<string, unknown>;
        if (event.kind === kind) return event;
      }
    }
  } finally {
    ctrl.abort();
  }
}

before(async () => {
  db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] });
  dataDir = mkdtempSync(join(tmpdir(), "lente-sealed-"));
  await startHub();
});

after(async () => {
  await stopHub();
  db?.close();
});

test("what a signed-in user does lands sealed in the database, and survives a restart", async () => {
  assert.equal((await fetch(`${base}/profile`, { method: "POST", headers: ALICE_H(), body: JSON.stringify({ names: NAME }) })).status, 204);
  assert.equal((await fetch(`${base}/meeting/start`, { method: "POST", headers: ALICE_H(), body: JSON.stringify({ title: TITLE }) })).status, 204);
  assert.equal((await fetch(`${base}/meeting/end`, { method: "POST", headers: ALICE_H() })).status, 204);

  const tables = db.fake.tables;
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 30));
    return check();
  };
  assert.ok(await until(() => (tables.get("meetings") ?? []).some((m) => m.user_id === ALICE && m.status === "too-short")), "the meeting reached the database");
  assert.ok((tables.get("accounts") ?? []).some((a) => a.user_id === ALICE && a.display_name_enc));
  assert.equal((tables.get("user_keys") ?? []).filter((k) => k.user_id === ALICE).length, 1);
  assert.equal((tables.get("kek_canaries") ?? []).length, 1);
  const dump = db.fake.dump();
  for (const probe of [NAME, TITLE]) {
    assert.ok(!dump.includes(probe), `${probe} reached the database in the clear`);
    assert.ok(!dump.includes(Buffer.from(probe).toString("hex")), `${probe} reached the database as hex`);
  }

  // Bob sees none of it.
  const bobMeetings = await firstEvent(BOB_H(), "meetings");
  assert.deepEqual(bobMeetings.items, []);
  assert.ok(!JSON.stringify(await firstEvent(BOB_H(), "status")).includes("PROBE"));

  // A restart: the runtime opens Alice's stores from the database, with the same KEK.
  await stopHub();
  await startHub();
  const meetings = (await firstEvent(ALICE_H(), "meetings")).items as { title: string; status: string }[];
  assert.deepEqual(meetings.map((m) => [m.title, m.status]), [[TITLE, "too-short"]]);
  assert.deepEqual((await firstEvent(ALICE_H(), "status")).names, [NAME]);
});

test("a fact kept from the phone is sealed and scoped: Bob cannot keep or see it", async () => {
  // A proposed fact as the notes would leave it, sealed through the hub's own store code.
  const { openUserStores } = await import("../src/supabase-stores.ts");
  const { Accounts, parseAllowList } = await import("../src/accounts.ts");
  const { SupabaseAccounts } = await import("../src/supabase-stores.ts");
  const { parseKek } = await import("../src/seal.ts");
  const { SupabaseRest } = await import("../src/supabase-rest.ts");
  const rest = new SupabaseRest({ url: db.url, secretKey: "sb_secret_fake" });
  const dek = await new Accounts(new SupabaseAccounts(rest), [parseKek(KEK, 1)], parseAllowList("")).dek(ALICE);
  const [fact] = await (await openUserStores(rest, ALICE, dek)).facts.propose("m20261101120000", [{ text: "PROBE-FACT-girasol", evidence: [] }], Date.now());
  await stopHub();
  await startHub();
  assert.equal((await fetch(`${base}/facts/keep`, { method: "POST", headers: BOB_H(), body: JSON.stringify({ id: fact!.id }) })).status, 404);
  assert.deepEqual(await (await fetch(`${base}/facts`, { headers: BOB_H() })).json(), { facts: [] });
  assert.equal((await fetch(`${base}/facts/keep`, { method: "POST", headers: ALICE_H(), body: JSON.stringify({ id: fact!.id }) })).status, 204);
  const kept = (await (await fetch(`${base}/facts`, { headers: ALICE_H() })).json()) as { facts: { text: string; status: string }[] };
  assert.deepEqual(kept.facts.map((f) => [f.text, f.status]), [["PROBE-FACT-girasol", "kept"]]);
  for (let i = 0; i < 100 && db.fake.tables.get("facts")![0]!.status !== "kept"; i++) await new Promise((r) => setTimeout(r, 30));
  assert.equal(db.fake.tables.get("facts")![0]!.status, "kept");
  assert.ok(!db.fake.dump().includes("PROBE-FACT"));
});
