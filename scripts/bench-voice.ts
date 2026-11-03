// add-voice-mode 4.1: how fast Lente answers out loud. Synthetic Spanish questions are spoken with
// the Mac's `say`, converted to 16 kHz PCM with `afconvert`, and streamed at real time to `/voice`
// on a hub this script starts on a scratch data folder (one synthetic meeting, never data/). For each
// turn it times, from the end of the question's audio:
//   - speechComplete   the hub has the turn (endpointing);
//   - first text       the first reply sentence of any kind (commentary included);
//   - first answer     the first sentence of the answer itself;
//   - done             the turn's end;
// and prices the turn from the usage it reports, its web searches and its audio.
// The phone's own text-to-speech start is measured on the phone, not here.
//
// Usage: node --env-file=.env scripts/bench-voice.ts [rounds=2] [--stub]
// Prints counts and timings only; the audio and the results stay in results/ (git-ignored).

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStubMeta } from "./stub-meta.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { formatMs, percentile } from "../src/stats.ts";
import { TOKEN_USD_PER_M, TRANSCRIBE_USD_PER_HOUR, WEB_SEARCH_USD_PER_K } from "../src/usage-meter.ts";
import { readPcm16Wav } from "../src/wav.ts";

const FRAME_MS = 80;
const FRAME_BYTES = (16000 * 2 * FRAME_MS) / 1000;
const VOICE = process.env.BENCH_VOICE ?? "Paulina";
const TURN_TIMEOUT_MS = 30_000;

const QUESTIONS: { kind: string; text: string }[] = [
  { kind: "chat", text: "Hola Lente, ¿qué puedes hacer por mí?" },
  { kind: "add_task", text: "Agrega que llame a Ana el viernes." },
  { kind: "list_tasks", text: "¿Qué tareas tengo pendientes?" },
  { kind: "ask_memory", text: "¿Qué se decidió sobre la beta en la reunión de planeación?" },
  { kind: "web_search", text: "Busca en internet cuál es la capital de Australia." },
];

const args = process.argv.slice(2);
const useStub = args.includes("--stub");
const rounds = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
if (!useStub && !process.env.MODEL_API_KEY) {
  console.error("MODEL_API_KEY is not set: run with node --env-file=.env, or pass --stub");
  process.exit(1);
}

const out = join("results", "bench-voice");
mkdirSync(out, { recursive: true });

