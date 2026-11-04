// ship-hackathon group 2 on a real hub in accounts mode (file stores, a local JWKS, the stubbed Meta
// API): open sign-up with an end date, the spend caps, the preview terms and the sample. Synthetic
// PROBE- accounts only; no key, no network.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { type Server, createServer, request } from "node:http";
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

test("2.2 after a restart today's spend is read back: the caps still hold, per account and in all; the owner goes on and is not counted", { timeout: 30_000 }, async () => {
  const perUser = await startHub(OPEN, volume({ [JUDGE]: 1.0, [OWNER]: 5 }));
  assert.equal((await askAs(perUser.base, JUDGE, "probe-judge@example.com")).answer, LIMIT_USER);
  assert.notEqual((await askAs(perUser.base, OTHER, "probe-other@example.com")).answer, LIMIT_USER);
  assert.notEqual((await askAs(perUser.base, OWNER, "probe-owner@example.com")).answer, LIMIT_USER);
  perUser.stop();

  // Everyone's sum is the other accounts' (the default US$ 6.00): seven judges at US$ 0.90 reach it.
  const judges = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`dddddddd-0000-4000-8000-00000000000${i}`, 0.9]));
  const global = await startHub(OPEN, volume({ ...judges, [OWNER]: 50 }));
  const other = await askAs(global.base, OTHER, "probe-other@example.com");
  assert.deepEqual([other.answer, other.limit], [LIMIT_GLOBAL, "global"]);
  assert.equal((await askAs(global.base, JUDGE, "probe-judge@example.com")).answer, LIMIT_GLOBAL);
  assert.notEqual((await askAs(global.base, OWNER, "probe-owner@example.com")).answer, LIMIT_GLOBAL);
  global.stop();

  // The owner's own spend, however large, is its own budget: it never caps anyone else.
  const ownerOnly = await startHub(OPEN, volume({ [OWNER]: 50 }));
  assert.notEqual((await askAs(ownerOnly.base, OTHER, "probe-other@example.com")).answer, LIMIT_GLOBAL);
  ownerOnly.stop();
});

/** Every event from /events for one account, parsed, as they arrive. */
function events(base: string, sub: string, email: string) {
  const out: Record<string, any>[] = [];
  const abort = new AbortController();
  void (async () => {
    const res = await fetch(`${base}/events`, as(sub, email, { signal: abort.signal }));
    const reader = res.body!.getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buf += new TextDecoder().decode(value);
      let at;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const data = buf.slice(0, at).split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        buf = buf.slice(at + 2);
        if (data) try { out.push(JSON.parse(data)); } catch { /* keep-alive */ }
      }
    }
  })();
  return { out, stop: () => abort.abort() };
}
const until = async <T>(f: () => T | undefined, ms = 10_000): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
    const v = f();
    if (v !== undefined && v !== false) return v;
  }
  throw new Error("timed out");
};

test("2.2 in Ver: when a judge reaches the cap, narration stops and the limit is said once as a VER card; a look says it too", { timeout: 40_000 }, async () => {
  const dir = volume({});
  const hub = await startHub({ ...OPEN, LENTE_USER_DAY_CAP_USD: "0.000001" }, dir);
  const seen = events(hub.base, JUDGE, "probe-judge@example.com");
  // The clip emulator on /device with the judge's token, answering photo requests with a tiny synthetic JPEG.
  const photos = join(dir, "photos");
  mkdirSync(photos);
  writeFileSync(join(photos, "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]));
  const wav = Buffer.alloc(44 + 32_000);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + 32_000, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(32_000, 40);
  writeFileSync(join(dir, "silence.wav"), wav);
  const port = new URL(hub.base).port;
  children.push(spawn(process.execPath, ["scripts/fake-clip.ts", join(dir, "silence.wav"), "--photos", photos, "--host", "localhost", "--port", port, "--ws", "--token", token(JUDGE, "probe-judge@example.com"), "--loop"], { stdio: "ignore" }));
  await until(() => seen.out.find((e) => e.kind === "status" && e.clip === true));

  assert.equal((await fetch(`${hub.base}/assist-mode/sight`, as(JUDGE, "probe-judge@example.com", { method: "POST" }))).status, 204);
  await until(() => seen.out.find((e) => e.kind === "live"));
  const card = await until(() => seen.out.find((e) => e.kind === "cue" && e.label === "VER"));
  assert.equal(card.text, LIMIT_USER);
  await until(() => seen.out.findLast((e) => e.kind === "status")?.live === false || undefined);
  assert.equal(seen.out.filter((e) => e.kind === "cue" && e.text === LIMIT_USER).length, 1, "said once");

  // A tap afterwards answers with the same line, spoken as a VER card, and calls no model.
  const calls = modelCalls();
  assert.equal((await fetch(`${hub.base}/look`, as(JUDGE, "probe-judge@example.com", { method: "POST" }))).status, 204);
  await until(() => seen.out.filter((e) => e.kind === "cue" && e.label === "VER" && e.text === LIMIT_USER).length === 2 || undefined);
  assert.equal(modelCalls(), calls);
  seen.stop();
  hub.stop();
});

/** The status line an upgrade gets, without completing it. */
function upgradeStatus(base: string, path: string, bearer: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64"), Authorization: `Bearer ${bearer}` } });
    req.on("upgrade", (_res, socket) => (socket.destroy(), resolve(101)));
    req.on("response", (res) => resolve(res.statusCode ?? 0));
    req.on("error", reject);
    req.end();
  });
}

