// add-accounts 3.2: the web sign-in. Unit tests for the PKCE flows and the sessions, then the real
// hub in accounts mode against a stand-in for Supabase Auth: a full sign-in, a replayed or missing
// state, a state from another browser, and signing out. Test-only keys and tokens.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { FileSessionStore, PKCE_MAX_PENDING, PKCE_TTL_MS, PkceFlows, SESSION_IDLE_MS, WebSessions, authorizeUrl } from "../src/web-session.ts";
import { servePostgrest } from "./fake-postgrest.ts";

const b64url = (b: Buffer) => b.toString("base64url");

test("PKCE: the challenge is the S256 of the verifier; a state works once, unknown or late states get nothing", () => {
  let now = 0;
  const flows = new PkceFlows();
  const { state, challenge } = flows.start(now);
  const verifier = flows.take(state, now)!;
  assert.equal(b64url(createHash("sha256").update(verifier).digest()), challenge);
  assert.equal(flows.take(state, now), undefined, "a replayed state");
  assert.equal(flows.take(undefined), undefined, "a missing state");
  assert.equal(flows.take("made-up"), undefined);
  const late = flows.start(now);
  now += PKCE_TTL_MS + 1;
  assert.equal(flows.take(late.state, now), undefined, "an expired state");
});

test("PKCE: pending sign-ins are capped, the oldest dropped first", () => {
  const flows = new PkceFlows();
  const first = flows.start(0);
  for (let i = 0; i < PKCE_MAX_PENDING; i++) flows.start(1);
  assert.equal(flows.take(first.state, 2), undefined);
});

test("the authorize URL asks Supabase for Google with an S256 challenge and comes back with the state", () => {
  const url = new URL(authorizeUrl("https://ref.supabase.co/", "https://hub.example/auth/callback", "st4te", "ch4llenge"));
  assert.equal(url.origin + url.pathname, "https://ref.supabase.co/auth/v1/authorize");
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("code_challenge"), "ch4llenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(url.searchParams.get("redirect_to"), "https://hub.example/auth/callback?state=st4te");
});

test("sessions: only the token's hash is kept, the refresh token goes through the sealer, and revoked or idle sessions are no one", async () => {
  let now = 1_000;
  const sealed: string[] = [];
  let stored: unknown;
  const store = new FileSessionStore(async (_u, _id, token) => (sealed.push(token), "SEALED"), { read: () => [], write: (rows) => (stored = rows) });
  const sessions = new WebSessions(store, () => now);
  const token = await sessions.create("u1", "refresh-test-only");
  assert.deepEqual(sealed, ["refresh-test-only"]);
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(!JSON.stringify(stored).includes("refresh-test-only"));
  assert.equal(await sessions.user(token), "u1");
  assert.equal(await sessions.user("other"), undefined);
  now += SESSION_IDLE_MS + 1;
  assert.equal(await sessions.user(token), undefined, "idle for 30 days");
  const fresh = await sessions.create("u1", "r2");
  assert.ok(await sessions.revoke(fresh));
  assert.equal(await sessions.user(fresh), undefined);
  assert.equal(await sessions.revoke(fresh), false);
});

// --- The real hub ------------------------------------------------------------------------------

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
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