/** One question as 16 kHz mono PCM16, spoken by `say`. */
function speech(i: number, text: string): Buffer {
  const aiff = join(out, `q${i}.aiff`);
  const wav = join(out, `q${i}.wav`);
  execFileSync("say", ["-v", VOICE, "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
  const pcm = readPcm16Wav(readFileSync(wav));
  if (pcm.sampleRate !== 16000) throw new Error(`afconvert gave ${pcm.sampleRate} Hz, not 16000`);
  return Buffer.from(pcm.data);
}

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

// A scratch hub with one synthetic meeting, so memory questions have something to find.
const dir = mkdtempSync(join(tmpdir(), "lente-bench-voice-"));
const day = Date.now() - 86_400_000;
new MeetingStore(join(dir, "meetings")).save({
  id: "m20261101100000",
  title: "PROBE Planeación de la beta",
  startedAt: day,
  endedAt: day + 1_800_000,
  status: "done",
  turns: [
    { id: "t1", at: day + 60_000, speaker: "A", text: "¿Lanzamos la beta el viernes o esperamos a QA?" },
    { id: "t2", at: day + 90_000, speaker: "B", wearer: true, text: "Lancemos el viernes si QA aprueba el jueves." },
    { id: "t3", at: day + 120_000, speaker: "A", text: "De acuerdo, beta el viernes con la aprobación de QA el jueves." },
  ],
  notes: { summary: "Se decidió lanzar la beta el viernes si QA aprueba el jueves.", decisions: [{ text: "Beta el viernes si QA aprueba el jueves", evidence: ["t2", "t3"] }], commitments: [], openQuestions: [] },
});

const stub = useStub ? await startStubMeta() : undefined;
const port = await freePort();
const env: Record<string, string | undefined> = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  PILOT_WEB_PORT: String(port),
  PILOT_DEVICE_PORT: String(await freePort()),
  PILOT_DATA_DIR: dir,
  MODEL_API_KEY: useStub ? "stub" : process.env.MODEL_API_KEY,
  ...(stub ? { META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime` } : {}),
};
const hub = spawn(process.execPath, ["src/pilot.ts"], { env, stdio: "ignore" });
const base = `http://localhost:${port}`;
for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

interface Row {
  kind: string;
  heardMs?: number;
  firstTextMs?: number;
  firstAnswerMs?: number;
  doneMs?: number;
  tools: string[];
  usd: number;
  stopped?: string;
  heardChars?: number;
}
const rows: Row[] = [];
const clips = QUESTIONS.map((q, i) => speech(i, q.text));

for (let round = 0; round < rounds; round++) {
  const ws = new WebSocket(`ws://localhost:${port}/voice`);
  const events: { at: number; e: Record<string, any> }[] = [];
  ws.addEventListener("message", (m) => events.push({ at: performance.now(), e: JSON.parse(String(m.data)) }));
  await new Promise<void>((ok, fail) => {
    ws.addEventListener("open", () => ok());
    ws.addEventListener("error", () => fail(new Error("the voice socket did not open")));
  });
  // Silence at real time between questions, as a phone in a quiet room would send.
  let queue: Buffer[] = [];
  let sentAt = 0;
  let onDrained: (() => void) | undefined;
  const pacer = setInterval(() => {
    const frame = queue.shift();
    ws.send(frame ?? Buffer.alloc(FRAME_BYTES));
    if (frame && queue.length === 0) {
      sentAt = performance.now();
      onDrained?.();
    }
  }, FRAME_MS);

  for (const [i, q] of QUESTIONS.entries()) {
    if (stub) stub.utterances.push(q.text);
    const pcm = clips[i];
    const frames: Buffer[] = [];
    for (let k = 0; k < pcm.length; k += FRAME_BYTES) {
      const f = Buffer.alloc(FRAME_BYTES);
      pcm.copy(f, 0, k, Math.min(k + FRAME_BYTES, pcm.length));
      frames.push(f);
    }
    const before = events.length;
    const drained = new Promise<void>((r) => (onDrained = r));
    queue = frames;
    await drained;
    const end = sentAt;
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    while (!events.slice(before).some((x) => x.e.type === "done" || x.e.type === "error") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    const mine = events.slice(before);
    const heard = mine.find((x) => x.e.type === "heard");
    const turn = heard?.e.turn;
    const ofTurn = mine.filter((x) => x.e.turn === turn);
    const at = (pred: (e: Record<string, any>) => boolean) => {
      const hit = ofTurn.find((x) => pred(x.e));
      return hit ? Math.round(hit.at - end) : undefined;
    };
    const done = ofTurn.find((x) => x.e.type === "done")?.e;
    const u = done?.usage ?? { input: 0, cached: 0, output: 0, searches: 0 };
    const p = TOKEN_USD_PER_M["muse-spark-1.3"];
    const audioSeconds = (frames.length * FRAME_MS) / 1000 + ((done ? (at((e) => e.type === "done") ?? 0) : 0) / 1000);
    const usd = ((u.input - u.cached) * p.input + u.cached * p.cached + u.output * p.output) / 1e6 + (u.searches * WEB_SEARCH_USD_PER_K) / 1000 + (audioSeconds * TRANSCRIBE_USD_PER_HOUR) / 3600;
    const row: Row = {
      kind: q.kind,
      heardMs: heard ? Math.round(heard.at - end) : undefined,
      firstTextMs: at((e) => e.type === "reply"),
      firstAnswerMs: at((e) => e.type === "reply" && !e.commentary),
      doneMs: at((e) => e.type === "done"),
      tools: ofTurn.filter((x) => x.e.type === "tool").map((x) => x.e.name),
      usd,
      stopped: done?.stopped,
      heardChars: heard?.e.text?.length,
    };
    rows.push(row);
    console.log(`round ${round + 1} · ${q.kind.padEnd(10)} heard ${formatMs(row.heardMs)} · first text ${formatMs(row.firstTextMs)} · first answer ${formatMs(row.firstAnswerMs)} · done ${formatMs(row.doneMs)} · tools ${row.tools.join(",") || "none"} · US$ ${usd.toFixed(5)} · ${row.stopped ?? "no answer"}`);
    // Tell the hub the phone has spoken it all, as the phone does, and leave a pause.
    const sent = ofTurn.filter((x) => x.e.type === "reply").length;
    if (turn) ws.send(JSON.stringify({ type: "spoken", turn, count: sent }));
    await new Promise((r) => setTimeout(r, 1200));
  }
  clearInterval(pacer);
  ws.send(JSON.stringify({ type: "end" }));
  ws.close();
}

hub.kill();
stub?.server.closeAllConnections();
stub?.server.close();

const answered = rows.filter((r) => r.doneMs !== undefined);
const stat = (key: keyof Row, list = answered) => {
  const values = list.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return { n: values.length, p50: percentile(values, 50), p90: percentile(values, 90) };
};
const summary = {
  at: new Date().toISOString(),
  model: "muse-spark-1.3 (minimal) · muse-voice-transcribe-1.0 ENDPOINTING",
  stub: useStub,
  voice: VOICE,
  turns: rows.length,
  answered: answered.length,
  all: { heard: stat("heardMs"), firstText: stat("firstTextMs"), firstAnswer: stat("firstAnswerMs"), done: stat("doneMs"), usd: stat("usd") },
  byKind: Object.fromEntries(QUESTIONS.map((q) => [q.kind, { heard: stat("heardMs", answered.filter((r) => r.kind === q.kind)), firstText: stat("firstTextMs", answered.filter((r) => r.kind === q.kind)), firstAnswer: stat("firstAnswerMs", answered.filter((r) => r.kind === q.kind)), usd: stat("usd", answered.filter((r) => r.kind === q.kind)) }])),
  rows,
};
writeFileSync(join(out, `summary-${Date.now()}.json`), JSON.stringify(summary, null, 2));
const line = (label: string, s: { n: number; p50?: number; p90?: number }) => console.log(`${label.padEnd(36)} p50 ${formatMs(s.p50)} · p90 ${formatMs(s.p90)} (n=${s.n})`);
console.log(`\n${answered.length}/${rows.length} turns answered${useStub ? " (stub)" : ""}`);
line("end of speech → speechComplete", summary.all.heard);
line("end of speech → first text", summary.all.firstText);
line("end of speech → first answer sentence", summary.all.firstAnswer);
line("end of speech → turn done", summary.all.done);
for (const [kind, s] of Object.entries(summary.byKind)) console.log(`  ${kind.padEnd(10)} first text p50 ${formatMs(s.firstText.p50)} · first answer p50 ${formatMs(s.firstAnswer.p50)} · US$ p50 ${s.usd.p50?.toFixed(5) ?? "-"}`);
const usd = answered.map((r) => r.usd);
console.log(`cost per turn: p50 US$ ${percentile(usd, 50)?.toFixed(5)} · p90 US$ ${percentile(usd, 90)?.toFixed(5)} · total US$ ${usd.reduce((a, b) => a + b, 0).toFixed(4)}`);
