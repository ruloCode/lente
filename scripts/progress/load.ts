// Reads the OpenSpec changes of one checkout into the ordered list parse.ts works on. Shared by
// the progress page and the auto lane runner.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Change, makeChange, orderChanges, parseArchiveDir, parseBuildOrder } from "./parse.ts";

export const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
export const dirs = (path: string) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

/** Every change, active and archived, in build order (archived first). */
export function loadChanges(root: string): Change[] {
  const changesDir = join(root, "openspec", "changes");
  const archiveDir = join(changesDir, "archive");
  const changes: Change[] = [];
  for (const name of dirs(changesDir).filter((d) => d !== "archive")) {
    changes.push(makeChange(name, read(join(changesDir, name, "tasks.md")), read(join(changesDir, name, "proposal.md"))));
  }
  for (const dir of dirs(archiveDir)) {
    const a = parseArchiveDir(dir);
    if (a) changes.push(makeChange(a.name, read(join(archiveDir, dir, "tasks.md")), read(join(archiveDir, dir, "proposal.md")), a.on));
  }
  return orderChanges(changes, parseBuildOrder(read(join(root, "CLAUDE.md")), new Set(changes.map((c) => c.name))));
}

/** Names of the keys set (non-empty) in a checkout's .env. Values are never returned. */
export function keyNames(root: string): Set<string> {
  const names = new Set<string>();
  for (const line of read(join(root, ".env")).split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[2].replace(/^["']|["']$/g, "").trim() !== "") names.add(m[1]);
  }
  for (const [k, v] of Object.entries(process.env)) if (/^[A-Z0-9_]+$/.test(k) && v) names.add(k);
  return names;
}
