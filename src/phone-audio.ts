// What the phone page does to its microphone before the hub hears it: resample the browser's
// audio (usually 48 kHz, float) to 16 kHz mono PCM16, cut it into 80 ms frames and wrap them as
// clip protocol v2 uplink frames. Pure and import-free, so the phone page carries these
// functions as they are and the tests cover the very code it runs.

/** Samples in one audio frame: 80 ms at 16 kHz, the clip's frame. */
export const PHONE_FRAME_SAMPLES = 1280;

/**
 * Streaming downsampler: each output sample is the average of the input it spans (the average
 * is also a crude low-pass against aliasing). Keeps its position between chunks, so cutting the
 * input anywhere gives the same output.
 */
export class PcmResampler {
  private step: number;
  /** Output samples produced so far: window n spans input [n * step, (n + 1) * step) from the start. */
  private produced = 0;
  /** Input samples dropped from the front of the buffer so far. */
  private dropped = 0;
  private tail: number[] = [];

  constructor(inRate: number, outRate = 16000) {
    this.step = inRate / outRate;
  }

  /** Float samples in -1..1 at the input rate → PCM16 at the output rate. */
  push(input: Float32Array): Int16Array {
    const buf = this.tail.length ? Float32Array.from([...this.tail, ...input]) : input;
    const out: number[] = [];
    // An output sample needs the whole of its window to be in the buffer.
    while ((this.produced + 1) * this.step <= this.dropped + buf.length) {
      const from = this.produced * this.step;
      const to = from + this.step;
      let sum = 0;
      for (let i = Math.floor(from); i < Math.ceil(to); i++) {
        const weight = Math.min(i + 1, to) - Math.max(i, from);
        sum += buf[i - this.dropped] * weight;
      }
      const v = Math.max(-1, Math.min(1, sum / this.step));
      out.push(Math.round(v < 0 ? v * 32768 : v * 32767));
      this.produced++;
    }
    const keep = Math.floor(this.produced * this.step) - this.dropped;
    this.tail = Array.from(buf.subarray(keep));
    this.dropped += keep;
    return Int16Array.from(out);
  }
}

/** Collects PCM16 samples and hands them back in whole frames of `frameSamples`. */
export class PcmFramer {
  private frameSamples: number;
  private pending: Int16Array = new Int16Array(0);

  constructor(frameSamples = PHONE_FRAME_SAMPLES) {
    this.frameSamples = frameSamples;
  }

  push(samples: Int16Array): Int16Array[] {
    const all = new Int16Array(this.pending.length + samples.length);
    all.set(this.pending);
    all.set(samples, this.pending.length);
    const frames: Int16Array[] = [];
    let at = 0;
    for (; at + this.frameSamples <= all.length; at += this.frameSamples) frames.push(all.slice(at, at + this.frameSamples));
    this.pending = all.slice(at);
    return frames;
  }
}

/** One uplink frame: 1 byte type, u32 LE length, payload (see src/clip-protocol.ts). */
export function uplinkFrame(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = type.charCodeAt(0);
  new DataView(out.buffer).setUint32(1, payload.length, true);
  out.set(payload, 5);
  return out;
}

/** The hello a phone opens with: protocol 2.0, PCM16 at 16 kHz, no camera stream of its own. */
export function phoneHello(fw: string): Uint8Array {
  const hello = { proto: "2.0", device: "lente-phone", fw, codec: "pcm16", rate: 16000, rssi: 0, camera: false };
  return uplinkFrame("H", new TextEncoder().encode(JSON.stringify(hello)));
}

/** An audio frame: u32 LE sequence, u32 LE capture ms, then the samples as little-endian PCM16. */
export function phoneAudioFrame(seq: number, captureMs: number, samples: Int16Array): Uint8Array {
  const payload = new Uint8Array(8 + samples.length * 2);
  const view = new DataView(payload.buffer);
  view.setUint32(0, seq >>> 0, true);
  view.setUint32(4, captureMs >>> 0, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(8 + i * 2, samples[i], true);
  return uplinkFrame("A", payload);
}

/** The functions as page script: the phone runs the code the tests cover, types stripped by Node. */
export const PHONE_AUDIO_PAGE_SCRIPT = [`const PHONE_FRAME_SAMPLES = ${PHONE_FRAME_SAMPLES};`, PcmResampler, PcmFramer, uplinkFrame, phoneHello, phoneAudioFrame]
  .map(String)
  .join("\n");
