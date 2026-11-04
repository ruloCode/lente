// ship-hackathon group 2 on a real hub in accounts mode (file stores, a local JWKS, the stubbed Meta
// API): open sign-up with an end date, the spend caps, the preview terms and the sample. Synthetic
// PROBE- accounts only; no key, no network.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, startStubMeta } from "../scripts/stub-meta.ts";

const OWNER = "aaaaaaaa-0000-4000-8000-00000000000a";
const JUDGE = "bbbbbbbb-0000-4000-8000-00000000000b";
const OTHER = "cccccccc-0000-4000-8000-00000000000c";

let stub: StubMeta;
let jwks: Server;
let issuer = "";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const children: ChildProcess[] = [];
const KEK = randomBytes(32).toString("base64");
before(async () => {
  stub = await startStubMeta();
  jwks = createServer((_req, res) => res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] })));
  await new Promise<void>((ok) => jwks.listen(0, ok));
  issuer = `http://localhost:${(jwks.address() as AddressInfo).port}`;
});
after(() => {
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
  jwks.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

/** A Supabase-shaped access token signed by the local JWKS. */
function token(sub: string, email: string): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${issuer}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

async function startHub(env: Record<string, string>, dir = mkdtempSync(join(tmpdir(), "lente-judge-hub-"))): Promise<{ base: string; dir: string; stop(): void }> {
  const port = await freePort();
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: issuer, LENTE_KEK: KEK,
      LENTE_ALLOWED_EMAILS: "probe-owner@example.com", LENTE_OWNER_USER_ID: OWNER,
      PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir,
      MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`, ...env,
    },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  return { base, dir, stop: () => hub.kill() };
}

const as = (sub: string, email: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token(sub, email)}` } });

test("2.1 open sign-up: a new Google account gets in before the end date; after it, it is told sign-up is closed", { timeout: 30_000 }, async () => {
  const open = await startHub({ LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01", LENTE_TERMS: "off" });
  assert.equal((await fetch(`${open.base}/tasks`, as(JUDGE, "probe-judge@example.com"))).status, 200);
  open.stop();

  // The same volume after the date: the judge's account keeps working, a newcomer is refused kindly.
  const closed = await startHub({ LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2020-01-01", LENTE_TERMS: "off" }, open.dir);
  assert.equal((await fetch(`${closed.base}/tasks`, as(JUDGE, "probe-judge@example.com"))).status, 200);
  const refused = await fetch(`${closed.base}/tasks`, as(OTHER, "probe-late@example.com"));
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: "signup_closed", message: "Las inscripciones están cerradas por ahora. Gracias por tu interés en Lente." });
  // The allow list still gets in.
  assert.equal((await fetch(`${closed.base}/tasks`, as(OWNER, "probe-owner@example.com"))).status, 200);
  closed.stop();

  // Allowlist mode (the default): a stranger hears it is a closed test.
  const invite = await startHub({});
  const stranger = await fetch(`${invite.base}/tasks`, as(OTHER, "probe-late@example.com"));
  assert.equal(stranger.status, 403);
  assert.equal(((await stranger.json()) as { error: string }).error, "closed_test");
});
