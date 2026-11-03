// add-accounts 2.3, the log guard: a stubbed meeting runs through the Supabase backend (the real
// hub in accounts mode, the stubbed Meta API, a fake clip on the WebSocket with the user's device
// token, a fake PostgREST over HTTP), and no turn, card, title or note text may appear in the hub's
// output or anywhere in the database outside sealed columns. Synthetic text and test-only keys.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { STUB_QUESTION, STUB_REPLY, startStubMeta } from "../scripts/stub-meta.ts";
import { SseParser } from "../src/sse.ts";
import { servePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const TITLE = "PROBE-TITLE-planeacion-trimestral";
const children: ChildProcess[] = [];
const closers: (() => void)[] = [];
after(() => {
  for (const c of children) c.kill();
  for (const close of closers) close();
});

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

/** Syllables of a quiet tone: the stub transcribes its fixed question whatever it hears. */
function toneWav(path: string, seconds: number): void {
  const samples = 16000 * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(i % 8000 < 4000 ? Math.round(800 * Math.sin((2 * Math.PI * 220 * i) / 16000)) : 0, 44 + i * 2);
  writeFileSync(path, wav);
}

test("a meeting through the Supabase backend leaves no turn, card or title text in the hub's output or in plain columns", { timeout: 60_000 }, async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] });
  closers.push(db.close);
  const stub = await startStubMeta();
  closers.push(() => stub.server.close());
  const scratch = mkdtempSync(join(tmpdir(), "lente-log-guard-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;

  let output = "";
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`,
      SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: randomBytes(32).toString("base64"), LENTE_ALLOWED_EMAILS: "alice@example.com",
      PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: join(scratch, "data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(hub);
  hub.stdout!.on("data", (c) => (output += c));
  hub.stderr!.on("data", (c) => (output += c));
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.status > 0, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${db.url}/auth/v1`, aud: "authenticated", sub: ALICE, email: "alice@example.com", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const headers = { Authorization: `Bearer ${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}` };

  // Alice names herself as the stub's question does, opens a meeting and makes a clip token.
  assert.equal((await fetch(`${base}/profile`, { method: "POST", headers, body: JSON.stringify({ names: "Rulo" }) })).status, 204);
  assert.equal((await fetch(`${base}/meeting/start`, { method: "POST", headers, body: JSON.stringify({ title: TITLE }) })).status, 204);
  const device = (await (await fetch(`${base}/devices`, { method: "POST", headers, body: JSON.stringify({ label: "Clip de prueba" }) })).json()) as { token: string };

  // Follow her stream until the turn and the DILO card arrive.
  const ctrl = new AbortController();
  const seen = { turn: false, cue: false };
  const stream = (async () => {
    const res = await fetch(`${base}/events`, { headers, signal: ctrl.signal });
    const parser = new SseParser();
    const decoder = new TextDecoder();
    for await (const chunk of res.body!) {
      for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) {
        const m = JSON.parse(payload) as { kind: string; text?: string };
        if (m.kind === "turn" && m.text === STUB_QUESTION) seen.turn = true;
        if (m.kind === "cue" && m.text?.includes(STUB_REPLY)) seen.cue = true;
        if (seen.turn && seen.cue) return;
      }
    }
  })().catch(() => undefined);

  const wav = join(scratch, "tone.wav");
  toneWav(wav, 8);
  const clip = spawn(process.execPath, ["scripts/fake-clip.ts", wav, "--ws", "--host", "127.0.0.1", "--port", String(port), "--token", device.token, "--linger-ms", "20000"], { stdio: "ignore" });
  children.push(clip);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal((await fetch(`${base}/listen/on`, { method: "POST", headers })).status, 204);
  for (let i = 0; i < 400 && !(seen.turn && seen.cue); i++) await new Promise((r) => setTimeout(r, 50));
  ctrl.abort();
  await stream;
  assert.ok(seen.turn, "the stubbed question reached Alice's phone");
  assert.ok(seen.cue, "the DILO card reached Alice's phone");

  assert.equal((await fetch(`${base}/meeting/end`, { method: "POST", headers })).status, 204);
  for (let i = 0; i < 100 && !(db.fake.tables.get("meeting_turns") ?? []).length; i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok((db.fake.tables.get("meeting_turns") ?? []).length > 0, "the meeting's turns were stored");
  assert.ok((db.fake.tables.get("day_entries") ?? []).length > 0, "the day record was stored");

  const dump = db.fake.dump();
  for (const text of [STUB_QUESTION, STUB_REPLY, TITLE]) {
    assert.ok(!output.includes(text), `the hub's output shows «${text}»`);
    assert.ok(!dump.includes(text), `«${text}» is in the database in the clear`);
    assert.ok(!dump.includes(Buffer.from(text).toString("hex")), `«${text}» is in the database as hex`);
  }
  assert.match(output, /\[turn\] .*‹\d+ chars›/, "the turn is logged by its length");
});
