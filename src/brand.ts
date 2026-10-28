// The Lente mark ("lens and line") and the files that make the phone app installable.
// Pure: the PNG icons are drawn here from the same geometry as the SVG, so no image
// tooling or binary assets are needed. Colors follow the Calibre identity.

import { crc32, deflateSync } from "node:zlib";

export const BG = "#0b1013";
export const INK = "#e6edef";
export const CYAN = "#4fd0d8";

// Geometry in a 100 × 100 box; everything stays inside the central 80% so the icon survives a mask.
const LENS = { cx: 50, cy: 46, r: 24, stroke: 4.5 };
const LINE = { x1: 30, x2: 70, y: 76, thickness: 5 };

/** The mark on a graphite tile, as SVG. `tile: false` draws only the mark, for the page header. */
export function logoSvg(tile = true): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    (tile ? `<rect width="100" height="100" fill="${BG}"/>` : "") +
    `<circle cx="${LENS.cx}" cy="${LENS.cy}" r="${LENS.r}" fill="none" stroke="${INK}" stroke-width="${LENS.stroke}"/>` +
    `<line x1="${LINE.x1}" y1="${LINE.y}" x2="${LINE.x2}" y2="${LINE.y}" stroke="${CYAN}" stroke-width="${LINE.thickness}" stroke-linecap="round"/>` +
    `</svg>`
  );
}

export function webManifest(): string {
  return JSON.stringify({
    name: "Lente",
    short_name: "Lente",
    description: "Say it in the moment: one line to say, only when you are asked.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BG,
    theme_color: BG,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Whether a point of the 100-box is on the lens ring, or on the line (a capsule). */
function inRing(x: number, y: number): boolean {
  return Math.abs(Math.hypot(x - LENS.cx, y - LENS.cy) - LENS.r) <= LENS.stroke / 2;
}
function inLine(x: number, y: number): boolean {
  const px = Math.min(LINE.x2, Math.max(LINE.x1, x));
  return Math.hypot(x - px, y - LINE.y) <= LINE.thickness / 2;
}

const SAMPLES = 4; // per axis, for smooth edges

export function iconPng(size: number): Buffer {
  const [bg, ink, cyan] = [rgb(BG), rgb(INK), rgb(CYAN)];
  const row = 1 + size * 3;
  const raw = Buffer.alloc(row * size);
  for (let py = 0; py < size; py++) {
    raw[py * row] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let ringHits = 0;
      let lineHits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 100;
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 100;
          if (inLine(x, y)) lineHits++;
          else if (inRing(x, y)) ringHits++;
        }
      }
      const bgHits = SAMPLES * SAMPLES - ringHits - lineHits;
      for (let c = 0; c < 3; c++) {
        raw[py * row + 1 + px * 3 + c] = Math.round((bg[c] * bgHits + ink[c] * ringHits + cyan[c] * lineHits) / (SAMPLES * SAMPLES));
      }
    }
  }
  return pngOf(size, size, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function pngOf(width: number, height: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
