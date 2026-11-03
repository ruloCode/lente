// Speech audio kept next to the text (add-media-archive 1.1, design decisions 2 and 3). The audio that
// passes the silence gate is buffered per open segment and cut when the segment closes; each chunk is
// encoded with IMA ADPCM (4 bits a sample, a quarter of PCM16, no dependency) behind a small header that
// says the codec, the rate and the length. Decoding gives back a WAV for playback. Pure: sealing, storage
// and the clock are the hub's.

export const MEDIA_RATE = 16_000;
const MAGIC = "LMAU";
const VERSION = 1;
export const CODEC_IMA_ADPCM = 1;
/** Header: magic (4), version (1), codec (1), rate (2), samples (4), first sample (2), step index (1), reserved (1). */
const HEADER_BYTES = 16;
/** Chunks shorter than this are not kept (a click, a cough). */
export const MIN_CHUNK_MS = 300;
/** A runaway segment is cut here so one chunk stays small (segments close at 40 s anyway). */
export const MAX_CHUNK_MS = 60_000;

// IMA ADPCM's standard tables.
const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408,
  449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630,
  9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** PCM16 LE mono → a chunk: header, then two samples per byte (low nibble first). */
export function encodeAdpcm(pcm: Uint8Array): Uint8Array {
  const samples = Math.floor(pcm.length / 2);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const out = new Uint8Array(HEADER_BYTES + Math.ceil(Math.max(0, samples - 1) / 2));
  const head = new DataView(out.buffer);
  out.set(new TextEncoder().encode(MAGIC), 0);
  head.setUint8(4, VERSION);
  head.setUint8(5, CODEC_IMA_ADPCM);
  head.setUint16(6, MEDIA_RATE, true);
  head.setUint32(8, samples, true);
  if (!samples) return out;
  let predicted = view.getInt16(0, true);
  let index = 0;
  head.setInt16(12, predicted, true);
  head.setUint8(14, index);
  for (let i = 1; i < samples; i++) {
    const sample = view.getInt16(i * 2, true);
    const step = STEP_TABLE[index]!;
    let diff = sample - predicted;
    let code = 0;
    if (diff < 0) {
      code = 8;
      diff = -diff;
    }
    let delta = step >> 3;
    if (diff >= step) (code |= 4, (diff -= step), (delta += step));
    if (diff >= step >> 1) (code |= 2, (diff -= step >> 1), (delta += step >> 1));
    if (diff >= step >> 2) (code |= 1, (delta += step >> 2));
    predicted = clamp(code & 8 ? predicted - delta : predicted + delta, -32768, 32767);
    index = clamp(index + INDEX_TABLE[code]!, 0, 88);
    const at = HEADER_BYTES + ((i - 1) >> 1);
    out[at] = (i - 1) % 2 === 0 ? code : out[at]! | (code << 4);
  }
  return out;
}

export interface ChunkInfo {
  codec: number;
  rate: number;
  samples: number;
  ms: number;
}

export function chunkInfo(chunk: Uint8Array): ChunkInfo {
  if (chunk.length < HEADER_BYTES || new TextDecoder().decode(chunk.subarray(0, 4)) !== MAGIC) throw new Error("media chunk: not a Lente audio chunk");
  const head = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (head.getUint8(4) !== VERSION) throw new Error(`media chunk: version ${head.getUint8(4)}, this hub reads ${VERSION}`);
  const rate = head.getUint16(6, true);
  const samples = head.getUint32(8, true);
  return { codec: head.getUint8(5), rate, samples, ms: Math.round((samples / rate) * 1000) };
}

/** A chunk back to PCM16 LE mono. */
export function decodeAdpcm(chunk: Uint8Array): Uint8Array {
  const info = chunkInfo(chunk);
  if (info.codec !== CODEC_IMA_ADPCM) throw new Error(`media chunk: codec ${info.codec} is not IMA ADPCM`);
  const head = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (chunk.length < HEADER_BYTES + Math.ceil(Math.max(0, info.samples - 1) / 2)) throw new Error("media chunk: truncated");
  const out = new Uint8Array(info.samples * 2);
  const view = new DataView(out.buffer);
  if (!info.samples) return out;
  let predicted = head.getInt16(12, true);
  let index = head.getUint8(14);
  view.setInt16(0, predicted, true);
  for (let i = 1; i < info.samples; i++) {
    const byte = chunk[HEADER_BYTES + ((i - 1) >> 1)]!;
    const code = (i - 1) % 2 === 0 ? byte & 0x0f : byte >> 4;
    const step = STEP_TABLE[index]!;
    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;
    predicted = clamp(code & 8 ? predicted - delta : predicted + delta, -32768, 32767);
    index = clamp(index + INDEX_TABLE[code]!, 0, 88);
    view.setInt16(i * 2, predicted, true);
  }
  return out;
}

/** PCM16 mono as a WAV file, for playback. */
export function wav(pcm: Uint8Array, rate = MEDIA_RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => out.set(new TextEncoder().encode(s), at);
  text(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

export interface AudioChunk {
  /** The segment it belongs to (`s<meeting id>:<n>` or `s<day>:<n>`). */
  segment: string;
  at: number;
  ms: number;
  bytes: Uint8Array;
}

/**
 * The open segment's audio: `push` appends gated PCM, `cut` closes it into a chunk (or nothing when it
 * is too short), `drop` discards it (a switch turned off mid-segment keeps nothing after that moment).
 */
export class AudioBuffer {
  private parts: Uint8Array[] = [];
  private length = 0;
  private startedAt: number | undefined;

  push(pcm: Uint8Array, at: number): void {
    if (this.length >= (MAX_CHUNK_MS / 1000) * MEDIA_RATE * 2) return;
    this.startedAt ??= at;
    this.parts.push(pcm);
    this.length += pcm.length;
  }

  get ms(): number {
    return Math.round((this.length / 2 / MEDIA_RATE) * 1000);
  }

  cut(segment: string): AudioChunk | undefined {
    const ms = this.ms;
    const at = this.startedAt;
    const pcm = new Uint8Array(this.length);
    let off = 0;
    for (const p of this.parts) (pcm.set(p, off), (off += p.length));
    this.drop();
    if (ms < MIN_CHUNK_MS || at === undefined) return undefined;
    return { segment, at, ms, bytes: encodeAdpcm(pcm) };
  }

  drop(): void {
    this.parts = [];
    this.length = 0;
    this.startedAt = undefined;
  }
}
