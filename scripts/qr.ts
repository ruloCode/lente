// A QR code as an SVG, with no dependency (ship-hackathon 5.3): byte mode, versions 1–10, any of the
// four error-correction levels, the mask with the lowest penalty. Written from the QR Code standard
// (ISO/IEC 18004): Reed–Solomon over GF(256), block interleaving, the zigzag placement, format and
// version information. Enough for a link; not a general-purpose encoder.
//
//   node scripts/qr.ts                                   the APK link → site/assets/qr-apk.svg
//   node scripts/qr.ts <text> [--out file.svg] [--ecl L|M|Q|H] [--text]
//
// `--text` prints the modules as rows of 0 and 1 instead (for checking with another decoder).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The stable download link the website's QR code points to. */
export const APK_URL = "https://github.com/ruloCode/lente/releases/latest/download/lente.apk";
/** Where the site's QR code is written. */
export const APK_QR_PATH = fileURLToPath(new URL("../site/assets/qr-apk.svg", import.meta.url));
/** Light modules around the code, in modules (the standard asks for 4). */
export const QUIET_ZONE = 4;

export type Ecl = "L" | "M" | "Q" | "H";
/** A square of modules, `true` = dark, indexed `[row][column]`. */
export type QrMatrix = boolean[][];

/** The two bits each level writes into the format information. */
const ECL_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * Error correction per version (1–10) and level: EC codewords per block, then blocks and data
 * codewords for group 1 and, when the version has one, group 2. From the standard's table 9.
 */
const BLOCKS: Record<Ecl, number[][]> = {
  L: [[7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108], [18, 2, 68], [20, 2, 78], [24, 2, 97], [30, 2, 116], [18, 2, 68, 2, 69]],
  M: [[10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
  Q: [[13, 1, 13], [22, 1, 22], [18, 2, 17], [26, 2, 24], [18, 2, 15, 2, 16], [24, 4, 19], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
  H: [[17, 1, 9], [28, 1, 16], [22, 2, 13], [16, 4, 9], [22, 2, 11, 2, 12], [28, 4, 15], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]],
};

/** Centres of the alignment patterns per version (version 1 has none). */
const ALIGNMENT: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

export const MAX_VERSION = 10;

/** Total codewords (data and error correction) a version holds. */
export function totalCodewords(version: number): number {
  const size = 4 * version + 17;
  let modules = size * size - 3 * 64 - 2 * (size - 16) - 31; // finders with separators and format, timing, dark module
  const n = ALIGNMENT[version - 1]!.length;
  if (n > 0) modules -= (n * n - 3) * 25 - 2 * (n - 2) * 5; // alignment patterns, less where they cross the timing lines
  if (version >= 7) modules -= 36;
  return Math.floor(modules / 8);
}

/** The data blocks of a version and level, as their data codeword counts, and the EC codewords per block. */
export function blockLayout(version: number, ecl: Ecl): { ecPerBlock: number; dataPerBlock: number[] } {
  const [ec, n1, d1, n2 = 0, d2 = 0] = BLOCKS[ecl][version - 1]!;
  return { ecPerBlock: ec!, dataPerBlock: [...Array<number>(n1!).fill(d1!), ...Array<number>(n2).fill(d2)] };
}

export const dataCapacity = (version: number, ecl: Ecl): number => blockLayout(version, ecl).dataPerBlock.reduce((a, b) => a + b, 0);

// --- Reed–Solomon over GF(256), polynomial x^8 + x^4 + x^3 + x^2 + 1 ----------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** The generator polynomial of degree `n`, highest coefficient first (the leading 1 left out). */
function generator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** The `n` error-correction codewords of one block. */
export function reedSolomon(data: readonly number[], n: number): number[] {
  const gen = generator(n);
  const rem = new Array<number>(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= gfMul(gen[i]!, factor);
  }
  return rem;
}

// --- Data codewords ------------------------------------------------------------------------------

/** The smallest version (1–10) whose capacity at `ecl` holds `byteLength` bytes in byte mode. */
export function pickVersion(byteLength: number, ecl: Ecl): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + 8 * byteLength <= 8 * dataCapacity(v, ecl)) return v;
  }
  throw new Error(`QR: ${byteLength} bytes do not fit in version ${MAX_VERSION} at level ${ecl}; use a shorter text or a lower level`);
}

/** Mode, length, the bytes, the terminator and the pad codewords, as data codewords. */
export function dataCodewords(bytes: Uint8Array, version: number, ecl: Ecl): number[] {
  const capacityBits = 8 * dataCapacity(version, ecl);
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  if (bits.length > capacityBits) throw new Error(`QR: the text needs ${bits.length} bits and version ${version}-${ecl} holds ${capacityBits}`);
  put(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < capacityBits / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Splits the data into blocks, adds each block's EC codewords, and interleaves them. */
export function interleave(data: readonly number[], version: number, ecl: Ecl): number[] {
  const { ecPerBlock, dataPerBlock } = blockLayout(version, ecl);
  const blocks: number[][] = [];
  let at = 0;
  for (const n of dataPerBlock) {
    blocks.push(data.slice(at, at + n));
    at += n;
  }
  const ecs = blocks.map((b) => reedSolomon(b, ecPerBlock));
  const out: number[] = [];
  const longest = Math.max(...dataPerBlock);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < ecPerBlock; i++) for (const e of ecs) out.push(e[i]!);
  return out;
}

// --- The matrix ----------------------------------------------------------------------------------

/** The 15 format bits: level and mask, BCH(15,5), XOR-ed with the standard's mask. */
export function formatBits(ecl: Ecl, mask: number): number {
  const data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** The 18 version bits for versions 7 and up: BCH(18,6). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

class Grid {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(r: number, c: number, on: boolean) {
    this.dark[r]![c] = on;
    this.fixed[r]![c] = true;
  }
}

/** Finders, separators, timing, alignment, the dark module and the reserved format/version areas. */
function functionPatterns(version: number): Grid {
  const g = new Grid(4 * version + 17);
  const n = g.size;
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        g.set(rr, cc, ring !== 2 && ring !== 4);
      }
    }
  }
  for (let i = 8; i < n - 8; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  const centres = ALIGNMENT[version - 1]!;
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) g.set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  writeFormat(g, 0); // reserves the areas; the real bits go in once the mask is chosen
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.set(b, a, on);
      g.set(a, b, on);
    }
  }
  return g;
}