test("web sign-in on the hub: Google through Supabase, a session cookie, replay refused, sign-out", { timeout: 30_000 }, async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  let issuer = "";
  const exchanges: { auth_code?: string; code_verifier?: string }[] = [];
  const db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] }, (path, body) => {
    if (!path.startsWith("/auth/v1/token?grant_type=pkce")) return undefined;
    const sent = JSON.parse(body) as { auth_code?: string; code_verifier?: string };
    exchanges.push(sent);
    if (sent.auth_code !== "code-from-google") return { status: 400, body: { error: "invalid_grant" } };
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${issuer}/auth/v1`, aud: "authenticated", sub: ALICE, email: "alice@example.com", exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return { status: 200, body: { access_token: `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`, refresh_token: "PROBE-REFRESH-token", token_type: "bearer", expires_in: 3600 } };
  });
  closers.push(db.close);
  issuer = db.url;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: randomBytes(32).toString("base64"), LENTE_ALLOWED_EMAILS: "alice@example.com", PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-web-")) },
    stdio: "ignore",
  });
  children.push(hub);
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.status > 0, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

  // Unsigned: the page offers Google; the routes stay closed.
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /href="\/auth\/google"/);
  assert.equal((await fetch(`${base}/events`)).status, 401);

  // Off to Google: a redirect to Supabase's authorize with a challenge, and the state in a cookie.
  const go = await fetch(`${base}/auth/google`, { redirect: "manual" });
  assert.equal(go.status, 302);
  const authorize = new URL(go.headers.get("location")!);
  assert.equal(authorize.origin + authorize.pathname, `${db.url}/auth/v1/authorize`);
  const back = new URL(authorize.searchParams.get("redirect_to")!);
  const state = back.searchParams.get("state")!;
  assert.equal(back.pathname, "/auth/callback");
  assert.match(go.headers.get("set-cookie")!, new RegExp(`lente_auth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth`));
  const authCookie = `lente_auth=${state}`;

  // A callback with the state but from another browser (no cookie) is refused, and burns nothing.
  assert.equal((await fetch(`${base}/auth/callback?state=${state}&code=code-from-google`, { redirect: "manual" })).status, 400);
  // Back from Google with the code: a session cookie, and the code went out with this flow's verifier.
  const done = await fetch(`${base}/auth/callback?state=${state}&code=code-from-google`, { redirect: "manual", headers: { cookie: authCookie } });
  assert.equal(done.status, 302);
  assert.equal(done.headers.get("location"), "/");
  const cookies = done.headers.getSetCookie();
  const session = /lente_session=([^;]+); HttpOnly; Secure; SameSite=Lax; Path=\//.exec(cookies.join("\n"))?.[1];
  assert.ok(session, "a session cookie was set");
  assert.equal(b64url(createHash("sha256").update(exchanges.at(-1)!.code_verifier!).digest()), authorize.searchParams.get("code_challenge"));

  // The cookie opens the routes; the refresh token is sealed in the sessions table.
  assert.equal((await fetch(`${base}/facts`, { headers: { cookie: `lente_session=${session}` } })).status, 200);
  const rows = db.fake.tables.get("sessions") ?? [];
  assert.equal(rows.length, 1);
  assert.match(String(rows[0]!.refresh_enc), /^\\x01/);
  assert.ok(!db.fake.dump().includes("PROBE-REFRESH") && !db.fake.dump().includes(session!));

  // Replayed state, missing state, wrong code.
  assert.equal((await fetch(`${base}/auth/callback?state=${state}&code=code-from-google`, { redirect: "manual", headers: { cookie: authCookie } })).status, 400);
  assert.equal((await fetch(`${base}/auth/callback?code=code-from-google`, { redirect: "manual", headers: { cookie: authCookie } })).status, 400);
  const again = new URL(new URL((await fetch(`${base}/auth/google`, { redirect: "manual" })).headers.get("location")!).searchParams.get("redirect_to")!).searchParams.get("state")!;
  assert.equal((await fetch(`${base}/auth/callback?state=${again}&code=forged`, { redirect: "manual", headers: { cookie: `lente_auth=${again}` } })).status, 502);

  // Signing out ends the session.
  const out = await fetch(`${base}/auth/signout`, { method: "POST", headers: { cookie: `lente_session=${session}` } });
  assert.equal(out.status, 204);
  assert.match(out.headers.get("set-cookie")!, /lente_session=; .*Max-Age=0/);
  assert.equal((await fetch(`${base}/facts`, { headers: { cookie: `lente_session=${session}` } })).status, 401);
});
