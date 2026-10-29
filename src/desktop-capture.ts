// What the desktop page does to a shared tab before the hub sees it: mix the tab's audio with the
// optional microphone into one mono stream (it then goes through the phone's resampler and
// framer, 16 kHz mono PCM16 in 80 ms frames), and decide from small grayscale thumbnails when
// the picture changed enough to be worth sending. Pure and import-free, so the page carries
// these functions as they are and the tests cover the very code it runs.

/** Thumbnail the page draws the shared screen into for comparing: small, so a compare is cheap. */
export const SCENE_THUMB_WIDTH = 64;
export const SCENE_THUMB_HEIGHT = 36;
/** Mean absolute luma difference (0..255) from the last sent picture above which a frame is a new scene. */
export const SCENE_CHANGE_THRESHOLD = 12;

/** Averages any number of channels into one (a stereo tab becomes mono). */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Sums two mono streams (tab + microphone), clipping to -1..1; the longer one keeps its tail. */
export function mixMono(a: Float32Array, b: Float32Array): Float32Array {
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  const out = new Float32Array(long.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, long[i] + (i < short.length ? short[i] : 0)));
  return out;
}

/** RGBA pixels (canvas ImageData) → one luma byte per pixel. */
export function toLuma(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  return out;
}

/** Mean absolute difference between two same-size luma thumbnails, 0..255. */
export function lumaDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Says "send this one" for the first frame and for any frame that differs from the last one sent
 * by more than the threshold. Compares against the last sent frame, not the previous one, so a
 * slow fade is caught once it adds up and a still screen never resends.
 */
export class SceneDetector {
  private last: Uint8Array | null = null;
  private threshold: number;

  constructor(threshold = SCENE_CHANGE_THRESHOLD) {
    this.threshold = threshold;
  }

  changed(luma: Uint8Array): boolean {
    if (this.last && lumaDiff(this.last, luma) <= this.threshold) return false;
    this.last = luma.slice();
    return true;
  }

  /** Forget the last picture (sharing restarted): the next frame is sent. */
  reset(): void {
    this.last = null;
  }
}

/** The functions as page script: the desktop page runs the code the tests cover, types stripped by Node. */
export const DESKTOP_CAPTURE_PAGE_SCRIPT = [
  `const SCENE_THUMB_WIDTH = ${SCENE_THUMB_WIDTH}, SCENE_THUMB_HEIGHT = ${SCENE_THUMB_HEIGHT}, SCENE_CHANGE_THRESHOLD = ${SCENE_CHANGE_THRESHOLD};`,
  downmix,
  mixMono,
  toLuma,
  lumaDiff,
  SceneDetector,
]
  .map(String)
  .join("\n");
