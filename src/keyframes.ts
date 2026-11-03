// Keyframes on change (add-media-archive 1.3, design decision 4): of the frames the camera already
// described, keep one only when the scene changed and at least 30 s passed since the last kept one, and
// only while «Guardar fotos» is on. A scene changed when the descriptions share few words, or when a cheap
// signature of the JPEG moved: its size and a histogram of its entropy-coded scan bytes, read without
// decoding the image. Pure.

import { terms } from "./terms.ts";

export const KEYFRAME_FLOOR_MS = 30_000;
/** Descriptions sharing at most this share of their words (Jaccard) are a new scene. */
export const DESCRIPTION_OVERLAP_MAX = 0.5;
/** A signature distance from the last kept frame at or above this is a new scene. */
export const SIGNATURE_MOVE_MIN = 0.2;
const BUCKETS = 16;

export interface JpegSignature {
  size: number;
  /** Share of the scan's bytes in each of 16 value buckets. */
  histogram: Float64Array;
}

/** The signature of a JPEG (SOI … SOS header, scan, EOI), or undefined when it is not one. */
export function jpegSignature(jpeg: Uint8Array): JpegSignature | undefined {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return undefined;
  // Walk the markers to the start of scan; its header length follows the marker.
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) return undefined;
    const marker = jpeg[i + 1]!;
    const length = (jpeg[i + 2]! << 8) | jpeg[i + 3]!;
    if (marker === 0xda) {
      i += 2 + length;
      break;
    }
    i += 2 + length;
  }
  if (i >= jpeg.length) return undefined;
  const histogram = new Float64Array(BUCKETS);
  let n = 0;
  for (let k = i; k < jpeg.length - 2; k++) {
    histogram[jpeg[k]! >> 4]!++;
    n++;
  }
  if (!n) return undefined;
  for (let b = 0; b < BUCKETS; b++) histogram[b]! /= n;
  return { size: jpeg.length, histogram };
}

/** 0 for the same picture, larger as the scene moves: half the histogram's L1 distance plus the relative size change. */
export function signatureDistance(a: JpegSignature, b: JpegSignature): number {
  let l1 = 0;
  for (let k = 0; k < BUCKETS; k++) l1 += Math.abs(a.histogram[k]! - b.histogram[k]!);
  return l1 / 2 + Math.abs(a.size - b.size) / Math.max(a.size, b.size);
}

/** Jaccard overlap of two descriptions' terms. */
export function descriptionOverlap(a: string, b: string): number {
  const x = new Set(terms(a));
  const y = new Set(terms(b));
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

export interface Frame {
  at: number;
  description: string;
  jpeg: Uint8Array;
}

/** Decides, frame by frame, which described frames are kept. */
export class KeyframePicker {
  private last: { at: number; description: string; signature?: JpegSignature } | undefined;

  /** Whether to keep this frame; `photosOn` is the wearer's «Guardar fotos». */
  consider(frame: Frame, photosOn: boolean): boolean {
    if (!photosOn) return false;
    const signature = jpegSignature(frame.jpeg);
    if (!signature) return false;
    const prev = this.last;
    const changed = !prev || descriptionOverlap(prev.description, frame.description) <= DESCRIPTION_OVERLAP_MAX || (prev.signature !== undefined && signatureDistance(prev.signature, signature) >= SIGNATURE_MOVE_MIN);
    if (!changed || (prev && frame.at - prev.at < KEYFRAME_FLOOR_MS)) return false;
    this.last = { at: frame.at, description: frame.description, signature };
    return true;
  }
}