test("2.3 terms before data: a new account gets 428 until it accepts the current version; the pages are public; the owner is never asked", { timeout: 30_000 }, async () => {
  const hub = await startHub({ LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01" });
  const judge = (path: string, init: RequestInit = {}) => fetch(`${hub.base}${path}`, as(JUDGE, "probe-judge@example.com", init));
  // Anyone may read the terms and the privacy note, signed in or not.
  for (const path of ["/terminos", "/privacidad"]) {
    const page = await fetch(`${hub.base}${path}`);
    assert.equal(page.status, 200, path);
    assert.match(await page.text(), /preview-2026-11-04/);
  }
  const first = await judge("/tasks");
  assert.equal(first.status, 428);
  const body = (await first.json()) as { needsTerms: boolean; version: string };
  assert.deepEqual([body.needsTerms, body.version], [true, "preview-2026-11-04"]);
  assert.equal((await judge("/ask", { method: "POST", body: JSON.stringify({ question: "PROBE" }) })).status, 428);
  assert.equal(await upgradeStatus(hub.base, "/device", token(JUDGE, "probe-judge@example.com")), 428);
  assert.equal(await upgradeStatus(hub.base, "/voice", token(JUDGE, "probe-judge@example.com")), 428);
  assert.equal(((await (await judge("/terms")).json()) as { needsTerms: boolean }).needsTerms, true);
  // A stale version is answered with the current one; none, or the current, is accepted.
  const stale = await judge("/terms/accept", { method: "POST", body: JSON.stringify({ version: "preview-2026-01-01" }) });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { version: string }).version, "preview-2026-11-04");
  const ok = await judge("/terms/accept", { method: "POST", body: "{}" });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { version: string }).version, "preview-2026-11-04");
  assert.equal((await judge("/tasks")).status, 200);
  assert.equal(((await (await judge("/terms")).json()) as { needsTerms: boolean }).needsTerms, false);
  assert.equal(await upgradeStatus(hub.base, "/voice", token(JUDGE, "probe-judge@example.com")), 101);
  // The owner never sees the screen, on data routes or the clip's socket.
  assert.equal((await fetch(`${hub.base}/tasks`, as(OWNER, "probe-owner@example.com"))).status, 200);
  assert.equal(await upgradeStatus(hub.base, "/device", token(OWNER, "probe-owner@example.com")), 101);
  assert.equal(((await (await fetch(`${hub.base}/terms`, as(OWNER, "probe-owner@example.com"))).json()) as { needsTerms: boolean }).needsTerms, false);
  hub.stop();

  // The acceptance survives a restart.
  const again = await startHub({ LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01" }, hub.dir);
  assert.equal((await fetch(`${again.base}/tasks`, as(JUDGE, "probe-judge@example.com"))).status, 200);
  assert.equal((await fetch(`${again.base}/tasks`, as(OTHER, "probe-other@example.com"))).status, 428);
  again.stop();
});

test("2.4 the sample: written on the first acceptance, it answers «¿Qué se decidió sobre la beta?» with a source; «Borrar ejemplo» leaves the person's own data", { timeout: 30_000 }, async () => {
  const hub = await startHub({ LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01" });
  const judge = (path: string, init: RequestInit = {}) => fetch(`${hub.base}${path}`, as(JUDGE, "probe-judge@example.com", init));
  assert.equal((await judge("/terms/accept", { method: "POST", body: "{}" })).status, 200);
  type Tasks = { tasks: { title: string; meetingTitle: string; projectName: string }[] };
  const tasks = (await (await judge("/tasks")).json()) as Tasks;
  assert.deepEqual(tasks.tasks.map((t) => t.projectName), ["PROBE · Proyecto de ejemplo", "PROBE · Proyecto de ejemplo", "PROBE · Proyecto de ejemplo"]);
  const projects = (await (await judge("/projects")).json()) as { projects: { name: string }[] };
  assert.deepEqual(projects.projects.map((p) => p.name), ["PROBE · Proyecto de ejemplo"]);

  const answer = (await (await judge("/ask", { method: "POST", body: JSON.stringify({ question: "¿Qué se decidió sobre la beta?" }) })).json()) as { ok: boolean; sources: { label: string; meetingId?: string }[] };
  assert.equal(answer.ok, true);
  assert.ok(answer.sources.length > 0, "the answer cites a source");
  assert.match(answer.sources[0]!.label, /Planificación de la beta/);

  // Accepting again (a new version, or a repeated tap) writes no second sample.
  assert.equal((await judge("/terms/accept", { method: "POST", body: "{}" })).status, 200);
  assert.equal(((await (await judge("/tasks")).json()) as Tasks).tasks.length, 3);

  // The person's own task stays when the sample goes.
  assert.equal((await judge("/tasks/add", { method: "POST", body: JSON.stringify({ title: "PROBE comprar café" }) })).status, 201);
  const removed = (await (await judge("/sample/delete", { method: "POST", body: "{}" })).json()) as { ok: boolean; removed: number };
  assert.deepEqual(removed, { ok: true, removed: 2 + 3 + 2 + 1 });
  assert.deepEqual(((await (await judge("/tasks")).json()) as Tasks).tasks.map((t) => t.title), ["PROBE comprar café"]);
  const after = (await (await judge("/ask", { method: "POST", body: JSON.stringify({ question: "¿Qué se decidió sobre la beta?" }) })).json()) as { sources: { label: string }[] };
  assert.ok(!after.sources.some((s) => /beta/.test(s.label)), "the sample is no longer cited");
  assert.deepEqual(await (await judge("/sample/delete", { method: "POST", body: "{}" })).json(), { ok: true, removed: 0 });
  // The owner, never asked for the terms, gets no sample.
  assert.deepEqual(((await (await fetch(`${hub.base}/projects`, as(OWNER, "probe-owner@example.com"))).json()) as { projects: unknown[] }).projects, []);
  hub.stop();
});
