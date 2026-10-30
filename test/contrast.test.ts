import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_TEXT_PAIRS, contrast, parseColor, readTokens, tokenContrast, type Theme } from "../src/contrast.ts";
import { PILOT_PAGE } from "../src/pilot-page.ts";

const AAA = 7;
const css = PILOT_PAGE.slice(PILOT_PAGE.indexOf("<style>"), PILOT_PAGE.indexOf("</style>"));

for (const theme of ["light", "dark"] as Theme[]) {
  test(`every text color pair measures ${AAA}:1 or more in ${theme}`, () => {
    const tokens = readTokens(css, theme);
    const low = PAGE_TEXT_PAIRS.map(([t, s, where]) => ({ pair: `${t} on ${s} (${where})`, ratio: tokenContrast(tokens, t, s) })).filter((p) => p.ratio < AAA);
    assert.deepEqual(low, [], `pairs under ${AAA}:1 in ${theme}`);
  });
}

test("light and dark really differ, and the dark theme follows the system setting", () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  const [l, d] = [readTokens(css, "light"), readTokens(css, "dark")];
  assert.notEqual(l.bg, d.bg);
  assert.notEqual(l.ink, d.ink);
});

test("contrast math matches the WCAG reference values", () => {
  assert.equal(Math.round(contrast(parseColor("#000"), parseColor("#fff")) * 100) / 100, 21);
  assert.equal(Math.round(contrast(parseColor("#767676"), parseColor("#ffffff")) * 100) / 100, 4.54);
  assert.throws(() => parseColor("hsl(0 0% 0%)"), /not a color/);
});
