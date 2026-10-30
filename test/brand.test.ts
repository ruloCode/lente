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

test("icon PNG is a valid image with the kit's blue tile, a white lens and a light blue line", () => {
  const { width, height, pixel } = decode(iconPng(100));
  assert.deepEqual([width, height], [100, 100]);
  assert.deepEqual(pixel(2, 2), [0x0a, 0x47, 0xc2], "corner is the accent blue");
  assert.deepEqual(pixel(50, 46), [0x0a, 0x47, 0xc2], "inside the lens is the tile");
  assert.deepEqual(pixel(50, 76), [0x8c, 0xc8, 0xff], "the line is light blue");
  assert.deepEqual(pixel(26, 46), [0xff, 0xff, 0xff], "the lens ring is white");
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

test("the phone page keeps the kit's rules: one accent, red only for recording, numbers in the secondary ink", async () => {
  const { PILOT_PAGE } = await import("../src/pilot-page.ts");
  const css = PILOT_PAGE.slice(PILOT_PAGE.indexOf("<style>"), PILOT_PAGE.indexOf("</style>"));
  const rules = [...css.matchAll(/^\s*([^{}\n@]+)\{([^}]*)\}/gm)].map((m) => ({ sel: m[1].trim(), vars: [...m[2].matchAll(/var\(--([\w-]+)/g)].map((v) => v[1]) }));
  const using = (...tokens: string[]) => rules.filter((r) => r.vars.some((v) => tokens.includes(v))).map((r) => r.sel);
  assert.deepEqual(using("cyan"), [".cue .label", ".item.k-cue p"], "the old cyan name now means the accent, only on the DILO label and the replied line");
  assert.deepEqual(using("amber"), [".meta", ".rv.measured"], "measured numbers keep their own token, now the secondary ink");
  assert.match(css, /--amber: var\(--muted\)/);
  for (const sel of using("live", "live-fill", "on-live")) assert.match(sel, /listen|lv|live|rec|record|meet/, `red outside recording: ${sel}`);
  assert.match(css, /\.meta \{[^}]*font-variant-numeric: tabular-nums/);
  assert.doesNotMatch(PILOT_PAGE, /fonts\.googleapis|Barlow|Atkinson|IBM Plex/, "no web fonts");
  assert.match(PILOT_PAGE, /<meta name="theme-color" content="#F2F2F7" media="\(prefers-color-scheme: light\)">/);
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
