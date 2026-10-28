// What travels between the clip and the hub, and how its audio is cleaned up.
// Pure: no sockets here, so all of it is unit-tested.
//
// Uplink (clip → hub) is a stream of frames: 1 byte type, 4 bytes little-endian
// length, payload. Types: "H" hello (JSON, protocol v2), "A" audio, "J" JPEG.
// An audio payload is an 8-byte header (u32 LE sequence, u32 LE capture ms since the
// clip started) followed by PCM16 mono samples at the rate the hello declared.
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

export const PROTOCOL_MAJOR = 2;
export const SAMPLE_RATE = 16000;
export const AUDIO_HEADER_BYTES = 8;
/** PCM16 mono at SAMPLE_RATE: bytes per millisecond of audio. */
export const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
/** A gap longer than this is counted in full but only this much silence is inserted. */
const MAX_FILL_MS = 10_000;

export interface ClipHello {
  proto: string;
  fw: string;
  codec: string;
  rate: number;
  device?: string;
}

export type HelloResult = { ok: true; hello: ClipHello } | { ok: false; reason: string };

/** Reads the first frame of a connection. A v1 hello has no `proto`, so it counts as major 1. */
export function parseHello(payload: Buffer): HelloResult {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "the hello frame is not valid JSON" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "the hello frame is not a JSON object" };
  const proto = typeof raw.proto === "string" ? raw.proto : "1.0";
  const major = Number(proto.split(".")[0]);
  if (!Number.isInteger(major)) return { ok: false, reason: `the hello declares an unreadable protocol version "${proto}"` };
  const fw = typeof raw.fw === "string" ? raw.fw : "unknown";
  if (major !== PROTOCOL_MAJOR) {
    return { ok: false, reason: `clip firmware ${fw} speaks protocol ${proto} but this hub speaks ${PROTOCOL_MAJOR}.x: update the clip firmware` };
  }
  const codec = typeof raw.codec === "string" ? raw.codec : "";
  const rate = typeof raw.rate === "number" ? raw.rate : 0;
  if (codec !== "pcm16" || rate !== SAMPLE_RATE) {
    return { ok: false, reason: `the clip declares codec "${codec}" at ${rate} Hz; this hub accepts only pcm16 at ${SAMPLE_RATE} Hz` };
  }
  return { ok: true, hello: { proto, fw, codec, rate, device: typeof raw.device === "string" ? raw.device : undefined } };
}

export interface AudioFrame {
  seq: number;
  timeMs: number;
  pcm: Buffer;
}

/** Splits an "A" payload into its header fields and the PCM16 samples. */
export function parseAudioFrame(payload: Buffer): AudioFrame {
  if (payload.length < AUDIO_HEADER_BYTES) throw new Error(`audio frame of ${payload.length} bytes is shorter than its ${AUDIO_HEADER_BYTES}-byte header`);
  return {
    seq: payload.readUInt32LE(0),
    timeMs: payload.readUInt32LE(4),
    pcm: payload.subarray(AUDIO_HEADER_BYTES, AUDIO_HEADER_BYTES + ((payload.length - AUDIO_HEADER_BYTES) & ~1)),
  };
}

/**
 * Follows audio sequence numbers on one connection. A gap is counted as lost frames and
 * filled with silence of the missing duration, so the timeline stays aligned with the clip.
 * A frame that arrives behind the expected sequence (late or duplicate) is counted and dropped.
 */
export class AudioTimeline {
  lost = 0;
  late = 0;
  received = 0;
  private expected: number | undefined;
  private emittedBytes = 0;
  private frameBytes: number;

  constructor(frameBytes: number) {
    this.frameBytes = frameBytes;
  }

  /** Length of the timeline so far, in ms of audio (received plus silence fill). */
  get positionMs(): number {
    return this.emittedBytes / BYTES_PER_MS;
  }

  accept(seq: number, pcm: Buffer): { pcm: Buffer; lost: number } {
    if (this.expected !== undefined && seq < this.expected) {
      this.late++;
      return { pcm: Buffer.alloc(0), lost: 0 };
    }
    const lost = this.expected === undefined ? 0 : seq - this.expected;
    this.expected = seq + 1;
    this.received++;
    this.lost += lost;
    const fillFrames = Math.min(lost, Math.floor((MAX_FILL_MS * BYTES_PER_MS) / this.frameBytes));
    const out = fillFrames ? Buffer.concat([Buffer.alloc(fillFrames * this.frameBytes), pcm]) : pcm;
    this.emittedBytes += out.length;
    return { pcm: out, lost };
  }
}

/**
 * Maps a position in the transcription stream to a position in the session audio. The hub
 * records, for every frame it hands to the stream, where in the session audio that frame
 * starts; a turn's offsets then point to when it was spoken however late the transcript came.
 */
export class StreamMap {
  private starts: number[] = [];
  private frameMs: number;

  constructor(frameMs: number) {
    this.frameMs = frameMs;
  }

  /** Call once per frame delivered to the stream, with that frame's session position. */
  record(sessionMs: number): void {
    this.starts.push(sessionMs);
  }

  sessionMsAt(streamMs: number): number | undefined {
    if (!this.starts.length || streamMs < 0) return undefined;
    const i = Math.min(this.starts.length - 1, Math.floor(streamMs / this.frameMs));
    return this.starts[i] + Math.max(0, streamMs - i * this.frameMs);
  }
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
  private consumed = 0;

  constructor(frameBytes: number, maxBytes: number) {
    this.frameBytes = frameBytes;
    this.maxBytes = maxBytes;
  }

  push(pcm: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, pcm]);
    if (this.buffer.length > this.maxBytes) {
      const drop = this.buffer.length - this.maxBytes;
      this.buffer = this.buffer.subarray(drop - (drop % 2));
      this.consumed += drop - (drop % 2);
    }
  }

  /** Session audio already taken or dropped, in ms: where the next frame starts. Silence padding does not count. */
  get consumedMs(): number {
    return this.consumed / BYTES_PER_MS;
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
    this.consumed += n;
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
