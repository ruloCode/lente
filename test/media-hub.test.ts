// add-media-archive 2.2 and 2.3 on a real laptop hub (the owner) with kept media seeded in data/media:
// audio plays as WAV through the hub with Range, a frame as JPEG, unknown ids are 404; the switches
// change the status the phone reads; and an answer's chip for a segment with audio carries its path.
// Synthetic PROBE- data; a stubbed Meta API for the answer.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { encodeAdpcm } from "../src/media-chunks.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { FileMedia } from "../src/stores.ts";

const children: ChildProcess[] = [];
let stub: ReturnType<typeof createServer> | undefined;
after(() => (children.forEach((c) => c.kill()), stub?.close()));
const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

test("kept media plays through the hub, the switches reach the status, and chips carry media", { timeout: 30_000 }, async () => {
  stub = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const id = /RECUPERADO:\\n\[([^\]]+)\]/.exec(body)?.[1];
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: id ? `@answer\nPROBE respuesta [[${id}]]` : "@none" })}\n\n`);
    });
  });
  await new Promise<void>((ok) => stub!.listen(0, ok));
  const dir = mkdtempSync(join(tmpdir(), "lente-media-hub-"));
  const at = Date.now() - 3_600_000;
  new MeetingStore(join(dir, "meetings")).save({ id: "m20261103100000", title: "PROBE medios", startedAt: at, endedAt: at + 60_000, status: "done", turns: [{ id: "t1", at: at + 10_000, startAt: at + 5_000, speaker: "PROBE-Ana", text: "PROBE zanahoria morada en la pizarra" }] });
  const pcm = new Uint8Array(32_000);
  new DataView(pcm.buffer).setInt16(100, 1234, true);
  const media = new FileMedia(join(dir, "media"));
  media.put({ kind: "audio", ref: "sm20261103100000:1", at: at + 5_000, ms: 1000, bytes: 0, codec: "adpcm" }, encodeAdpcm(pcm));
  media.put({ kind: "frame", ref: "d2026-11-03:1", at, ms: 0, bytes: 4, codec: "jpeg" }, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

  const port = await freePort();
  children.push(spawn(process.execPath, ["src/pilot.ts"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_RECALL: "fast", MODEL_API_KEY: "probe-fake-key", META_BASE_URL: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir }, stdio: "ignore" }));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

  const audio = await fetch(`${base}/media/audio/sm20261103100000:1`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/wav");
  const wav = new Uint8Array(await audio.arrayBuffer());
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(wav.length, 44 + 32_000);
  const part = await fetch(`${base}/media/audio/sm20261103100000:1`, { headers: { Range: "bytes=0-43" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), `bytes 0-43/${wav.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 44);
  assert.equal((await fetch(`${base}/media/audio/sm20261103100000:1`, { headers: { Range: "bytes=999999-" } })).status, 416);
  const frame = await fetch(`${base}/media/frame/d2026-11-03:1`);
  assert.equal(frame.headers.get("content-type"), "image/jpeg");
  assert.equal((await fetch(`${base}/media/audio/sm99:1`)).status, 404);
  assert.equal((await fetch(`${base}/media/audio/..%2F..%2Fetc`)).status, 404);

  assert.equal((await fetch(`${base}/media/photos/off`, { method: "POST" })).status, 204);
  const ctrl = new AbortController();
  const events = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = events.body!.getReader();
  let text = "";
  while (!text.includes('"media"')) text += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.match(text, /"media":\{"switches":\{"audio":true,"photos":false\},"retentionDays":30,"keepingAudio":false,"keepingPhotos":false,"offered":true\}/);

  const answer = await (await fetch(`${base}/ask`, { method: "POST", body: JSON.stringify({ question: "¿Qué dijo Ana de la zanahoria morada?" }) })).json();
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.sources[0].media, { audio: "/media/audio/sm20261103100000%3A1" });
});
