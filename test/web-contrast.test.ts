// add-web-desktop 6.1: every text color pair the web app paints, in light and dark, from the shared
// theme (src/theme.ts) plus the few colors web/app/app.css adds (topics, warnings, the sidebar).
// WCAG AA asks 4.5:1 for body text; the app holds the theme's 7:1 (AAA) on every pair.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type Theme, readTokens, tokenContrast } from "../src/contrast.ts";
import { THEME_TOKENS } from "../src/theme.ts";

const AAA = 7;
const appCss = readFileSync(new URL("../web/app/app.css", import.meta.url), "utf8");

/** The app's own custom properties for a theme: the first :root line, and the explicit dark block. */
function appTokens(theme: Theme): Record<string, string> {
  const pick = (start: string) => {
    const at = appCss.indexOf(start);
    assert.ok(at >= 0, `app.css has ${start}`);
    const body = appCss.slice(at + start.length, appCss.indexOf("}", at));
    return Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  };
  return { ...pick(":root {"), ...(theme === "dark" ? pick(':root[data-theme="dark"] {') : {}) };
}

// [text, surface, where]
const PAIRS: [string, string, string][] = [
  ["ink", "bg", "page text"],
  ["muted", "bg", "secondary text on the page"],
  ["ink", "surface", "cards, chat, dialogs"],
  ["muted", "surface", "hints in cards"],
  ["ink", "raised", "chips, Lente's chat bubbles"],
  ["muted", "raised", "notes, neutral tags"],
  ["accent", "surface", "links, the chat's title"],
  ["accent", "tag", "selected nav entry, soft buttons, Lente's tag"],
  ["ink", "tag", "selected meeting, highlighted turn"],
  ["on-accent", "accent-fill", "primary buttons, your chat bubble"],
  ["on-live", "live-fill", "Grabar, danger buttons, the approval count"],
  ["live", "surface", "errors, red text"],
  ["ink", "sidebar", "navigation"],
  ["muted", "sidebar", "recent meetings' times"],
  ["topic-product", "topic-product-bg", "topic chip"],
  ["topic-client", "topic-client-bg", "topic chip"],
  ["topic-team", "topic-team-bg", "topic chip, someone else's task"],
  ["warn-ink", "warn-bg", "Reconectando…, warnings"],
  ["bg", "ink", "toasts"],
];

for (const theme of ["light", "dark"] as Theme[]) {
  test(`the web app's text pairs reach 7:1 in ${theme}`, () => {
    const tokens = { ...readTokens(THEME_TOKENS, theme), ...appTokens(theme) };
    const low = PAIRS.map(([t, s, where]) => ({ pair: `${t} on ${s} (${where})`, ratio: Math.round(tokenContrast(tokens, t, s) * 100) / 100 })).filter((p) => p.ratio < AAA);
    assert.deepEqual(low, [], `pairs under ${AAA}:1 in ${theme}`);
  });
}

test("app.css paints with tokens only: no inline colors outside its own variables and the theme", () => {
  const body = appCss.replace(/^:root[^\n]*$/gm, "").replace(/@media \(prefers-color-scheme: dark\) \{ :root[^\n]*$/gm, "");
  const stray = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(stray, [], "hex colors outside the variables");
});