/** Both copies of the format information, and the dark module beside the lower-left finder. */
function writeFormat(g: Grid, bits: number) {
  const n = g.size;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) g.set(i, 8, bit(i));
  g.set(7, 8, bit(6));
  g.set(8, 8, bit(7));
  g.set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) g.set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) g.set(8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) g.set(n - 15 + i, 8, bit(i));
  g.set(n - 8, 8, true);
}

/** Places the codewords in the zigzag: two-column strips from the right, skipping the timing column. */
function placeCodewords(g: Grid, codewords: readonly number[]) {
  const n = g.size;
  const total = codewords.length * 8;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (g.fixed[r]![c] || i >= total) continue;
        g.dark[r]![c] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

function applyMask(g: Grid, mask: number): boolean[][] {
  const test = MASKS[mask]!;
  return g.dark.map((row, r) => row.map((on, c) => (g.fixed[r]![c] ? on : on !== test(r, c))));
}

/** The standard's four penalty rules; the mask with the lowest score is used. */
export function penalty(m: QrMatrix): number {
  const n = m.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    lines.push(m[i]!);
    lines.push(m.map((row) => row[i]!));
  }
  const finderLike = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 7 <= n; i++) {
      if (!finderLike.every((v, k) => line[i + k] === v)) continue;
      const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
      const lightAfter = i + 11 <= n && [7, 8, 9, 10].every((k) => !line[i + k]);
      if (lightBefore) score += 40;
      if (lightAfter) score += 40;
    }
  }
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const v = m[r]![c];
      if (m[r]![c + 1] === v && m[r + 1]![c] === v && m[r + 1]![c + 1] === v) score += 3;
    }
  }
  const darkCount = m.reduce((a, row) => a + row.filter(Boolean).length, 0);
  score += 10 * Math.floor(Math.abs((darkCount * 100) / (n * n) - 50) / 5);
  return score;
}

export interface QrCode {
  version: number;
  ecl: Ecl;
  mask: number;
  matrix: QrMatrix;
}

/** Encodes `text` as UTF-8 bytes in the smallest version that fits at `ecl`. */
export function encodeQr(text: string, ecl: Ecl = "M"): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length, ecl);
  const codewords = interleave(dataCodewords(bytes, version, ecl), version, ecl);
  const base = functionPatterns(version);
  placeCodewords(base, codewords);
  let best: QrCode | undefined;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(base.size);
    for (let r = 0; r < g.size; r++) {
      g.dark[r] = [...base.dark[r]!];
      g.fixed[r] = [...base.fixed[r]!];
    }
    writeFormat(g, formatBits(ecl, mask));
    const matrix = applyMask(g, mask);
    const score = penalty(matrix);
    if (score < bestScore) {
      bestScore = score;
      best = { version, ecl, mask, matrix };
    }
  }
  return best!;
}

/** The code as a small SVG: one path of dark squares on a white square with the quiet zone. */
export function qrSvg(matrix: QrMatrix, { title = "", quiet = QUIET_ZONE }: { title?: string; quiet?: number } = {}): string {
  const n = matrix.length + 2 * quiet;
  let d = "";
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let w = 1;
      while (c + w < row.length && row[c + w]) w++;
      d += `M${c + quiet} ${r + quiet}h${w}v1h-${w}z`;
      c += w;
    }
  });
  const esc = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const label = title ? ` role="img" aria-label="${esc.replace(/"/g, "&quot;")}"` : ` aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"${label}>${title ? `<title>${esc}</title>` : ""}<rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${d}"/></svg>\n`;
}

/** The site's QR code for the APK link, exactly as `node scripts/qr.ts` writes it. */
export const apkQrSvg = (): string => qrSvg(encodeQr(APK_URL, "M").matrix, { title: `QR: ${APK_URL}` });

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const asText = args.includes("--text");
  if (asText) args.splice(args.indexOf("--text"), 1);
  const out = flag("--out");
  const ecl = (flag("--ecl") ?? "M").toUpperCase();
  if (!["L", "M", "Q", "H"].includes(ecl)) throw new Error(`QR: --ecl must be L, M, Q or H, not ${ecl}`);
  const text = args[0] ?? APK_URL;
  const code = encodeQr(text, ecl as Ecl);
  if (asText) {
    console.log(code.matrix.map((row) => row.map((on) => (on ? "1" : "0")).join("")).join("\n"));
  } else {
    const path = out ?? (args[0] ? undefined : APK_QR_PATH);
    const svg = path === APK_QR_PATH ? apkQrSvg() : qrSvg(code.matrix, { title: `QR: ${text}` });
    if (path) {
      writeFileSync(path, svg);
      console.log(`wrote ${path}: version ${code.version}-${code.ecl}, mask ${code.mask}, ${code.matrix.length} modules`);
    } else process.stdout.write(svg);
  }
}
