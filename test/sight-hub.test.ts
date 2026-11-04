// add-sight-mode 2.2–2.3, 3.2: Ver on the real hub, against the stubbed Meta API, with the clip emulator
// answering photo requests with a tiny synthetic JPEG. No key, no network, no image of anyone.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, STUB_SIGHT_LIVE, STUB_SIGHT_LOOK, startStubMeta } from "../scripts/stub-meta.ts";

let stub: StubMeta;
const children: ChildProcess[] = [];
const aborts: AbortController[] = [];
before(async () => (stub = await startStubMeta()));
after(() => {
  for (const a of aborts) a.abort();
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One second of 16 kHz silence and a minimal JPEG (SOI … EOI), written to a scratch folder. */
function fixtures(dir: string): { wav: string; photos: string } {
  const samples = 16000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  const photos = join(dir, "photos");
  mkdirSync(photos);
  writeFileSync(join(photos, "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]));
  writeFileSync(join(dir, "silence.wav"), wav);
  return { wav: join(dir, "silence.wav"), photos };
}

async function startHub() {
  const port = await freePort();
  const devicePort = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "lente-sight-hub-"));
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(devicePort), PILOT_DATA_DIR: dir, MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime` },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await sleep(50);
  return { base, dir, devicePort };
}

/** Every event from /events, parsed, as they arrive. */
function listen(base: string) {
  const events: Record<string, any>[] = [];
  const abort = new AbortController();
  aborts.push(abort);
  void (async () => {
    const res = await fetch(`${base}/events`, { signal: abort.signal });
    const reader = res.body!.getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buf += new TextDecoder().decode(value);
      let at;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        if (data) try { events.push(JSON.parse(data)); } catch { /* keep-alive */ }
      }
    }
  })();
  return events;
}

async function until<T>(f: () => T | undefined, ms = 8000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    const v = f();
    if (v !== undefined && v !== false) return v;
  }
  throw new Error("timed out");
}

const post = (base: string, path: string) => fetch(`${base}${path}`, { method: "POST" }).then((r) => r.status);
const dayText = (dir: string) => {
  const days = join(dir, "days");
  return existsSync(days) ? readdirSync(days).map((f) => readFileSync(join(days, f), "utf8")).join("\n") : "";
};

test("Ver: live reads with the sight prompt, silence when unchanged, a look by tap, no cues, and a guest session keeps nothing", { timeout: 60_000 }, async () => {
  const { base, dir, devicePort } = await startHub();
  const fx = fixtures(dir);
  const events = listen(base);
  children.push(spawn(process.execPath, ["scripts/fake-clip.ts", fx.wav, "--photos", fx.photos, "--port", String(devicePort), "--loop"], { stdio: "ignore" }));
  await until(() => events.find((e) => e.kind === "status" && e.clip === true));

  assert.equal(await post(base, "/assist-mode/sight"), 204);
  await until(() => events.find((e) => e.kind === "status" && e.assistMode === "sight" && e.live === true && e.mode === "camera"));

  // The first frame is described; later frames come back "=" and publish nothing.
  const first = await until(() => events.find((e) => e.kind === "live"));
  assert.equal(first.text, STUB_SIGHT_LIVE);
  await until(() => events.filter((e) => e.kind === "frame").length >= 4 || undefined, 15_000);
  assert.equal(events.filter((e) => e.kind === "live").length, 1, "unchanged frames are silent");

  // A tap looks with the sight prompt and answers as a VER card, while live reads keep running.
  assert.equal(await post(base, "/look"), 204);
  const card = await until(() => events.find((e) => e.kind === "cue" && e.label === "VER"));
  assert.equal(card.text, STUB_SIGHT_LOOK);
  assert.ok(!events.some((e) => e.kind === "cue" && e.label !== "VER"), "no Dilo or ON SCREEN card in Ver");
  await until(() => dayText(dir).includes(STUB_SIGHT_LOOK) || undefined, 6000);

  // Guest: a look still answers, but nothing reaches the day record.
  assert.equal(await post(base, "/guest/on"), 204);
  await until(() => events.find((e) => e.kind === "status" && e.guest === true));
  const before = events.filter((e) => e.kind === "cue" && e.label === "VER").length;
  assert.equal(await post(base, "/look"), 204);
  await until(() => events.filter((e) => e.kind === "cue" && e.label === "VER").length > before || undefined);
  await sleep(3500); // past the phone-acknowledgement wait, when a card would be kept
  const kept = dayText(dir);
  assert.equal(kept.split(STUB_SIGHT_LOOK).length - 1, 1, "the guest's look is not in the day");
  assert.equal(await post(base, "/guest/off"), 204);

  // Leaving Ver stops the live reads it started.
  assert.equal(await post(base, "/assist-mode/assist"), 204);
  await until(() => events.findLast((e) => e.kind === "status")?.live === false || undefined);
});

test("Ver: a look with no camera says so out loud", { timeout: 30_000 }, async () => {
  const { base } = await startHub();
  const events = listen(base);
  await post(base, "/assist-mode/sight");
  await until(() => events.find((e) => e.kind === "status" && e.assistMode === "sight"));
  assert.equal(await post(base, "/look"), 204);
  const card = await until(() => events.find((e) => e.kind === "cue" && e.label === "VER"));
  assert.equal(card.text, "No hay cámara conectada.");
});
