// ship-hackathon 5.1 (design 6 and 6b): the website in site/ stays plain, linked, light and honest:
// every relative link and image resolves, images are small and sized, each page names its language
// and both color schemes, a page with its images stays under 1 MB, the lifestyle renders (generated
// people) stay out, and every measured number on it is one that docs/benchmarks.md records.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const BENCHMARKS = readFileSync(fileURLToPath(new URL("../docs/benchmarks.md", import.meta.url)), "utf8");
/** The budget for one image on the site. */
const IMAGE_MAX_BYTES = 200 * 1024;
/** The budget for one page: its HTML, the stylesheet and every image it names. */
const PAGE_MAX_BYTES = 1024 * 1024;
/** GitHub Pages serves the project under this path; 404.html links from it, since it answers any URL. */
const BASE_PATH = "/lente/";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SITE);
const pages = files.filter((f) => f.endsWith(".html"));
/** The page without its comments (the placeholders' instructions live in comments). */
const visible = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

test("the site has the Spanish and English home pages, the short terms and privacy pages, and a 404", () => {
  for (const page of ["index.html", "en/index.html", "terminos/index.html", "privacidad/index.html", "404.html"]) assert.ok(pages.includes(join(SITE, page)), page);
});

/** Where a link or image on `page` points inside site/, or null when it leaves the site. */
function target(page: string, url: string): string | null {
  if (/^(https?:|mailto:|#)/.test(url)) return null;
  const path = url.split("#")[0]!.split("?")[0]!;
  let file = path.startsWith(BASE_PATH) ? join(SITE, path.slice(BASE_PATH.length)) : join(dirname(page), path);
  if (path === "" || path.endsWith("/")) file = join(file, "index.html");
  return file;
}

test("every relative link and image on the site resolves to a file in site/", () => {
  for (const page of pages) {
    const html = visible(readFileSync(page, "utf8"));
    for (const [, url] of html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) {
      const file = target(page, url!);
      if (!file) continue;
      assert.ok(file.startsWith(SITE), `${relative(SITE, page)}: ${url} leaves site/`);
      assert.ok(existsSync(file), `${relative(SITE, page)}: ${url} does not exist`);
    }
  }
});

test("pages name their language, every image has alt text, and there is no script", () => {
  for (const page of pages) {
    const html = visible(readFileSync(page, "utf8"));
    const name = relative(SITE, page);
    assert.match(html, /<html lang="(es|en)">/, name);
    assert.match(html, /<main id="[a-z]+"/, `${name}: a main landmark`);
    assert.doesNotMatch(html, /<script/i, `${name}: plain HTML, no script`);
    assert.doesNotMatch(html, /\sstyle="/, `${name}: no inline style`);
    assert.equal(html.match(/<h1\b/g)?.length, 1, `${name}: one h1`);
    assert.match(html, /<a class="skip" href="#/, `${name}: a skip link`);
    assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}" media="\(prefers-color-scheme: light\)">/, `${name}: theme-color for light`);
    assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}" media="\(prefers-color-scheme: dark\)">/, `${name}: theme-color for dark`);
    for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(img!, /\balt="/, `${name}: alt on ${img}`);
      assert.match(img!, /\bwidth="\d+"/, `${name}: width on ${img}`);
      assert.match(img!, /\bheight="\d+"/, `${name}: height on ${img}`);
    }
  }
  for (const home of ["index.html", "en/index.html"]) assert.match(readFileSync(join(SITE, home), "utf8"), /fetchpriority="high"/, `${home}: the hero image loads first`);
});

test("each page with its stylesheet and images stays under 1 MB, and the lifestyle renders stay out", () => {
  assert.deepEqual(files.filter((f) => /lifestyle-/.test(f)).map((f) => relative(SITE, f)), [], "no lifestyle-* file in site/");
  for (const page of pages) {
    const html = visible(readFileSync(page, "utf8"));
    assert.doesNotMatch(html, /lifestyle-/, `${relative(SITE, page)}: uses a lifestyle render`);
    const named = new Set<string>([page]);
    for (const [, url] of html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) {
      const file = target(page, url!);
      if (file && /\.(css|png|jpe?g|webp|svg)$/.test(file) && existsSync(file)) named.add(file);
    }
    const bytes = [...named].reduce((sum, f) => sum + statSync(f).size, 0);
    assert.ok(bytes < PAGE_MAX_BYTES, `${relative(SITE, page)} weighs ${bytes} bytes with what it loads`);
  }
});

test("images are WebP, SVG, or the small icons and share card, each under 200 KB", () => {
  for (const file of files.filter((f) => /\.(png|jpe?g|webp|svg|gif)$/i.test(f))) {
    const name = relative(SITE, file);
    assert.ok(statSync(file).size < IMAGE_MAX_BYTES, `${name} is ${statSync(file).size} bytes`);
    if (/\.(png|jpe?g)$/i.test(file)) assert.match(name, /^assets\/(favicon-32\.png|apple-touch-icon\.png|og\.jpg)$/, `${name}: page images go in as WebP`);
  }
});

/** A time in seconds on the site that benchmarks.md gives in milliseconds (3.21 s for 3,207 ms). */
function inMs(bench: string, seconds: number): boolean {
  return [...bench.matchAll(/(?<![\d.])(\d+) ms\b/g)].some((m) => Math.round(Number(m[1]) / 10) / 100 === seconds);
}

test("every measured number on the site is in docs/benchmarks.md", () => {
  // Times, percentages and "n of m" counts, written either way (3,02 s in Spanish, 3.02 s in English).
  const bench = BENCHMARKS.replace(/,(?=\d{3}\b)/g, "");
  for (const page of pages) {
    const text = visible(readFileSync(page, "utf8")).replace(/<[^>]+>/g, " ");
    const found = [
      ...[...text.matchAll(/(\d+(?:[.,]\d+)?)\s?(ms|s|%)(?![\w-])/g)].map((m) => ({ value: m[1]!.replace(",", "."), unit: m[2]! })),
      ...[...text.matchAll(/(\d+) (?:de|of) (\d+)\b/g)].map((m) => ({ value: `${m[1]}/${m[2]}`, unit: "of" })),
    ];
    for (const { value, unit } of found) {
      const ok =
        unit === "of"
          ? new RegExp(`\\b${value.replace("/", "(?: of |/)")}\\b`).test(bench)
          : new RegExp(`(?<![\\d.])${value.replace(".", "\\.")}\\s?${unit === "%" ? "%" : `${unit}\\b`}`).test(bench) || (unit === "s" && inMs(bench, Number(value)));
      assert.ok(ok, `${relative(SITE, page)}: ${value} ${unit} is not in docs/benchmarks.md`);
    }
  }
});
