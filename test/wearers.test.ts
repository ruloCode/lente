// add-accounts 6.1: two users on one hub, each with their own runtime; one's events never reach the
// other. Starts the real hub in accounts mode against a local JWKS, with test-only keys and synthetic
// text, and follows both users' event streams.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
let jwks: Server;
let hub: ChildProcess;
let base = "";
let issuer = "";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

function token(sub: string, email: string): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${issuer}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

const auth = (sub: string, email: string) => ({ Authorization: `Bearer ${token(sub, email)}` });

/** Follows a user's /events and collects every event until stopped. */
async function follow(sub: string, email: string) {
  const ctrl = new AbortController();
  const events: Record<string, unknown>[] = [];
  const res = await fetch(`${base}/events`, { headers: auth(sub, email), signal: ctrl.signal });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  let buffer = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += new TextDecoder().decode(value);
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          if (chunk.startsWith("data: ")) events.push(JSON.parse(chunk.slice(6)) as Record<string, unknown>);
        }
      }
    } catch {
      // aborted
    }
  })();
  return { events, stop: () => ctrl.abort() };
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
};

before(async () => {
  jwks = createServer((_req, res) => res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] })));
  await new Promise<void>((ok) => jwks.listen(0, ok));
  issuer = `http://localhost:${(jwks.address() as AddressInfo).port}`;
  const webPort = await freePort();
  base = `http://localhost:${webPort}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: issuer, LENTE_KEK: randomBytes(32).toString("base64"), LENTE_ALLOWED_EMAILS: "alice@example.com bob@example.com", LENTE_MAX_LISTENING: "1", PILOT_WEB_PORT: String(webPort), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-wearers-")) },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/health`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("the hub did not start");
});

after(() => {
  hub?.kill();
  jwks?.close();
});

test("two users each get their own state, and one's events never reach the other", async () => {
  const alice = await follow(ALICE, "alice@example.com");
  const bob = await follow(BOB, "bob@example.com");
  assert.ok(await until(() => alice.events.some((e) => e.kind === "status") && bob.events.some((e) => e.kind === "status")));

  // Alice sets her names and opens a meeting; Bob changes his mode.
  assert.equal((await fetch(`${base}/profile`, { method: "POST", headers: auth(ALICE, "alice@example.com"), body: JSON.stringify({ names: "Alicia Sintética" }) })).status, 204);
  assert.equal((await fetch(`${base}/meeting/start`, { method: "POST", headers: auth(ALICE, "alice@example.com"), body: JSON.stringify({ title: "Reunión sintética de Alice" }) })).status, 204);
  assert.equal((await fetch(`${base}/assist-mode/record`, { method: "POST", headers: auth(BOB, "bob@example.com") })).status, 204);

  const statusWith = (events: Record<string, unknown>[], pick: (s: Record<string, unknown>) => boolean) => events.some((e) => e.kind === "status" && pick(e));
  assert.ok(await until(() => statusWith(alice.events, (s) => JSON.stringify(s.names).includes("Alicia") && (s.meeting as { title?: string } | null)?.title === "Reunión sintética de Alice")));
  assert.ok(await until(() => statusWith(bob.events, (s) => s.assistMode === "record")));
  await new Promise((r) => setTimeout(r, 200));

  const aliceText = JSON.stringify(alice.events);
  const bobText = JSON.stringify(bob.events);
  assert.ok(!bobText.includes("Alicia") && !bobText.includes("Reunión sintética de Alice"), "Bob saw Alice's events");
  assert.ok(!statusWith(alice.events, (s) => s.assistMode === "record"), "Alice saw Bob's mode change");
  assert.ok(aliceText.includes("Alicia"));

  // Their stored memory is apart too.
  const facts = async (sub: string, email: string) => (await (await fetch(`${base}/facts`, { headers: auth(sub, email) })).json()) as { facts: unknown[] };
  assert.deepEqual(await facts(BOB, "bob@example.com"), { facts: [] });
  alice.stop();
  bob.stop();
});

test("a request without a valid token reaches no runtime", async () => {
  assert.equal((await fetch(`${base}/profile`, { method: "POST", body: JSON.stringify({ names: "Nadie" }) })).status, 401);
  assert.equal((await fetch(`${base}/events`, { headers: { Authorization: "Bearer a.b.c" } })).status, 401);
});

test("LENTE_MAX_LISTENING: past the cap, starting to listen answers busy with a clear message", async () => {
  const on = (sub: string, email: string) => fetch(`${base}/listen/on`, { method: "POST", headers: auth(sub, email) });
  assert.equal((await on(ALICE, "alice@example.com")).status, 204);
  const busy = await on(BOB, "bob@example.com");
  assert.equal(busy.status, 503);
  assert.deepEqual(await busy.json(), { error: "busy", message: "Lente está al máximo de personas escuchando ahora. Prueba de nuevo en unos minutos." });
  assert.equal((await on(ALICE, "alice@example.com")).status, 204, "the one already listening is not refused");
  assert.equal((await fetch(`${base}/listen/off`, { method: "POST", headers: auth(ALICE, "alice@example.com") })).status, 204);
  assert.equal((await on(BOB, "bob@example.com")).status, 204);
  await fetch(`${base}/listen/off`, { method: "POST", headers: auth(BOB, "bob@example.com") });
});
