// What travels between the clip and the hub, and how its audio is cleaned up.
// Pure: no sockets here, so all of it is unit-tested.
//
// Uplink (clip → hub) is a stream of frames: 1 byte type, 4 bytes little-endian
// length, payload. Types: "H" hello (JSON), "A" audio (PCM16 mono 16 kHz), "J" JPEG.
// Downlink (hub → clip) is single bytes: "B" blink for a cue, "P" take a photo,
// "C"/"c" camera on/off (off = mic-only, saves battery), "M"/"m" listen/pause.

export interface ClipFrame {
  type: string;
  payload: Buffer;
}

const HEADER_BYTES = 5;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

export class ClipFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): ClipFrame[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: ClipFrame[] = [];
    while (this.buffer.length >= HEADER_BYTES) {
      const length = this.buffer.readUInt32LE(1);
      if (length > MAX_FRAME_BYTES) throw new Error(`frame of ${length} bytes is too large`);
      if (this.buffer.length < HEADER_BYTES + length) break;
      frames.push({
        type: String.fromCharCode(this.buffer[0]),
        payload: this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + length),
      });
      this.buffer = this.buffer.subarray(HEADER_BYTES + length);
    }
    return frames;
  }
}

/** Builds one uplink frame; the firmware does the same in C. */
export function encodeFrame(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header[0] = type.charCodeAt(0);
  header.writeUInt32LE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/**
 * The XIAO's PDM microphone comes out quiet and riding on a DC offset (~1500).
 * This removes the offset with a slow one-pole tracker and applies gain with clipping.
 */
export class AudioConditioner {
  private dc: number | undefined;
  private gain: number;

  constructor(gain: number) {
    this.gain = gain;
  }

  process(pcm: Buffer): Buffer {
    const samples = pcm.length >> 1;
    if (this.dc === undefined && samples > 0) {
      let sum = 0;
      for (let i = 0; i < samples; i++) sum += pcm.readInt16LE(i * 2);
      this.dc = sum / samples;
    }
    const out = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      const x = pcm.readInt16LE(i * 2);
      this.dc! += (x - this.dc!) * 0.001;
      const y = Math.round((x - this.dc!) * this.gain);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, y)), i * 2);
    }
    return out;
  }
}

/** Root mean square of PCM16 samples, for the level meter. */
export function rms(pcm: Buffer): number {
  const samples = pcm.length >> 1;
  if (!samples) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = pcm.readInt16LE(i * 2);
    sum += v * v;
  }
  return Math.sqrt(sum / samples);
}

/**
 * Wi-Fi delivers audio in bursts, but realtime transcription closes the session if
 * ingress falls below real time. The hub drains this buffer on a fixed clock and
 * fills gaps with silence; if the clip runs ahead, the oldest audio is dropped.
 */
export class JitterBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  private frameBytes: number;
  private maxBytes: number;

  constructor(frameBytes: number, maxBytes: number) {
    this.frameBytes = frameBytes;
    this.maxBytes = maxBytes;
  }

  push(pcm: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, pcm]);
    if (this.buffer.length > this.maxBytes) {
      const drop = this.buffer.length - this.maxBytes;
      this.buffer = this.buffer.subarray(drop - (drop % 2));
    }
  }

  get bufferedBytes(): number {
    return this.buffer.length;
  }

  /** Exactly one frame: buffered audio first, padded with silence when short. */
  take(): Buffer {
    const out = Buffer.alloc(this.frameBytes);
    const n = Math.min(this.frameBytes, this.buffer.length);
    this.buffer.copy(out, 0, 0, n);
    this.buffer = this.buffer.subarray(n);
    return out;
  }
}

const QUESTION_START =
  /^(what|why|how|when|where|who|which|whose|can|could|would|will|do|does|did|is|are|was|were|should|shall|have|has|may|might|qué|que|cómo|como|cuándo|cuando|dónde|donde|quién|quien|cuál|cual|por qué|puedes|podrías|tienes|vas)\b/i;

/** Transcripts often drop the question mark, so the opening word counts too. */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?") || t.startsWith("¿")) return true;
  const lastSentence = t.split(/(?<=[.!])\s+/).pop() ?? t;
  return QUESTION_START.test(lastSentence);
}

/** Keeps a model's reply to one short line: no quotes, no preamble, at most `max` characters. */
export function toCue(text: string, max = 90): string {
  let line = text.trim().split("\n").find((l) => l.trim()) ?? "";
  line = line.replace(/^(say this|answer|reply|cue)\s*[:\-–]\s*/i, "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + "…";
}
