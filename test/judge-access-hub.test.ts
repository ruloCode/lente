// ship-hackathon group 2 on a real hub in accounts mode (file stores, a local JWKS, the stubbed Meta
// API): open sign-up with an end date, the spend caps, the preview terms and the sample. Synthetic
// PROBE- accounts only; no key, no network.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, startStubMeta } from "../scripts/stub-meta.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { dayIn } from "../src/spend-cap.ts";

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

const LIMIT_USER = "Por hoy llegaste al límite de la prueba. Vuelve mañana.";
const LIMIT_GLOBAL = "La demo llegó a su límite de hoy. Vuelve mañana.";
const askAs = async (base: string, sub: string, email: string) =>
  (await (await fetch(`${base}/ask`, as(sub, email, { method: "POST", body: JSON.stringify({ question: "¿Qué dijo PROBE-Ana de la zanahoria morada?" }) }))).json()) as { ok: boolean; answer?: string; limit?: string };
const modelCalls = () => stub.requests.filter((r) => r.startsWith("POST /v1/")).length;
const OPEN = { LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01", LENTE_TERMS: "off" };

/** A volume with today's spend already counted (what a restart reads back) and a PROBE meeting for the judge to ask about. */
function volume(spent: Record<string, number>): string {
  const dir = mkdtempSync(join(tmpdir(), "lente-judge-hub-"));
  writeFileSync(join(dir, "usage-daily.json"), JSON.stringify({ day: dayIn(Date.now()), users: spent }));
  const at = Date.now() - 3_600_000;
  for (const id of [JUDGE, OTHER, OWNER]) {
    new MeetingStore(join(dir, "users", id, "meetings")).save({ id: "m20261104090000", title: "PROBE huerta", startedAt: at, endedAt: at + 60_000, status: "done", turns: [{ id: "t1", at: at + 10_000, startAt: at + 5_000, speaker: "PROBE-Ana", text: "PROBE la zanahoria morada va en la pizarra" }] });
  }
  return dir;
}

test("2.2 per-user cap: a judge's question spends; past the cap it gets the limit line with no model call, and others are unaffected", { timeout: 30_000 }, async () => {
  const hub = await startHub({ ...OPEN, LENTE_USER_DAY_CAP_USD: "0.000001" }, volume({}));
  const calls = modelCalls();
  const first = await askAs(hub.base, JUDGE, "probe-judge@example.com");
  assert.equal(first.ok, true);
  assert.notEqual(first.answer, LIMIT_USER);
  assert.ok(modelCalls() > calls, "the first question called the model");
  const before = modelCalls();
  const second = await askAs(hub.base, JUDGE, "probe-judge@example.com");
  assert.deepEqual([second.ok, second.answer, second.limit], [true, LIMIT_USER, "user"]);
  assert.equal(modelCalls(), before, "no model is called past the cap");
  // A streaming client reads the same line.
  const streamed = await (await fetch(`${hub.base}/ask`, as(JUDGE, "probe-judge@example.com", { method: "POST", headers: { Accept: "text/event-stream" }, body: JSON.stringify({ question: "PROBE ¿y ahora?" }) }))).text();
  assert.match(streamed, /event: delta\ndata: \{"text":"Por hoy llegaste al límite de la prueba\. Vuelve mañana\."\}/);
  // Listening, help and the natural voice answer kindly instead of spending.
  const listen = await fetch(`${hub.base}/listen/on`, as(JUDGE, "probe-judge@example.com", { method: "POST" }));
  assert.equal(listen.status, 503);
  assert.deepEqual(await listen.json(), { ok: false, error: "limit", reason: "limit", limit: "user", message: LIMIT_USER });
  assert.equal((await fetch(`${hub.base}/help`, as(JUDGE, "probe-judge@example.com", { method: "POST", body: "{}" }))).status, 429);
  assert.equal((await fetch(`${hub.base}/tts`, as(JUDGE, "probe-judge@example.com", { method: "POST", body: JSON.stringify({ text: "hola" }) }))).status, 404);
  // Another account still has its own day; the owner is never capped.
  assert.notEqual((await askAs(hub.base, OTHER, "probe-other@example.com")).answer, LIMIT_USER);
  await askAs(hub.base, OWNER, "probe-owner@example.com");
  assert.notEqual((await askAs(hub.base, OWNER, "probe-owner@example.com")).answer, LIMIT_USER);
  hub.stop();
});

test("2.2 after a restart today's spend is read back: the caps still hold, per account and in all; the owner goes on", { timeout: 30_000 }, async () => {
  const perUser = await startHub(OPEN, volume({ [JUDGE]: 1.0, [OWNER]: 5 }));
  assert.equal((await askAs(perUser.base, JUDGE, "probe-judge@example.com")).answer, LIMIT_USER);
  assert.notEqual((await askAs(perUser.base, OTHER, "probe-other@example.com")).answer, LIMIT_USER);
  assert.notEqual((await askAs(perUser.base, OWNER, "probe-owner@example.com")).answer, LIMIT_USER);
  perUser.stop();

  // The owner's own spend counts toward everyone's (it is the same credit), but never caps the owner.
  const global = await startHub(OPEN, volume({ [JUDGE]: 0.5, [OWNER]: 11.6 }));
  const other = await askAs(global.base, OTHER, "probe-other@example.com");
  assert.deepEqual([other.answer, other.limit], [LIMIT_GLOBAL, "global"]);
  assert.equal((await askAs(global.base, JUDGE, "probe-judge@example.com")).answer, LIMIT_GLOBAL);
  assert.notEqual((await askAs(global.base, OWNER, "probe-owner@example.com")).answer, LIMIT_GLOBAL);
  global.stop();
});
