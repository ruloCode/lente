// add-web-desktop 1.1: which path under /app is which file, the theme sheet, the generated modules,
// the return path after Google, and the session answer.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { THEME_TOKENS } from "../src/theme.ts";
import { APP_CSP, APP_SHELL, appSession, appThemeCss, generatedModule, isAppPath, listAppFiles, resolveAppPath, safeNext, themeBlocks } from "../src/web-app.ts";

const files = new Set(["main.js", "app.css", "boot.js", "lib/format.js", "views/home.js"]);

test("app paths: known files, generated modules, the session, client routes get the shell, the rest is missing", () => {
  assert.deepEqual(resolveAppPath("/app/main.js", files), { kind: "file", name: "main.js" });
  assert.deepEqual(resolveAppPath("/app/lib/format.js", files), { kind: "file", name: "lib/format.js" });
  assert.deepEqual(resolveAppPath("/app/theme.css", files), { kind: "generated", name: "theme.css" });
  assert.deepEqual(resolveAppPath("/app/lib/capture-pipeline.js", files), { kind: "generated", name: "lib/capture-pipeline.js" });
  assert.deepEqual(resolveAppPath("/app/session", files), { kind: "session" });
  for (const route of ["/app", "/app/", "/app/tareas", "/app/reuniones/m1730000000000", "/app/reuniones/hermes-2026-10-01-abc", "/app/proyectos/3f1c2a"]) {
    assert.deepEqual(resolveAppPath(route, files), { kind: "shell" }, route);
  }
  for (const bad of ["/app/../.env", "/app/lib/../../.env", "/app/nope.js", "/app/main.ts", "/app/data/x.json", "/app/%2e%2e/x", "/app//etc", "/apple", "/app/.hidden.js"]) {
    assert.deepEqual(resolveAppPath(bad, files), { kind: "missing" }, bad);
  }
  assert.ok(isAppPath("/app") && isAppPath("/app/x") && !isAppPath("/apps") && !isAppPath("/"));
});

test("the app folder in the repo lists only its own js, css and svg files", () => {
  const listed = listAppFiles(fileURLToPath(new URL("../web/app/", import.meta.url)));
  assert.ok(listed.has("main.js") && listed.has("app.css") && listed.has("boot.js"), [...listed].join(", "));
  for (const name of listed) assert.match(name, /^[a-z0-9/_.-]+\.(js|css|svg)$/);
});

test("theme: the light and dark blocks of the shared tokens, and both again under data-theme", () => {
  const { light, dark } = themeBlocks();
  assert.match(light, /--bg: #F2F2F7/);
  assert.match(dark, /--bg: #000000/);
  const css = appThemeCss();
  assert.ok(css.includes(THEME_TOKENS), "keeps the shared tokens as they are");
  assert.match(css, /:root\[data-theme="light"\] \{[^}]*--bg: #F2F2F7[^}]*color-scheme: light; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--bg: #000000[^}]*color-scheme: dark; \}/);
  assert.throws(() => themeBlocks(":root { --bg: red; }"), /light and a dark/);
});

test("generated modules carry the hub's tested page scripts and export what the app imports", async () => {
  const capture = generatedModule("lib/capture-pipeline.js");
  for (const name of ["PcmResampler", "PcmFramer", "phoneHello", "phoneAudioFrame", "uplinkFrame", "SceneDetector", "toLuma"]) assert.match(capture, new RegExp(`export \\{[^}]*\\b${name}\\b`));
  const mod = await import(`data:text/javascript,${encodeURIComponent(capture)}`);
  const hello = mod.phoneHello("t", "lente-desktop", false) as Uint8Array;
  assert.equal(String.fromCharCode(hello[0]!), "H", "a hello frame");
  const view = await import(`data:text/javascript,${encodeURIComponent(generatedModule("lib/transcript-view.js"))}`);
  const rows = view.reduceTranscript(view.emptyTranscript(), { kind: "turn", at: 1, text: "PROBE hola" });
  assert.equal(rows.rows[0].text, "PROBE hola");
  const brand = generatedModule("lib/brand.js");
  assert.doesNotMatch(brand, /style=/, "no inline style: the CSP allows none");
  assert.match(brand, /mark-line/);
});

test("after Google, only /app or a path under it; anything else goes to / as before", () => {
  for (const ok of ["/app", "/app/", "/app/tareas", "/app/reuniones/m1"]) assert.equal(safeNext(ok), ok);
  for (const bad of [null, "", "/", "//evil.com", "/app//evil.com", "https://evil.com/app", "/app/../auth", "/apps", "/app?x=1", "/app/a b", "/app/" + "x".repeat(300)]) assert.equal(safeNext(bad), undefined, String(bad));
});

test("session answer: open hubs need no sign-in; accounts and pairing need an identity", () => {
  assert.deepEqual(appSession("open", undefined), { mode: "open", signedIn: true, email: null });
  assert.deepEqual(appSession("accounts", undefined), { mode: "accounts", signedIn: false, email: null });
  assert.deepEqual(appSession("accounts", { email: "probe@example.com" }), { mode: "accounts", signedIn: true, email: "probe@example.com" });
  assert.deepEqual(appSession("pairing", {}), { mode: "pairing", signedIn: true, email: null });
});

test("the shell loads only same-origin scripts, and the CSP forbids inline script", () => {
  assert.doesNotMatch(APP_SHELL, /<script>(?!<)/, "no inline script");
  assert.match(APP_SHELL, /<script type="module" src="\/app\/main.js">/);
  assert.match(APP_CSP, /script-src 'self'(;|$)/);
  assert.doesNotMatch(APP_CSP, /unsafe-inline|unsafe-eval/);
});
