// Consolidation while recording (add-memory-engine 6.6): a long synthetic Solo grabar run on a scratch
// hub with LENTE_RECALL=fast. Bilingual synthetic speech (the PROBE- lines of scripts/eval/memory-set.ts,
// Spanish with `say -v Paulina`, English with `say -v Samantha`) is streamed by the clip emulator at
// real time, looping, for the run's length; real Muse Voice Transcribe and Muse Spark. The script
// listens to the hub's events and log and reports: window cards per episode, the time from a window
// closing to its card, the model calls by label, and the cost per recorded hour (transcription
// included). Never touches data/; prints counts, timings and costs only.
//
//   node --env-file=.env scripts/bench-consolidation.ts [minutes=120]

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SseParser } from "../src/sse.ts";
import { TOKEN_USD_PER_M, TRANSCRIBE_USD_PER_HOUR } from "../src/usage-meter.ts";
import { readPcm16Wav } from "../src/wav.ts";
import { memorySet } from "./eval/memory-set.ts";

const minutes = Number(process.argv[2] ?? 120);
const SAMPLE_RATE = 16_000;
/** Silence between lines, as in conversation: mostly short, sometimes a longer pause. */
const PAUSES_MS = [400, 700, 1000, 1500, 2500];
const LINES = 220;
if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set: run with node --env-file=.env");

const out = join("results", "bench-consolidation");
mkdirSync(out, { recursive: true });

