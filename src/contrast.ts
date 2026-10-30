// WCAG contrast for the phone page's color tokens, read straight from its CSS so the check measures
// what ships. Pure: no DOM, no files.

export type Theme = "light" | "dark";
type Rgba = [number, number, number, number];

/** Parse #rgb, #rrggbb or rgba(r, g, b, a). */
export function parseColor(value: string): Rgba {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const fn = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`not a color this check understands: "${value}"`);
}

/** A translucent color painted over an opaque one, as the eye sees it. */
export function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))).concat(1) as Rgba;
}

export function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The custom properties of the first `:root { … }` (light) or of the `:root` inside
 *  `@media (prefers-color-scheme: dark)` (dark, layered over light). `var(--x)` is resolved. */
export function readTokens(css: string, theme: Theme): Record<string, string> {
  const block = (src: string) => {
    const at = src.indexOf(":root {");
    if (at < 0) throw new Error("no :root block in the page CSS");
    const body = src.slice(at + 7, src.indexOf("}", at));
    return Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const tokens = block(css);
  if (theme === "dark") {
    const media = css.indexOf("@media (prefers-color-scheme: dark)");
    if (media < 0) throw new Error("no dark theme: missing @media (prefers-color-scheme: dark)");
    Object.assign(tokens, block(css.slice(media)));
  }
  const resolve = (v: string, depth = 0): string => {
    const ref = v.match(/^var\(--([\w-]+)\)$/);
    if (!ref) return v;
    if (depth > 5 || !(ref[1] in tokens)) throw new Error(`token --${ref[1]} is not defined`);
    return resolve(tokens[ref[1]], depth + 1);
  };
  return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, resolve(v)]));
}

/** Contrast of a text token on a surface token; translucent surfaces are painted over `--bg`. */
export function tokenContrast(tokens: Record<string, string>, text: string, surface: string): number {
  const bg = parseColor(tokens.bg);
  const base = parseColor(tokens[surface] ?? surface);
  const under = base[3] < 1 ? over(base, bg) : base;
  const fg = parseColor(tokens[text] ?? text);
  return contrast(fg[3] < 1 ? over(fg, under) : fg, under);
}

// Every text color the page paints, on every surface it paints it on (see the rules in src/pilot-page.ts).
export const PAGE_TEXT_PAIRS: [text: string, surface: string, where: string][] = [
  ["ink", "bg", "titles, timeline, live transcript"],
  ["ink", "surface", "cards, rows, menu"],
  ["ink", "raised", "buttons, pressed rows"],
  ["ink", "thumb", "selected segment"],
  ["ink", "glass", "listening pill, dock"],
  ["muted", "bg", "captions, hints, live view helper text"],
  ["muted", "surface", "secondary text in cards and rows, measured numbers"],
  ["muted", "raised", "the Pronto tag"],
  ["muted", "track", "unselected segment"],
  ["muted", "glass", "paused pill"],
  ["accent", "bg", "Omitir, focus"],
  ["accent", "surface", "selected row text"],
  ["accent", "tag", "DILO label, Mirar, meeting tags, current menu row"],
  ["on-accent", "accent-fill", "primary buttons, pressed dock buttons, Nuevo"],
  ["live", "surface", "Detener and Abrir on the recording bar"],
  ["live", "bg", "Toca otra vez para terminar"],
  ["on-live", "live-fill", "the recording strip and bar, the stop button"],
];
