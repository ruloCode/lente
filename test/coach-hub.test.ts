// add-language-coach 2.1: the tutor on the real hub, against the stubbed Meta API. Tones stand for
// speech; the stub's endpointing "hears" the next scripted line per stretch of tone. Synthetic text only.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, startStubMeta } from "../scripts/stub-meta.ts";
import { REPEAT_ECHO_TAIL_MS } from "../src/voice-session.ts";

const FRAME_MS = 80;
const FRAME_SAMPLES = (16000 * FRAME_MS) / 1000;

let stub: StubMeta;
const children: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const pacers: ReturnType<typeof setInterval>[] = [];
before(async () => (stub = await startStubMeta()));
after(() => {
  for (const p of pacers) clearInterval(p);
  for (const ws of sockets) ws.close();
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

async function startHub(): Promise<string> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "lente-coach-hub-"));
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir, MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime` },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  return base;
}

const tone = (): Buffer => {
  const b = Buffer.alloc(FRAME_SAMPLES * 2);
  for (let i = 0; i < FRAME_SAMPLES; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / 16000)), i * 2);
  return b;
};

async function phone(base: string) {
  const ws = new WebSocket(`${base.replace("http", "ws")}/voice`);
  sockets.push(ws);
  const events: Record<string, any>[] = [];
  ws.addEventListener("message", (e) => events.push(JSON.parse(String(e.data))));
  await new Promise<void>((ok, fail) => (ws.addEventListener("open", () => ok()), ws.addEventListener("error", () => fail(new Error("voice socket refused")))));
  let loudFrames = 0;
  const loud = tone();
  const silence = Buffer.alloc(FRAME_SAMPLES * 2);
  pacers.push(setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(loudFrames > 0 ? loud : silence);
    if (loudFrames > 0) loudFrames--;
  }, FRAME_MS));
  const until = async (check: () => unknown, ms = 8000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error(`timed out; events: ${JSON.stringify(events.map((e) => (e.type === "reply" ? `reply:${e.text}` : e.type)))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  return { events, until, speak: (ms: number) => void (loudFrames = Math.ceil(ms / FRAME_MS)), send: (m: object) => ws.send(JSON.stringify(m)) };
}

test("the Portuguese tutor: the bias on start, a phrase said in Portuguese with its card, and a repeat understood", { timeout: 60_000 }, async () => {
  const base = await startHub();
  const p = await phone(base);
  await p.until(() => p.events.some((e) => e.type === "listening"));
  p.send({ type: "start", persona: "coach", lang: "pt", mode: "tutor" });
  await p.until(() => stub.asrSessions.some((s) => s.languageBias?.[0] === "Portuguese"));
  assert.deepEqual(stub.asrSessions.at(-1), { mode: "ENDPOINTING", languageBias: ["Portuguese", "Spanish"] });

  stub.utterances.push("¿Cómo se dice tenedor en portugués?");
  p.speak(800);
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 1));
  const turn1 = p.events.filter((e) => e.turn === 1);
  assert.deepEqual(turn1.filter((e) => e.type === "pronounce").map(({ text, meaning, lang }) => ({ text, meaning, lang })), [{ text: "o garfo", meaning: "el tenedor", lang: "pt" }]);
  assert.deepEqual(turn1.filter((e) => e.type === "reply").map((e) => [e.text, e.lang]), [["O garfo.", "pt"], ["Repítelo conmigo, despacio.", "es"]]);
  assert.ok(turn1.findIndex((e) => e.type === "pronounce") < turn1.findIndex((e) => e.type === "reply"), "the card comes before its sentence");

  // The phone says it spoke both; after the echo tail, the wearer's «O garfo» is their try, not Lente's echo.
  p.send({ type: "spoken", turn: 1, count: 2 });
  await p.until(() => p.events.at(-1)?.type === "state" && p.events.at(-1)?.state === "listening");
  await new Promise((r) => setTimeout(r, REPEAT_ECHO_TAIL_MS + 100));
  stub.utterances.push("O garfo.");
  p.speak(800);
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 2));
  const turn2 = p.events.filter((e) => e.turn === 2);
  assert.deepEqual(turn2.filter((e) => e.type === "tool").map((e) => e.name), ["check_repeat"]);
  assert.deepEqual(turn2.filter((e) => e.type === "reply").map((e) => [e.text, e.lang]), [["¡Muy bien, te entendí perfecto!", "es"]]);

  // A tap on the look surface is the wearer asking «¿Qué es esto?»; with no camera, Lente says so in Spanish.
  p.send({ type: "look" });
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 3));
  const turn3 = p.events.filter((e) => e.turn === 3);
  assert.deepEqual(turn3.filter((e) => e.type === "heard").map((e) => e.text), ["¿Qué es esto?"]);
  assert.deepEqual(turn3.filter((e) => e.type === "tool").map((e) => e.name), ["look"]);
  assert.deepEqual(turn3.filter((e) => e.type === "reply").map((e) => [e.text, e.lang]), [["No pude ver: No hay cámara conectada.", "es"]]);
  p.send({ type: "end" });
});

