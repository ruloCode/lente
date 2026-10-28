// Clip emulator: connects to a hub like the clip does, streams a 16 kHz mono WAV as
// sequenced audio frames at real-time pace, answers photo requests with the JPEGs of a
// folder and obeys the hub's commands. Lets anyone run Lente without the hardware.
//
// Usage: node scripts/fake-clip.ts <speech.wav> [--photos <dir>] [--host 127.0.0.1] [--port 7070] [--loop] [--v1] [--linger-ms 8000]
// Make a WAV from any recording: ffmpeg -i in.m4a -ac 1 -ar 16000 -c:a pcm_s16le speech.wav
//
// Reproducible: frames depend only on the inputs (sequence from 0, capture time = sequence × 80 ms,
// photos in file-name order), never on the wall clock; the clock only paces when they go out.
// `--v1` sends the old hello without a version, to see how the hub refuses an outdated clip.

import { readdirSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { COMMANDS, SAMPLE_RATE, encodeAudioFrame, encodeFrame, encodeHello } from "../src/clip-protocol.ts";
import { frameBytes, readPcm16Wav } from "../src/wav.ts";

const FRAME_MS = 80;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    photos: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "7070" },
    loop: { type: "boolean", default: false },
    v1: { type: "boolean", default: false },
    "linger-ms": { type: "string", default: "8000" }, // keep listening for cues after the audio ends
  },
});
const wavPath = positionals[0];
if (!wavPath) {
  console.error("Usage: node scripts/fake-clip.ts <speech.wav> [--photos <dir>] [--host H] [--port P] [--loop] [--v1]");
  process.exit(1);
}

const wav = readPcm16Wav(readFileSync(wavPath));
if (wav.sampleRate !== SAMPLE_RATE) {
  console.error(`The WAV is ${wav.sampleRate} Hz; the clip protocol carries ${SAMPLE_RATE} Hz. Convert with: ffmpeg -i in.wav -ac 1 -ar ${SAMPLE_RATE} -c:a pcm_s16le out.wav`);
  process.exit(1);
}
const photos = values.photos
  ? readdirSync(values.photos).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => join(values.photos!, f))
  : [];

const FRAME_BYTES = frameBytes(SAMPLE_RATE, FRAME_MS);
let cameraOn = false;
let listening = true;
let nextPhoto = 0;
let seq = 0;
let tick = 0; // frames elapsed on the clip's clock, sent or not
let offset = 0; // read position in the WAV
let timer: ReturnType<typeof setTimeout> | undefined;

const socket = connect({ host: values.host, port: Number(values.port) });
socket.setNoDelay(true);

function sendPhoto(): void {
  if (!photos.length) return void console.log("[fake-clip] photo requested but no --photos folder was given");
  const file = photos[nextPhoto++ % photos.length];
  socket.write(encodeFrame("J", readFileSync(file)));
  console.log(`[fake-clip] photo ${file}`);
}

socket.on("connect", () => {
  console.log(`[fake-clip] connected to ${values.host}:${values.port}, ${(wav.data.length / (SAMPLE_RATE * 2)).toFixed(1)} s of audio`);
  if (values.v1) socket.write(encodeFrame("H", Buffer.from('{"device":"lente-clip","fw":"pilot-2","rssi":-50,"camera":false}')));
  else socket.write(encodeHello({ fw: "fake-clip", device: "fake-clip" }));
  const start = performance.now();
  const step = () => {
    if (offset >= wav.data.length) {
      if (!values.loop) return void (timer = setTimeout(() => socket.end(), Number(values["linger-ms"])));
      offset = 0;
    }
    const pcm = Buffer.alloc(FRAME_BYTES); // a short last frame is padded with silence
    wav.data.copy(pcm, 0, offset, Math.min(offset + FRAME_BYTES, wav.data.length));
    offset += FRAME_BYTES;
    // Like the clip: while paused the microphone keeps running but nothing is sent and the sequence stands still.
    if (listening && !socket.destroyed) socket.write(encodeAudioFrame(seq++, tick * FRAME_MS, pcm));
    tick++;
    timer = setTimeout(step, Math.max(0, start + tick * FRAME_MS - performance.now()));
  };
  step();
});

socket.on("data", (chunk) => {
  for (const byte of chunk.toString("latin1")) {
    if (byte === COMMANDS.photo) sendPhoto();
    else if (byte === COMMANDS.blink) console.log("[fake-clip] blink (cue)");
    else if (byte === COMMANDS.cameraOn) cameraOn = true;
    else if (byte === COMMANDS.cameraOff) cameraOn = false;
    else if (byte === COMMANDS.listen) listening = true;
    else if (byte === COMMANDS.pause) listening = false;
    else continue;
    if (byte !== COMMANDS.photo && byte !== COMMANDS.blink) console.log(`[fake-clip] camera ${cameraOn ? "on" : "off"}, ${listening ? "listening" : "paused"}`);
  }
});

socket.on("close", () => {
  if (timer) clearTimeout(timer);
  console.log(`[fake-clip] connection closed after ${seq} audio frames`);
  process.exit(0);
});
socket.on("error", (error) => {
  console.error(`[fake-clip] ${error.message}`);
  process.exit(1);
});
