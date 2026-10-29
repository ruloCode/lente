// End-to-end smoke test, no keys needed: clip emulator → real hub → stubbed Meta API, with this
// script as the phone. The hub starts paused: the clip connects, nothing reaches transcription,
// and the phone starts listening; after a silence long enough for the service to close the session,
// speech opens a new one and is transcribed again. Passes when the phone sees the clip connect, the turn, and a DILO with
// every stage timed (delivery included); a second phone that connects mid-sentence catches up on
// the session and the partial; and help on demand answers in Asistir and is refused in Solo
// grabar. Runs in CI on every push.
//
//   pnpm smoke

import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SseParser } from "../src/sse.ts";
import { STAGE_ORDER } from "../src/stages.ts";
import { STUB_QUESTION, STUB_REPLY, startStubMeta } from "./stub-meta.ts";

const DEVICE_PORT = 7074;
const WEB_PORT = 8084;
/** Syllables, then silence long enough for the stub to close the idle session, then syllables again. */
const AUDIO_S = 6;
const SILENCE_S = 6;
const AGAIN_S = 4;
/** How long the clip stays connected and paused before the phone starts listening. */
const PAUSED_MS = 1000;
const TIMEOUT_MS = 45_000;
const started = performance.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A quiet 220 Hz tone in 250 ms syllables: the stub transcribes the same question whatever it hears,
 * and the gaps let the silence gate tell it from a steady noise such as a fan.
 */
function writeToneWav(path: string, voicedS: number, silentS: number, againS: number): void {
  const samples = 16000 * (voicedS + silentS + againS);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  const syllable = 16000 / 4;
  for (let i = 0; i < samples; i++) {
    const voiced = i % (2 * syllable) < syllable && (i < 16000 * voicedS || i >= 16000 * (voicedS + silentS));
    wav.writeInt16LE(voiced ? Math.round(800 * Math.sin((2 * Math.PI * 220 * i) / 16000)) : 0, 44 + i * 2);
  }
  writeFileSync(path, wav);
}

const scratch = mkdtempSync(join(tmpdir(), "lente-smoke-"));
const children: ChildProcess[] = [];
const stub = await startStubMeta();
let hubLog = "";

