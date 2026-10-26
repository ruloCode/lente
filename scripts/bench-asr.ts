// Streams a WAV file to Meta's realtime transcription at real-time pace and
// measures what Lente depends on: partial lag, turn finalization latency and
// whether DIARIZATION actually labels speakers.
//
// Usage: pnpm bench:asr <file.wav> [DIARIZATION|ENDPOINTING|PUSH_TO_TALK] [English,Spanish]
// Convert any recording first: ffmpeg -i in.m4a -ac 1 -ar 24000 -c:a pcm_s16le out.wav

import { readFileSync } from "node:fs";
import { META_REALTIME_URL, TRANSCRIBE_MODEL } from "../src/providers.ts";
import { formatMs, percentile } from "../src/stats.ts";
import { frameBytes, readPcm16Wav } from "../src/wav.ts";

const [file, mode = "DIARIZATION", langs] = process.argv.slice(2);
const key = process.env.MODEL_API_KEY;
if (!file || !key) {
  console.error("Usage: pnpm bench:asr <file.wav> [mode] [languages]  (needs MODEL_API_KEY)");
  process.exit(1);
}

const pcm = readPcm16Wav(readFileSync(file));
if (pcm.sampleRate !== 24000 && pcm.sampleRate !== 16000) {
  console.error(`Sample rate ${pcm.sampleRate} not supported; use 24000 or 16000.`);
  process.exit(1);
}
const FRAME_MS = 80;
const frame = frameBytes(pcm.sampleRate, FRAME_MS);

type ServerMessage = {
  type?: string;
  sessionId?: string;
  turnId?: string;
  transcript?: string;
  final?: boolean;
  label?: string;
  audioProcessedMs?: number;
  message?: string;
};

const t0 = performance.now();
const now = () => performance.now() - t0;
let audioSentMs = 0;
let currentTurn: string | undefined;
const speechEndAt = new Map<string, number>();
const finalizeMs: number[] = [];
const partialLagMs: number[] = [];
const speakers = new Map<string, number>();
const speakerOf = new Map<string, string>();
const turns: { turnId: string; speaker?: string; text: string }[] = [];

const ws = new WebSocket(META_REALTIME_URL);

ws.addEventListener("open", () => {
  ws.send(
    JSON.stringify({
      authorization: { accessToken: `Bearer ${key}` },
      audioEncoding: pcm.sampleRate === 24000 ? "PCM_24KHZ" : "PCM_16KHZ",
      model: TRANSCRIBE_MODEL,
      mode,
      ...(langs ? { languageBias: langs.split(",") } : {}),
    }),
  );
});

ws.addEventListener("message", async (event) => {
  const msg = JSON.parse(String(event.data)) as ServerMessage;
  if (!msg.type && msg.sessionId) {
    console.log(`handshake ok · session ${msg.sessionId} · mode ${mode}`);
    void streamAudio();
    return;
  }
  const at = now();
  switch (msg.type) {
    case "speechStart":
      currentTurn = msg.turnId;
      break;
    case "transcript":
      if (msg.audioProcessedMs !== undefined) partialLagMs.push(audioSentMs - msg.audioProcessedMs);
      if (msg.final && mode === "PUSH_TO_TALK") turns.push({ turnId: "ptt", text: msg.transcript ?? "" });
      break;
    case "speechEnd":
      if (currentTurn) speechEndAt.set(currentTurn, at);
      break;
    case "speaker": {
      // The event's order relative to speechComplete is undocumented: key it by turn.
      const turnId = msg.turnId ?? currentTurn;
      if (!msg.label) break;
      speakers.set(msg.label, (speakers.get(msg.label) ?? 0) + 1);
      if (turnId) speakerOf.set(turnId, msg.label);
      const done = turns.find((t) => t.turnId === turnId);
      if (done) done.speaker = msg.label;
      break;
    }
    case "speechComplete": {
      const ended = msg.turnId ? speechEndAt.get(msg.turnId) : undefined;
      if (ended !== undefined) finalizeMs.push(at - ended);
      const turnId = msg.turnId ?? "?";
      turns.push({ turnId, speaker: speakerOf.get(turnId), text: msg.transcript ?? "" });
      console.log(`[${(at / 1000).toFixed(1)}s] turn ${turnId}: ${msg.transcript}`);
      break;
    }
    case "error":
      console.error(`server error: ${msg.message}`);
      break;
  }
});

ws.addEventListener("close", (event) => {
  console.log(`\nclosed ${event.code} ${event.reason}`);
  console.log(`audio sent        ${(audioSentMs / 1000).toFixed(1)} s`);
  console.log(`turns completed   ${turns.length}`);
  console.log(`speakers          ${[...speakers.keys()].join(", ") || "none reported"}`);
  console.log(`partial lag p50   ${formatMs(percentile(partialLagMs, 50))} · p95 ${formatMs(percentile(partialLagMs, 95))}`);
  console.log(`finalize p50      ${formatMs(percentile(finalizeMs, 50))} · p95 ${formatMs(percentile(finalizeMs, 95))}`);
  for (const t of turns) console.log(`  ${t.speaker ?? "?"}: ${t.text}`);
});

ws.addEventListener("error", () => console.error("websocket error"));

// Real-time pacing: the server closes with 1008 if ingress falls below real time.
async function streamAudio() {
  for (let offset = 0; offset < pcm.data.length; offset += frame) {
    ws.send(pcm.data.subarray(offset, offset + frame));
    audioSentMs += FRAME_MS;
    const ahead = audioSentMs - now();
    if (ahead > 0) await new Promise((r) => setTimeout(r, ahead));
  }
  ws.send(JSON.stringify({ type: "endStream" }));
}
