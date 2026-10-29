import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { iconPng, logoSvg, webManifest } from "../src/brand.ts";

function decode(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLength = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.equal(raw.length, height * (1 + width * 3));
  const pixel = (x: number, y: number) => Array.from(raw.subarray(y * (1 + width * 3) + 1 + x * 3, y * (1 + width * 3) + 4 + x * 3));
  return { width, height, pixel };
}

test("icon PNG is a valid image with graphite tile, ink lens and cyan line", () => {
  const { width, height, pixel } = decode(iconPng(100));
  assert.deepEqual([width, height], [100, 100]);
  assert.deepEqual(pixel(2, 2), [0x0b, 0x10, 0x13], "corner is graphite");
  assert.deepEqual(pixel(50, 46), [0x0b, 0x10, 0x13], "inside the lens is graphite");
  assert.deepEqual(pixel(50, 76), [0x4f, 0xd0, 0xd8], "the line is cyan");
  assert.deepEqual(pixel(26, 46), [0xe6, 0xed, 0xef], "the lens ring is ink");
});

test("manifest declares name, standalone display and PNG icons the hub serves", () => {
  const m = JSON.parse(webManifest());
  assert.equal(m.name, "Lente");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i: { sizes: string }) => i.sizes === "192x192"));
  assert.ok(m.icons.some((i: { purpose: string }) => i.purpose === "maskable"));
  assert.match(logoSvg(), /^<svg [^>]*viewBox="0 0 100 100"/);
  assert.ok(!logoSvg(false).includes("<rect"));
});

test("the phone page keeps the identity rules: cyan only on the line to say, amber only on measured numbers", async () => {
  const { PILOT_PAGE } = await import("../src/pilot-page.ts");
  const rulesUsing = (token: string) =>
    [...PILOT_PAGE.matchAll(/^\s*([^{}\n]+)\{[^}]*var\(--(\w+)\)[^}]*\}/gm)].filter((m) => m[2] === token).map((m) => m[1].trim());
  assert.deepEqual(rulesUsing("cyan"), [".cue .text", ".item.k-cue p"]);
  assert.deepEqual(rulesUsing("amber"), [".meta"]);
  assert.match(PILOT_PAGE, /id="cue-label">DILO</);
  assert.doesNotMatch(PILOT_PAGE, /SAY THIS<|"Say this: "/);
});

test("the Dilo card shows the Spanish meaning muted and hidden until a cue carries one, and never speaks it", async () => {
  const { PILOT_PAGE } = await import("../src/pilot-page.ts");
  assert.match(PILOT_PAGE, /id="cue-text"><\/div>\s*<div class="meaning" id="cue-meaning"[^>]* hidden>/);
  assert.match(PILOT_PAGE, /\.cue \.meaning \{[^}]*color: var\(--muted\)/);
  assert.match(PILOT_PAGE, /\$\("cue-meaning"\)\.hidden = !m\.meaning;/);
  assert.doesNotMatch(PILOT_PAGE, /say\([^)]*meaning/);
});