function finish(failure?: string): never {
  for (const c of children) c.kill();
  stub.server.close();
  rmSync(scratch, { recursive: true, force: true });
  if (failure) {
    console.error(`smoke: FAILED: ${failure}\nstub saw: ${stub.requests.join(", ") || "nothing"}\n--- hub output ---\n${hubLog.slice(-4000)}`);
    process.exit(1);
  }
  console.log(`smoke: passed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  process.exit(0);
}

const timeout = setTimeout(() => finish(`not every check passed within ${TIMEOUT_MS / 1000} s`), TIMEOUT_MS);

// Only stub addresses and a dummy key: the smoke test must never reach a real API.
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
const hub = spawn(process.execPath, ["src/pilot.ts"], {
  env: {
    ...env,
    MODEL_API_KEY: "stub",
    META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`,
    META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`,
    PILOT_DEVICE_PORT: String(DEVICE_PORT),
    PILOT_WEB_PORT: String(WEB_PORT),
    PILOT_DATA_DIR: join(scratch, "data"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(hub);
hub.stdout!.on("data", (c) => (hubLog += c));
hub.stderr!.on("data", (c) => (hubLog += c));
hub.on("exit", (code) => code !== null && finish(`the hub exited with ${code}`));

const web = `http://127.0.0.1:${WEB_PORT}`;
for (let waited = 0; ; waited += 100) {
  try {
    if ((await fetch(`${web}/manifest.webmanifest`)).ok) break;
  } catch {
    // not listening yet
  }
  if (waited > 10_000) finish(`the hub did not open port ${WEB_PORT}`);
  await sleep(100);
}
await fetch(`${web}/profile`, { method: "POST", body: JSON.stringify({ names: "Rulo" }) });

/** The messages of a phone's event stream, as they arrive. */
async function* events(): AsyncGenerator<Record<string, any>> {
  const res = await fetch(`${web}/events`);
  const parser = new SseParser();
  const decoder = new TextDecoder();
  for await (const chunk of res.body!) for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) yield JSON.parse(payload);
}

/** A phone opened mid-sentence: the status with the session, then the history, then the partial. */
async function catchUp(partial: string): Promise<void> {
  const kinds: string[] = [];
  for await (const m of events()) {
    kinds.push(m.kind);
    if (kinds.length === 1) {
      if (m.kind !== "status") finish(`a phone that connects first gets "${m.kind}", expected the status`);
      if (typeof m.session?.startedAt !== "number" || typeof m.session?.listenedMs !== "number" || !m.session.running) finish(`the status carries no running session: ${JSON.stringify(m.session)}`);
    }
    if (m.kind === "partial") {
      if (kinds.join(",") !== "status,history,partial") finish(`connect order was ${kinds.join(",")}, expected status,history,partial`);
      if (m.text !== partial) finish(`the connect partial says "${m.text}", expected "${partial}"`);
      return;
    }
    if (m.kind === "turn") finish("a phone that connected mid-sentence got no partial before the turn completed");
  }
}

async function postHelp(kind: string): Promise<{ status: number; body: Record<string, any> }> {
  const r = await fetch(`${web}/help`, { method: "POST", body: JSON.stringify({ kind }) });
  return { status: r.status, body: await r.json() };
}

/** Pregunta answers with a labelled, timed card; in Solo grabar the hub refuses without a model call. */
async function checkHelp(): Promise<void> {
  const asked = await postHelp("pregunta");
  if (asked.status !== 200 || asked.body.label !== "Pregunta" || asked.body.text !== STUB_REPLY || typeof asked.body.ms !== "number") finish(`help answered ${asked.status} ${JSON.stringify(asked.body)}`);
  for (let waited = 0; !seen.helpCard; waited += 50) {
    if (waited > 2000) finish("the Pregunta card did not reach the phone");
    await sleep(50);
  }
  await fetch(`${web}/assist-mode/record`, { method: "POST" });
  const calls = stub.requests.length;
  const refused = await postHelp("aportar");
  if (refused.status !== 409 || refused.body.reason !== "record-only") finish(`help in Solo grabar answered ${refused.status} ${JSON.stringify(refused.body)}`);
  if (stub.requests.length !== calls) finish("help in Solo grabar called the model");
}

/** The silence closed the session; the next speech opened a new one and was transcribed. */
async function reopened(): Promise<void> {
  for (let waited = 0; seen.turns < 2; waited += 100) {
    if (waited > 20_000) finish(`no turn after the silence (session closed in silence: ${seen.idleClosed})`);
    await sleep(100);
  }
  if (!seen.idleClosed) finish("the second turn came without the idle session closing first");
  const sessions = stub.requests.filter((r) => r.startsWith("UPGRADE")).length;
  if (sessions !== 2) finish(`expected 2 transcription sessions (one per stretch of speech), the stub saw ${sessions}`);
}

const seen = { clip: false, turn: false, cue: false, catchUp: false, helpCard: false, spend: false, idleClosed: false, turns: 0 };
let catchingUp: Promise<void> | undefined;

/** After the DILO's stages: the second phone caught up, then help on demand. */
async function finale(): Promise<never> {
  await catchingUp;
  const missing = (["clip", "turn", "cue", "catchUp"] as const).filter((k) => !seen[k]);
  if (missing.length) finish(`stages arrived before ${missing.join(", ")}`);
  await checkHelp();
  if (!seen.spend) finish("the phone never saw today's spend with audio sent and the DILO's tokens");
  await reopened();
  clearTimeout(timeout);
  finish();
}

/** Started paused, the clip on: no transcription session until the phone starts listening. */
async function startFromPhone(first: Record<string, any>): Promise<void> {
  if (first.listening || first.pause?.reason !== "start") finish(`the hub booted with listening=${first.listening}, pause=${JSON.stringify(first.pause)}`);
  await sleep(PAUSED_MS);
  if (stub.requests.some((r) => r.startsWith("UPGRADE"))) finish("a clip connecting started transcription while paused");
  await fetch(`${web}/listen/on`, { method: "POST" });
}

void (async () => {
  for await (const m of events()) {
    if (m.kind === "status" && m.clip && !seen.clip) {
      seen.clip = true;
      void startFromPhone(m);
    }
    // Today's spend: the audio the gate sent and the DILO call's tokens, priced.
    if (m.kind === "spend" && m.audioSeconds > 0 && m.models?.["muse-spark-1.3"]?.output > 0 && m.usd > 0) seen.spend = true;
    if (m.kind === "partial" && !catchingUp) catchingUp = catchUp(m.text).then(() => void (seen.catchUp = true));
    if (m.kind === "turn" && m.text === STUB_QUESTION) {
      seen.turn = true;
      seen.turns++;
    }
    if (m.kind === "status" && seen.turn && m.asr === "listening · nothing sent in silence") seen.idleClosed = true;
    if (m.kind === "cue" && m.label === "Pregunta") seen.helpCard = true;
    if (m.kind === "cue" && m.label === "DILO") {
      if (m.text !== STUB_REPLY) finish(`the DILO says "${m.text}", expected the stub's reply`);
      if (m.why !== "name") finish(`the DILO went through the "${m.why}" rule, expected "name"`);
      seen.cue = true;
      await fetch(`${web}/seen`, { method: "POST", body: JSON.stringify({ id: m.id }) });
    }
    if (m.kind === "stages") {
      const missing = STAGE_ORDER.filter((s) => typeof m.stages[s] !== "number");
      if (missing.length) finish(`the DILO is missing stage(s) ${missing.join(", ")}`);
      void finale();
    }
  }
})().catch((error) => finish(`event stream: ${(error as Error).message}`));

const wav = join(scratch, "tone.wav");
writeToneWav(wav, AUDIO_S, SILENCE_S, AGAIN_S);
const clip = spawn(process.execPath, ["scripts/fake-clip.ts", wav, "--port", String(DEVICE_PORT), "--linger-ms", "20000"], { env, stdio: "ignore" });
children.push(clip);
