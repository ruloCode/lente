// The audio codec's cost (add-media-archive 1.2): IMA ADPCM on about an hour of synthetic speech from
// `say` (the consolidation bench's rendered WAV, looped), cut into 30-second segment chunks as the hub
// would. Reports bytes per hour of speech and the encoder's CPU time per audio hour, and the round
// trip's signal-to-noise ratio. Opus is not measured here: it needs a WASM dependency, which waits
// for the owner's listening check (docs/handoff-memory.md).
//
//   node scripts/bench-media.ts [results/bench-consolidation/speech.wav] [minutes=60]

import { readFileSync } from "node:fs";
import { cpuUsage } from "node:process";
import { decodeAdpcm, encodeAdpcm } from "../src/media-chunks.ts";
import { readPcm16Wav } from "../src/wav.ts";

const file = process.argv[2] ?? "results/bench-consolidation/speech.wav";
const minutes = Number(process.argv[3] ?? 60);
const pcm = Buffer.from(readPcm16Wav(readFileSync(file)).data);
const CHUNK_BYTES = 30 * 16_000 * 2;
const target = Math.round(minutes * 60 * 16_000 * 2);
let encoded = 0;
let audio = 0;
let signal = 0;
let noise = 0;
const before = cpuUsage();
const wall = performance.now();
for (let off = 0; audio < target; off = (off + CHUNK_BYTES) % Math.max(pcm.length - CHUNK_BYTES, 1)) {
  const piece = pcm.subarray(off, off + CHUNK_BYTES);
  const chunk = encodeAdpcm(piece);
  encoded += chunk.length;
  audio += piece.length;
}
const cpu = cpuUsage(before);
const encodeMs = (cpu.user + cpu.system) / 1000;
// Quality on the first five minutes.
const sample = pcm.subarray(0, Math.min(pcm.length, 5 * 60 * 16_000 * 2));
const back = decodeAdpcm(encodeAdpcm(sample));
for (let i = 0; i + 1 < sample.length; i += 2) {
  const x = sample.readInt16LE(i);
  const y = Buffer.from(back.buffer, back.byteOffset, back.byteLength).readInt16LE(i);
  signal += x * x;
  noise += (x - y) ** 2;
}
const hours = audio / 2 / 16_000 / 3600;
console.log(JSON.stringify({ bench: "media-codec", codec: "ima-adpcm", audioMinutes: Math.round(hours * 60), mbPerHour: Number((encoded / hours / 1e6).toFixed(1)), pcmMbPerHour: Number((audio / hours / 1e6).toFixed(1)), encodeCpuMsPerAudioHour: Math.round(encodeMs / hours), wallMs: Math.round(performance.now() - wall), snrDb: Number((10 * Math.log10(signal / noise)).toFixed(1)) }));
