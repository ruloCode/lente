// Renders the eval set to audio: one 16 kHz mono PCM16 WAV per dialogue with the speakers'
// macOS voices at their gains, plus <id>.timeline.json with where each line starts and ends.
// Same scripts in, same text and labels out (the voices are the operating system's).
//
//   node scripts/eval/render.ts [--out eval/audio] [--only d01-standup] [--check]
//
// `--check` renders nothing: it re-reads the WAVs and compares their lengths with the timeline.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readPcm16Wav } from "../../src/wav.ts";
import { SET_FILE, pauseOf, timeline, validateSet, type Dialogue } from "./set.ts";

const SAMPLE_RATE = 16000;
const LEAD_MS = 600;
/** The WAV may differ from the timeline by this much (rounding to whole samples). */
const CHECK_TOLERANCE_MS = 2;

const { values } = parseArgs({ options: { out: { type: "string", default: "eval/audio" }, only: { type: "string" }, check: { type: "boolean", default: false } } });
const set = validateSet(JSON.parse(readFileSync(SET_FILE, "utf8"))).filter((d) => !values.only || d.id === values.only);
if (!set.length) throw new Error(`No dialogue matches --only ${values.only}`);
mkdirSync(values.out!, { recursive: true });

const pcmMs = (bytes: number) => (bytes / 2 / SAMPLE_RATE) * 1000;
const silence = (ms: number) => Buffer.alloc(Math.round((ms / 1000) * SAMPLE_RATE) * 2);

/** One line spoken by `say`, converted to 16 kHz mono PCM16 at the speaker's gain. */
function speak(dir: string, name: string, voice: string, gain: number, text: string): Buffer {
  const aiff = join(dir, `${name}.aiff`);
  const wav = join(dir, `${name}.wav`);
  execFileSync("say", ["-v", voice, "-o", aiff, "--", text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ac", "1", "-ar", String(SAMPLE_RATE), "-af", `volume=${gain}`, "-c:a", "pcm_s16le", wav]);
  return readPcm16Wav(readFileSync(wav)).data;
}

function render(d: Dialogue): void {
  const dir = mkdtempSync(join(tmpdir(), `lente-eval-${d.id}-`));
  try {
    const parts: Buffer[] = [silence(LEAD_MS)];
    const lengths: number[] = [];
    d.lines.forEach((line, i) => {
      const s = d.speakers[line.speaker];
      const pcm = speak(dir, `l${i}`, line.lang === "es" ? s.voiceEs! : s.voice, s.gain, line.text);
      lengths.push(pcmMs(pcm.length));
      parts.push(pcm, silence(pauseOf(line)));
    });
    const { lines, totalMs } = timeline(lengths, d.lines.map(pauseOf), LEAD_MS);
    const pcm = Buffer.concat(parts);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    writeFileSync(join(values.out!, `${d.id}.wav`), Buffer.concat([header, pcm]));
    writeFileSync(join(values.out!, `${d.id}.timeline.json`), JSON.stringify({ id: d.id, sampleRate: SAMPLE_RATE, totalMs, lines }, null, 1) + "\n");
    console.log(`${d.id}: ${d.lines.length} lines, ${(totalMs / 1000).toFixed(1)} s`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function check(d: Dialogue): boolean {
  const wav = join(values.out!, `${d.id}.wav`);
  const tl = join(values.out!, `${d.id}.timeline.json`);
  if (!existsSync(wav) || !existsSync(tl)) {
    console.log(`${d.id}: MISSING (render first)`);
    return false;
  }
  const { data } = readPcm16Wav(readFileSync(wav));
  const t = JSON.parse(readFileSync(tl, "utf8")) as { totalMs: number; lines: unknown[] };
  const diff = Math.abs(pcmMs(data.length) - t.totalMs);
  // ffprobe is an independent reader of the same file: it must agree with ours.
  const probed = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString().trim()) * 1000;
  const ok = t.lines.length === d.lines.length && diff <= CHECK_TOLERANCE_MS && Math.abs(probed - t.totalMs) <= 5;
  console.log(`${d.id}: ${ok ? "ok" : "MISMATCH"} · wav ${pcmMs(data.length).toFixed(0)} ms, ffprobe ${probed.toFixed(0)} ms, timeline ${t.totalMs.toFixed(0)} ms, ${t.lines.length}/${d.lines.length} lines`);
  return ok;
}

if (values.check) {
  const results = set.map(check);
  if (!results.every(Boolean)) process.exit(1);
} else {
  set.forEach(render);
}
