// ship-hackathon 5.3: the zero-dependency QR encoder behind the website's download code.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APK_QR_PATH, APK_URL, MAX_VERSION, apkQrSvg, blockLayout, dataCapacity, dataCodewords, encodeQr, formatBits, interleave, pickVersion, qrSvg, reedSolomon, totalCodewords, versionBits } from "../scripts/qr.ts";

test("every version and level adds up to the version's codewords", () => {
  const totals = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  for (let v = 1; v <= MAX_VERSION; v++) {
    assert.equal(totalCodewords(v), totals[v - 1], `version ${v}`);
    for (const ecl of ["L", "M", "Q", "H"] as const) {
      const { ecPerBlock, dataPerBlock } = blockLayout(v, ecl);
      assert.equal(dataCapacity(v, ecl) + ecPerBlock * dataPerBlock.length, totals[v - 1], `${v}-${ecl}`);
    }
  }
});

test("Reed–Solomon: the standard's worked example (HELLO WORLD, 1-M)", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(reedSolomon(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.deepEqual(interleave(data, 1, "M"), [...data, 196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("format and version information match the standard's tables", () => {
  assert.equal(formatBits("L", 0).toString(2).padStart(15, "0"), "111011111000100");
  assert.equal(formatBits("M", 0).toString(2).padStart(15, "0"), "101010000010010");
  assert.equal(formatBits("Q", 0).toString(2).padStart(15, "0"), "011010101011111");
  assert.equal(formatBits("H", 0).toString(2).padStart(15, "0"), "001011010001001");
  assert.equal(formatBits("M", 5).toString(2).padStart(15, "0"), "100000011001110");
  assert.equal(versionBits(7).toString(2).padStart(18, "0"), "000111110010010100");
  assert.equal(versionBits(10).toString(2).padStart(18, "0"), "001010010011010011");
});

test("byte mode: mode, count, the bytes, terminator and the EC/11 padding", () => {
  const cw = dataCodewords(new TextEncoder().encode("ab"), 1, "M");
  assert.equal(cw.length, 16);
  // 0100 | 00000010 | 01100001 | 01100010 | 0000 → 0x40 0x26 0x16 0x20, then pads
  assert.deepEqual(cw.slice(0, 4), [0x40, 0x26, 0x16, 0x20]);
  assert.deepEqual(cw.slice(4, 8), [0xec, 0x11, 0xec, 0x11]);
  assert.throws(() => pickVersion(400, "H"), /do not fit/);
});

test("the APK link: version 5-M, the three finders, timing, and the site's SVG is current", () => {
  assert.equal(new TextEncoder().encode(APK_URL).length, 68);
  assert.equal(pickVersion(68, "M"), 5);
  const { version, matrix, mask } = encodeQr(APK_URL, "M");
  assert.equal(version, 5);
  assert.equal(matrix.length, 37);
  assert.ok(mask >= 0 && mask < 8);
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      assert.equal(matrix[r0 + r]![c0 + c], ring !== 2, `finder at ${r0},${c0} module ${r},${c}`);
    }
  };
  finder(0, 0);
  finder(0, 30);
  finder(30, 0);
  for (let i = 8; i < 29; i++) {
    assert.equal(matrix[6]![i], i % 2 === 0, `row timing ${i}`);
    assert.equal(matrix[i]![6], i % 2 === 0, `column timing ${i}`);
  }
  assert.equal(matrix[29]![8], true, "the dark module");
  // Both copies of the format information carry the chosen mask.
  const bits = formatBits("M", mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) assert.equal(matrix[i]![8], bit(i));
  for (let i = 0; i < 8; i++) assert.equal(matrix[8]![36 - i], bit(i));
  const svg = apkQrSvg();
  assert.match(svg, /^<svg [^>]*viewBox="0 0 45 45"/);
  assert.ok(svg.includes(`<title>QR: ${APK_URL}</title>`));
  assert.equal(readFileSync(APK_QR_PATH, "utf8"), svg, "site/assets/qr-apk.svg is what `node scripts/qr.ts` writes");
});

test("the SVG escapes its title and draws only dark runs", () => {
  const svg = qrSvg([[true, true, false], [false, true, false], [false, false, false]], { title: `a<b & "c"`, quiet: 1 });
  assert.ok(svg.includes("<title>a&lt;b &amp; \"c\"</title>"));
  assert.ok(svg.includes('aria-label="a&lt;b &amp; &quot;c&quot;"'));
  assert.ok(svg.includes('d="M1 1h2v1h-2zM2 2h1v1h-1z"'));
});
