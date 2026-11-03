// add-voice-mode 2.3: `/voice` on the real hub, against the stubbed Meta API, with synthetic audio
// streamed at real time (tones stand for speech; the stub's endpointing "hears" the next scripted
// line per stretch of tone). Synthetic text only; no key, no network.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { type Server, createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, STUB_LONG_REPLY, startStubMeta } from "../scripts/stub-meta.ts";

const FRAME_MS = 80;
const FRAME_SAMPLES = (16000 * FRAME_MS) / 1000;
const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";

let stub: StubMeta;
const children: ChildProcess[] = [];
/** Open test phones, closed after the tests even when one fails. */
const phones: { close(): void }[] = [];
before(async () => (stub = await startStubMeta()));
after(() => {
  for (const p of phones) p.close();
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

async function startHub(env: Record<string, string>): Promise<{ base: string; dir: string }> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "lente-voice-hub-"));
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir, MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`, ...env },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  return { base, dir };
}

const tone = (): Buffer => {
  const b = Buffer.alloc(FRAME_SAMPLES * 2);
  for (let i = 0; i < FRAME_SAMPLES; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / 16000)), i * 2);
  return b;
};
const SILENCE = Buffer.alloc(FRAME_SAMPLES * 2);

/** A phone on /voice: sends silence at real time, tone while `speak` asks for it, and keeps every event. */
async function phone(base: string, token?: string) {
  const url = `${base.replace("http", "ws")}/voice${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const events: Record<string, any>[] = [];
  ws.addEventListener("message", (e) => events.push(JSON.parse(String(e.data))));
  await new Promise<void>((ok, fail) => {
    ws.addEventListener("open", () => ok());
    ws.addEventListener("error", () => fail(new Error("voice socket refused")));
  });
  let loudFrames = 0;
  const loud = tone();
  const pacer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(loudFrames > 0 ? loud : SILENCE);
    if (loudFrames > 0) loudFrames--;
  }, FRAME_MS);
  const until = async (check: () => boolean, ms = 8000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error(`timed out; events: ${JSON.stringify(events.map((e) => e.type))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const handle = {
    events,
    until,
    speak: (ms: number) => void (loudFrames = Math.ceil(ms / FRAME_MS)),
    send: (msg: object) => ws.send(JSON.stringify(msg)),
    close: () => {
      clearInterval(pacer);
      ws.close();
    },
  };
  phones.push(handle);
  return handle;
}

/** The status line an upgrade to /voice gets, without completing it. */
function upgradeStatus(base: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64") } });
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on("response", (res) => resolve(res.statusCode ?? 0));
    req.on("error", reject);
    req.end();
  });
}

test("a spoken request on the laptop hub: the task is added, the reply comes by sentences, the chat keeps it, no meeting opens", { timeout: 60_000 }, async () => {
  const { base, dir } = await startHub({});
  const p = await phone(base);
  await p.until(() => p.events.some((e) => e.type === "listening"));
  assert.equal(p.events.find((e) => e.type === "listening")!.source, "phone");

  stub.utterances.push("Agrega que llame a Ana el viernes");
  p.speak(800);
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 1));
  const turn1 = p.events.filter((e) => e.turn === 1);
  assert.deepEqual(turn1.filter((e) => e.type === "heard").map((e) => e.text), ["Agrega que llame a Ana el viernes"]);
  assert.ok(p.events.some((e) => e.type === "partial"), "the words show while they are spoken");
  assert.deepEqual(turn1.filter((e) => e.type === "reply").map((e) => e.text), ["Lo anoto en tu lista.", "Listo, agregué «Llamar a Ana»."]);
  assert.deepEqual(turn1.filter((e) => e.type === "tool").map((e) => e.name), ["add_task"]);
  const tasks = JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8"));
  assert.deepEqual(tasks.map((t: any) => [t.title, t.who, t.due, t.source]), [["Llamar a Ana", "me", "viernes", "manual"]]);

  // Barge-in: a long reply is cut by the wearer's words; nothing more of it arrives.
  stub.utterances.push("Cuéntame algo largo", "Espera otra cosa");
  p.speak(800);
  await p.until(() => p.events.some((e) => e.type === "reply" && e.turn === 2));
  p.speak(700);
  await p.until(() => p.events.some((e) => e.type === "bargeIn" && e.turn === 2));
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 3));
  const cut = p.events.findIndex((e) => e.type === "bargeIn" && e.turn === 2);
  assert.ok(!p.events.slice(cut).some((e) => e.turn === 2 && (e.type === "reply" || e.type === "done")), `the cancelled reply sends nothing after barge-in: ${JSON.stringify(p.events.slice(cut - 3).map((e) => [e.type, e.turn, e.text ?? e.state ?? ""]))}`);
  assert.ok(p.events.filter((e) => e.type === "reply" && e.turn === 2).length < STUB_LONG_REPLY.length);

  // The phone saying it spoke everything brings the state back to listening.
  const sent3 = p.events.filter((e) => e.type === "reply" && e.turn === 3).length;
  p.send({ type: "spoken", turn: 3, count: sent3 });
  await p.until(() => p.events.at(-1)?.type === "state" && p.events.at(-1)?.state === "listening");
  p.send({ type: "end" });
  await p.until(() => p.events.some((e) => e.type === "end"));
  p.close();

  const chat = await (await fetch(`${base}/chat/voice`)).json() as { threads: { lines: { role: string; text: string }[] }[] };
  assert.equal(chat.threads.length, 1);
  const lines = chat.threads[0].lines.map((l) => `${l.role}:${l.text}`);
  assert.deepEqual(lines.slice(0, 2), ["user:Agrega que llame a Ana el viernes", "lente:Listo, agregué «Llamar a Ana»."]);
  assert.ok(lines.includes("user:Cuéntame algo largo") && !lines.some((l) => l.startsWith("lente:Esta es la")), "the interrupted reply is not kept");
  assert.ok(!existsSync(join(dir, "meetings")) || readdirSync(join(dir, "meetings")).length === 0, "a voice session opens no meeting");
});

test("accounts: no or bad credentials are refused, and each user's session acts only on their own memory", { timeout: 60_000 }, async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwks: Server = createServer((_req, res) => res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] })));
  await new Promise<void>((ok) => jwks.listen(0, ok));
  const issuer = `http://localhost:${(jwks.address() as AddressInfo).port}`;
  const token = (sub: string, email: string) => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${issuer}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  try {
    const { base, dir } = await startHub({ LENTE_CLOUD: "1", SUPABASE_URL: issuer, LENTE_KEK: randomBytes(32).toString("base64"), LENTE_ALLOWED_EMAILS: "alice@example.com bob@example.com" });
    assert.equal(await upgradeStatus(base, "/voice"), 401);
    assert.equal(await upgradeStatus(base, "/voice?token=not-a-token"), 401);
    const forged = token(ALICE, "alice@example.com").slice(0, -4) + "AAAA";
    assert.equal(await upgradeStatus(base, `/voice?token=${forged}`), 401);

    const alice = await phone(base, token(ALICE, "alice@example.com"));
    const bob = await phone(base, token(BOB, "bob@example.com"));
    await alice.until(() => alice.events.some((e) => e.type === "listening"));
    await bob.until(() => bob.events.some((e) => e.type === "listening"));
    stub.utterances.push("Agrega que llame a Ana el viernes");
    alice.speak(800);
    await alice.until(() => alice.events.some((e) => e.type === "done"));
    assert.equal(bob.events.filter((e) => e.type === "heard").length, 0, "Bob's session heard nothing of Alice's");
    alice.close();
    bob.close();

    const aliceTasks = JSON.parse(readFileSync(join(dir, "users", ALICE, "tasks.json"), "utf8"));
    assert.deepEqual(aliceTasks.map((t: any) => t.title), ["Llamar a Ana"]);
    assert.ok(!existsSync(join(dir, "users", BOB, "tasks.json")), "Bob's list is untouched");
    const chatOf = async (sub: string, email: string) => (await (await fetch(`${base}/chat/voice`, { headers: { Authorization: `Bearer ${token(sub, email)}` } })).json() as { threads: unknown[] }).threads.length;
    assert.equal(await chatOf(ALICE, "alice@example.com"), 1);
    assert.equal(await chatOf(BOB, "bob@example.com"), 0);
  } finally {
    jwks.close();
  }
});