test("a language that has not passed its check opens the default Lente, with no language on its replies", { timeout: 60_000 }, async () => {
  const base = await startHub();
  const p = await phone(base);
  await p.until(() => p.events.some((e) => e.type === "listening"));
  const before = stub.asrSessions.length;
  p.send({ type: "start", persona: "coach", lang: "fr", mode: "tutor" });
  stub.utterances.push("Cuéntame algo largo");
  p.speak(800);
  await p.until(() => p.events.some((e) => e.type === "done" && e.turn === 1));
  assert.ok(stub.asrSessions.slice(before).every((s) => s.languageBias?.[0] !== "French"), "no French bias");
  const replies = p.events.filter((e) => e.type === "reply" && e.turn === 1);
  assert.ok(replies.length > 0 && replies.every((e) => !("lang" in e)));
  p.send({ type: "end" });
});

test("a placement: answers with their audio spans, «para», and an estimate with only the wearer's own quotes", { timeout: 90_000 }, async () => {
  const base = await startHub();
  const p = await phone(base);
  await p.until(() => p.events.some((e) => e.type === "listening"));
  p.send({ type: "start", persona: "coach", lang: "pt", mode: "placement" });
  const answers = [
    "Meu nome é Rulo, eu sou da Colômbia e moro em Bogotá com a minha família há muitos anos já, e gosto muito daqui.",
    "Eu trabalho com software todos os dias, começo cedo, tomo um café e depois falo com a minha equipe.",
    "Ontem eu fui ao mercado de manhã, comprei frutas e pão, e depois eu cozinhei o almoço para todos nós.",
  ];
  for (const [i, text] of answers.entries()) {
    stub.utterances.push(text);
    p.speak(1600);
    await p.until(() => p.events.some((e) => e.type === "done" && e.turn === i + 1), 15_000);
    p.send({ type: "spoken", turn: i + 1, count: p.events.filter((e) => e.type === "reply" && e.turn === i + 1).length });
    await new Promise((r) => setTimeout(r, 300));
  }
  stub.utterances.push("Para.");
  p.speak(600);
  await p.until(() => p.events.some((e) => e.type === "placement"), 15_000);
  const placed = p.events.find((e) => e.type === "placement")!;
  assert.equal(placed.band, "A2");
  assert.equal(placed.lang, "pt");
  assert.deepEqual(placed.vocabulary.quotes, ["comprei frutas"], "the quote the wearer never said is dropped");
  assert.deepEqual(placed.grammar.quotes, ["eu fui ao mercado"]);
  assert.ok(placed.fluency.words >= 60 && placed.fluency.turns === 3, JSON.stringify(placed.fluency));
  assert.ok(placed.fluency.wordsPerMinute > 0, "words per minute come from the turns' audio spans");
  assert.ok(placed.line.endsWith("No es un examen oficial."));
  await p.until(() => p.events.some((e) => e.type === "reply" && e.text === placed.line));
  assert.equal(p.events.find((e) => e.type === "reply" && e.text === placed.line)!.lang, "es");
  p.send({ type: "end" });
});
