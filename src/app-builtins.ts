// The built-in apps (add-lens-apps design decision 3): the manifests in `apps/builtin/`, read once and
// checked by the same validator as anyone's, with `builtIn`. A file that no longer validates stops the
// hub with its errors, and `test/app-builtins.test.ts` stops `pnpm test` before that.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AppManifest, validateManifest } from "./app-manifest.ts";

export const BUILTIN_APPS_DIR = fileURLToPath(new URL("../apps/builtin/", import.meta.url));

/** The catalog's order: the three that run today, then «Idiomas». Files not listed come after, by name. */
export const BUILTIN_ORDER = ["dilo", "ver", "practicar", "idiomas"];

/** Every built-in manifest, validated, in catalog order. Throws naming the file and its errors. */
export function loadBuiltinApps(dir = BUILTIN_APPS_DIR): AppManifest[] {
  const apps: AppManifest[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`apps/builtin/${file} is not JSON: ${(error as Error).message}`);
    }
    const checked = validateManifest(json, { builtIn: true });
    if (!checked.ok) throw new Error(`apps/builtin/${file} is not a valid manifest: ${checked.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`);
    if (`${checked.manifest.id}.json` !== file) throw new Error(`apps/builtin/${file} holds the id «${checked.manifest.id}»; a built-in's file is named by its id`);
    apps.push(checked.manifest);
  }
  const rank = (id: string) => (BUILTIN_ORDER.includes(id) ? BUILTIN_ORDER.indexOf(id) : BUILTIN_ORDER.length);
  return apps.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}
