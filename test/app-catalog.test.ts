// add-lens-apps 1.3: the catalog's answers, pure (design decision 10).

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBuiltinApps } from "../src/app-builtins.ts";
import { APP_NOT_FOUND, appsAnswer, parseAppsMode } from "../src/app-catalog.ts";

const builtins = loadBuiltinApps();

test("LENTE_APPS defaults to builtin; only «open» opens", () => {
  assert.equal(parseAppsMode(undefined), "builtin");
  assert.equal(parseAppsMode(""), "builtin");
  assert.equal(parseAppsMode("anything"), "builtin");
  assert.equal(parseAppsMode(" open "), "open");
});

test("GET /apps lists the built-ins with their permissions in Spanish; Idiomas runs in Portuguese, French is «Pronto»", () => {
  const answer = appsAnswer({ method: "GET", url: "/apps?x=1" }, builtins, "builtin")!;
  assert.equal(answer.status, 200);
  const { apps } = answer.body as { apps: { id: string; builtIn: boolean; soon: boolean; permissions: { label: string; sentence: string }[]; languages: { code: string; soon: boolean }[] }[] };
  assert.deepEqual(apps.map((a) => [a.id, a.builtIn, a.soon]), [["dilo", true, false], ["ver", true, false], ["practicar", true, false], ["idiomas", true, false]]);
  const ver = apps.find((a) => a.id === "ver")!;
  assert.equal(ver.permissions[0]!.label, "Cámara");
  assert.ok(ver.permissions.every((p) => p.sentence.endsWith(".")));
  assert.deepEqual(apps.find((a) => a.id === "idiomas")!.languages.map((l) => [l.code, l.soon]), [["es", false], ["pt", false], ["fr", true]]);
  // The listing carries no persona; the page does.
  assert.equal("persona" in ver, false);
});

test("GET /apps/:id is the app's page with the persona and every action «Pronto»; an unknown id is 404", () => {
  const page = appsAnswer({ method: "GET", url: "/apps/ver" }, builtins, "builtin")!;
  assert.equal(page.status, 200);
  const { app } = page.body as { app: { persona: string; tools: string[]; actions: Record<string, string> } };
  assert.ok(app.persona.length >= 40);
  assert.ok(app.tools.includes("look"));
  assert.deepEqual(app.actions, { try: "soon", install: "soon", publish: "soon" });
  for (const url of ["/apps/nope", "/apps/Ver", "/apps/%E0%A4%A", "/apps/..%2Fpilot"]) assert.deepEqual(appsAnswer({ method: "GET", url }, builtins, "builtin"), { status: 404, body: APP_NOT_FOUND }, url);
});

test("other methods and deeper paths are not the catalog's", () => {
  assert.equal(appsAnswer({ method: "POST", url: "/apps" }, builtins, "builtin"), undefined);
  assert.equal(appsAnswer({ method: "GET", url: "/apps/ver/install" }, builtins, "builtin"), undefined);
  assert.equal(appsAnswer({ method: "GET", url: "/appsx" }, builtins, "builtin"), undefined);
});
