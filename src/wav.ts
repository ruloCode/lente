// Reads the PCM payload of a WAV file. Meta's realtime transcription wants
// signed 16-bit little-endian mono at 24 kHz (preferred) or 16 kHz.

export interface Pcm16 {
  sampleRate: number;
  data: Buffer;
}

export function readPcm16Wav(file: Buffer): Pcm16 {
  if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let format: { channels: number; sampleRate: number; bits: number; codec: number } | undefined;
  while (offset + 8 <= file.length) {
    const id = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        codec: file.readUInt16LE(body),
        channels: file.readUInt16LE(body + 2),
        sampleRate: file.readUInt32LE(body + 4),
        bits: file.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!format) throw new Error("WAV data chunk before fmt chunk");
      if (format.codec !== 1 || format.bits !== 16 || format.channels !== 1) {
        throw new Error(
          `Expected PCM16 mono, got codec=${format.codec} bits=${format.bits} channels=${format.channels}. ` +
            "Convert with: ffmpeg -i in.m4a -ac 1 -ar 24000 -c:a pcm_s16le out.wav",
        );
      }
      return { sampleRate: format.sampleRate, data: file.subarray(body, body + size) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Bytes per frame of `ms` milliseconds of PCM16 mono audio. */
export function frameBytes(sampleRate: number, ms: number): number {
  return Math.round((sampleRate * 2 * ms) / 1000);
}