/** The synthetic speech, rendered once: about 15 minutes of meeting lines in both languages. */
function speech(): string {
  const wavPath = join(out, "speech.wav");
  if (existsSync(wavPath)) return wavPath;
  const lines = memorySet({ days: 14 }).meetings.flatMap((m) => m.turns.map((t) => t.text)).slice(0, LINES);
  const english = /\b(the|is|we|for|and|of|to|that|this)\b/i;
  const pcm: Buffer[] = [];
  lines.forEach((line, i) => {
    const aiff = join(out, "line.aiff");
    const wav = join(out, "line.wav");
    execFileSync("say", ["-v", english.test(line) ? "Samantha" : "Paulina", "-o", aiff, line.replace(/PROBE-/g, "")]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${SAMPLE_RATE}`, "-c", "1", aiff, wav]);
    pcm.push(Buffer.from(readPcm16Wav(readFileSync(wav)).data), Buffer.alloc(Math.round((PAUSES_MS[i % PAUSES_MS.length]! / 1000) * SAMPLE_RATE) * 2));
  });
  const data = Buffer.concat(pcm);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(wavPath, Buffer.concat([header, data]));
  console.error(`rendered ${lines.length} lines, ${(data.length / 2 / SAMPLE_RATE / 60).toFixed(1)} min of speech`);
  return wavPath;
}

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

const wav = speech();
const dir = mkdtempSync(join(tmpdir(), "lente-bench-consolidation-"));
const webPort = await freePort();
const devicePort = await freePort();
const base = `http://127.0.0.1:${webPort}`;
const log: string[] = [];
const hub: ChildProcess = spawn(process.execPath, ["src/pilot.ts"], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, MODEL_API_KEY: process.env.MODEL_API_KEY, LENTE_RECALL: "fast", PILOT_WEB_PORT: String(webPort), PILOT_DEVICE_PORT: String(devicePort), PILOT_DATA_DIR: dir },
  stdio: ["ignore", "pipe", "pipe"],
});
/** Hub lines about listening itself (pauses, the wearer, episodes), shown as they happen: no turn text. */
const LISTENING_LINE = /^\[(idle|wearer|meeting|listen|clip|fake-clip)\]/;
let runStart = 0;
for (const s of [hub.stdout!, hub.stderr!])
  s.on("data", (b: Buffer) => {
    for (const l of b.toString().split("\n").filter(Boolean)) {
      log.push(`${Date.now()} ${l}`);
      if (runStart && LISTENING_LINE.test(l)) console.error(`  ${((Date.now() - runStart) / 60_000).toFixed(1)} min · ${l.slice(0, 120)}`);
    }
  });
for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

// Every model call's usage, by label, from the hub's own events.
const calls: { label: string; model: string; input: number; cached: number; output: number }[] = [];
let audioSeconds = 0;
/** The audio the hub received, from its own recorded-time counter: less than the run if the link dropped. */
let recordedMs = 0;
const events = new AbortController();
void (async () => {
  const res = await fetch(`${base}/events`, { signal: events.signal });
  const parser = new SseParser();
  const decoder = new TextDecoder();
  for await (const chunk of res.body!) {
    for (const data of parser.push(decoder.decode(chunk, { stream: true }))) {
      const e = JSON.parse(data) as { kind?: string; label?: string; model?: string; promptTokens?: number; cachedTokens?: number; completionTokens?: number; audioSeconds?: number; ms?: number };
      if (e.kind === "usage") calls.push({ label: e.label ?? "?", model: e.model ?? "?", input: e.promptTokens ?? 0, cached: e.cachedTokens ?? 0, output: e.completionTokens ?? 0 });
      if (e.kind === "spend" && typeof e.audioSeconds === "number") audioSeconds = e.audioSeconds;
      if (e.kind === "recorded" && typeof e.ms === "number") recordedMs = e.ms;
    }
  }
})().catch(() => {});

const post = (path: string) => fetch(`${base}${path}`, { method: "POST" }).then((r) => r.status);
await post("/assist-mode/record");
const clip = spawn(process.execPath, ["scripts/fake-clip.ts", wav, "--port", String(devicePort), "--loop"], { stdio: ["ignore", "pipe", "pipe"] });
// The emulator exits when its link closes; keep why, so a run that stops hearing audio says so.
let clipExit: string | undefined;
for (const s of [clip.stdout!, clip.stderr!])
  s.on("data", (b: Buffer) => {
    for (const l of b.toString().split("\n").filter((x) => /closed|error|refused|\[fake-clip\] [a-z]/i.test(x) && !x.includes("photo"))) {
      log.push(`${Date.now()} ${l}`);
      if (runStart) console.error(`  ${((Date.now() - runStart) / 60_000).toFixed(1)} min · ${l.slice(0, 120)}`);
    }
  });
clip.on("exit", (code) => {
  if (runStart && Date.now() - runStart < minutes * 60_000) clipExit = `exited with ${code} at ${((Date.now() - runStart) / 60_000).toFixed(1)} min`;
});
await new Promise((r) => setTimeout(r, 3000));
await post("/listen/on");
const started = Date.now();
runStart = started;
console.error(`recording ${minutes} min of synthetic speech in Solo grabar (hub log kept in memory, lengths only)`);
while (Date.now() - started < minutes * 60_000) {
  await new Promise((r) => setTimeout(r, 60_000));
  const cards = log.filter((l) => l.includes("[cards]") && l.includes("window card ·")).length;
  console.error(`${Math.round((Date.now() - started) / 60_000)} min · ${cards} window card(s) so far`);
}
clip.kill();
const recordedMin = (Date.now() - started) / 60_000;
// End the open episode now instead of waiting five minutes of silence, then let its notes and card finish.
await post("/meeting/end");
for (let i = 0; i < 60 && !log.some((l) => l.includes("[meeting] notes for") && Number(l.split(" ")[0]) > started + recordedMin * 60_000); i++) await new Promise((r) => setTimeout(r, 2000));
await new Promise((r) => setTimeout(r, 5000));
events.abort();
hub.kill();

const windowLines = log.filter((l) => /\[cards\] .* · window card · /.test(l));
const episodeLines = log.filter((l) => /\[cards\] .* · episode card · /.test(l));
const delays = log.flatMap((l) => (/window card (\d+) s after its window closed/.exec(l) ? [Number(/window card (\d+) s after/.exec(l)![1])] : []));
const facts = [...windowLines, ...episodeLines].reduce((n, l) => n + Number(/· (\d+) facts/.exec(l)?.[1] ?? 0), 0);
const price = (c: (typeof calls)[number]) => {
  const p = TOKEN_USD_PER_M[c.model] ?? TOKEN_USD_PER_M["muse-spark-1.3"]!;
  return ((c.input - c.cached) * p.input + c.cached * p.cached + c.output * p.output) / 1e6;
};
const byLabel: Record<string, { calls: number; usd: number; input: number; output: number }> = {};
for (const c of calls) {
  const b = (byLabel[c.label] ??= { calls: 0, usd: 0, input: 0, output: 0 });
  b.calls++;
  b.usd += price(c);
  b.input += c.input;
  b.output += c.output;
}
const modelUsd = calls.reduce((n, c) => n + price(c), 0);
const asrUsd = (audioSeconds / 3600) * TRANSCRIBE_USD_PER_HOUR;
const hours = recordedMin / 60;
const cardUsd = (byLabel.card?.usd ?? 0) + (byLabel.notes?.usd ?? 0);
const summary = {
  bench: "consolidation",
  recordedMin: Math.round(recordedMin),
  episodes: log.filter((l) => l.includes("[meeting] ended")).length,
  windowCards: windowLines.length,
  episodeCards: episodeLines.length,
  cardFacts: facts,
  windowToCardS: delays.length ? { min: Math.min(...delays), p50: delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)], max: Math.max(...delays) } : null,
  byLabel: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, { ...v, usd: Number(v.usd.toFixed(4)) }])),
  audioSeconds: Math.round(audioSeconds),
  usd: { model: Number(modelUsd.toFixed(4)), transcription: Number(asrUsd.toFixed(4)), total: Number((modelUsd + asrUsd).toFixed(4)) },
  usdPerRecordedHour: { cards: Number((cardUsd / hours).toFixed(4)), allModelCalls: Number((modelUsd / hours).toFixed(4)), withTranscription: Number(((modelUsd + asrUsd) / hours).toFixed(4)) },
  clipExit: clipExit ?? null,
  recordedAudioMin: Number((recordedMs / 60_000).toFixed(1)),
  idlePauses: log.filter((l) => l.includes("[idle] paused")).length,
  failures: log.filter((l) => /\[cards\] window card failed|notes for .* failed/.test(l)).length,
};
writeFileSync(join(out, `summary-${Date.now()}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exit(0);
