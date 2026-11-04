// add-lens-apps 1.2: the built-in manifests describe what runs today (design decision 3).

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BUILTIN_APPS_DIR, loadBuiltinApps } from "../src/app-builtins.ts";
import { validateManifest } from "../src/app-manifest.ts";
import { SIGHT_FUNCTIONS } from "../src/voice-agent.ts";

test("every built-in file passes validateManifest({ builtIn: true }), and none would pass as a third party's", () => {
  const files = readdirSync(BUILTIN_APPS_DIR).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, ["dilo.json", "idiomas.json", "practicar.json", "ver.json"]);
  for (const file of files) {
    const json = JSON.parse(readFileSync(join(BUILTIN_APPS_DIR, file), "utf8"));
    const r = validateManifest(json, { builtIn: true });
    assert.ok(r.ok, `${file}: ${JSON.stringify(!r.ok && r.errors)}`);
    // An engine and a reserved id: the same file from anyone else is refused.
    const asThirdParty = validateManifest(json, { builtIn: false });
    assert.equal(asThirdParty.ok, false, file);
    assert.ok(!asThirdParty.ok && asThirdParty.errors.some((e) => e.field === "engine"), file);
  }
});

test("the catalog order is Dilo, Ver, Practicar, Idiomas, each bound to its engine", () => {
  const apps = loadBuiltinApps();
  assert.deepEqual(apps.map((a) => [a.id, a.engine]), [["dilo", "dilo"], ["ver", "ver"], ["practicar", "practicar"], ["idiomas", "coach"]]);
});

test("Ver's tools are exactly SIGHT_FUNCTIONS' names", () => {
  const ver = loadBuiltinApps().find((a) => a.id === "ver")!;
  assert.deepEqual([...ver.tools].sort(), SIGHT_FUNCTIONS.map((f) => f.name).sort());
});

test("the table of decision 3: inputs and permissions of the three that run today", () => {
  const byId = new Map(loadBuiltinApps().map((a) => [a.id, a]));
  assert.deepEqual(byId.get("dilo")!.inputs, ["room"]);
  assert.deepEqual(byId.get("dilo")!.permissions, ["microphone", "memory.read", "memory.write"]);
  assert.deepEqual(byId.get("dilo")!.tools, []);
  assert.deepEqual(byId.get("ver")!.permissions, ["camera", "microphone", "location", "memory.read", "memory.write"]);
  assert.deepEqual(byId.get("practicar")!.permissions, ["microphone", "memory.write"]);
  // «Idiomas» follows add-language-coach design decision 12.
  const idiomas = byId.get("idiomas")!;
  assert.deepEqual(idiomas.languages, ["es", "pt", "fr"]);
  assert.deepEqual(idiomas.inputs, ["microphone", "camera", "room"]);
  assert.deepEqual(idiomas.permissions, ["camera", "microphone", "memory.read", "memory.write"]);
  assert.deepEqual(idiomas.price, { model: "free" });
});
