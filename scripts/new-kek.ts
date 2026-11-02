// Generates the key-encryption key (`LENTE_KEK`, add-accounts 1.5) and appends it to the env file
// without ever printing it. Run once, at setup: replacing a KEK that already wraps users' data keys
// would make every account unreadable, so an existing LENTE_KEK is refused (rotation is a separate
// script that re-wraps the keys). Usage: node scripts/new-kek.ts [env file, default .env]

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_BYTES } from "../src/seal.ts";

/** The env file's text with a new KEK appended; throws if it already has one. Pure. */
export function withNewKek(envText: string, key: Buffer): string {
  if (/^\s*(?:export\s+)?LENTE_KEK\s*=/m.test(envText)) {
    throw new Error("LENTE_KEK is already set; replacing it would make every account unreadable. To change it, rotate (scripts/rotate-kek.ts)");
  }
  if (key.length !== KEY_BYTES) throw new Error(`a KEK is ${KEY_BYTES} bytes`);
  const sep = envText === "" || envText.endsWith("\n") ? "" : "\n";
  return `${envText}${sep}# Key-encryption key for users' data keys (add-accounts). Keep an offline copy; never commit it.\nLENTE_KEK=${key.toString("base64")}\nLENTE_KEK_VERSION=1\n`;
}

/** What the owner is told; it never contains the key. */
export function nextSteps(file: string): string {
  return [
    `LENTE_KEK written to ${file} (32 random bytes, version 1). It was not printed.`,
    "Next:",
    `  1. Keep an offline copy: open ${file} yourself and copy the LENTE_KEK line into your password manager.`,
    "     Losing it loses every account's memory; there is no recovery.",
    "  2. Load it into the Modal secret: node --env-file=.env deploy/modal/secret.ts",
    "  3. The hub seals a canary under it on first start and refuses any other KEK afterwards.",
  ].join("\n");
}

function main(): void {
  const file = resolve(process.argv[2] ?? ".env");
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  let after: string;
  try {
    after = withNewKek(before, randomBytes(KEY_BYTES));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  writeFileSync(file, after, { mode: 0o600 });
  chmodSync(file, 0o600); // an existing file keeps its mode on write; a file holding keys is the owner's only
  console.log(nextSteps(file));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
