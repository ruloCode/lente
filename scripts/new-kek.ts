// Generates the key-encryption key (`LENTE_KEK`, add-accounts 1.5) and appends it to the env file
// without ever printing it. Run once, at setup: replacing a KEK that already wraps users' data keys
// would make every account unreadable, so an existing LENTE_KEK is refused (rotation is a separate
// script that re-wraps the keys). Usage: node scripts/new-kek.ts [--rotate] [env file, default .env]
// `--rotate` starts a rotation (2.4): the current key becomes `LENTE_KEK_PREVIOUS` and a new one,
// one version up, becomes `LENTE_KEK`; then `scripts/rotate-kek.ts` re-wraps every data key.

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

/** The env file's text with its KEK moved to `LENTE_KEK_PREVIOUS` and a new one a version up. Pure. */
export function withRotatedKek(envText: string, key: Buffer): { text: string; version: number } {
  const line = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=(.*)$`, "m");
  const current = line("LENTE_KEK").exec(envText)?.[1]?.trim();
  if (!current) throw new Error("LENTE_KEK is not set; there is nothing to rotate (use scripts/new-kek.ts without --rotate)");
  if (line("LENTE_KEK_PREVIOUS").test(envText)) throw new Error("LENTE_KEK_PREVIOUS is already set: finish the last rotation (scripts/rotate-kek.ts), then remove it");
  if (key.length !== KEY_BYTES) throw new Error(`a KEK is ${KEY_BYTES} bytes`);
  const version = Number(line("LENTE_KEK_VERSION").exec(envText)?.[1]?.trim() ?? "1");
  if (!Number.isInteger(version) || version < 1) throw new Error("LENTE_KEK_VERSION is not a positive integer");
  const kept = envText.split("\n").filter((l) => !line("LENTE_KEK").test(l) && !line("LENTE_KEK_VERSION").test(l)).join("\n");
  const sep = kept === "" || kept.endsWith("\n") ? "" : "\n";
  const text = `${kept}${sep}LENTE_KEK=${key.toString("base64")}\nLENTE_KEK_VERSION=${version + 1}\nLENTE_KEK_PREVIOUS=${current}\n`;
  return { text, version: version + 1 };
}

/** What the owner is told after starting a rotation; it never contains a key. */
export function rotationSteps(file: string, version: number): string {
  return [
    `A new LENTE_KEK (version ${version}) written to ${file}; the old one is now LENTE_KEK_PREVIOUS. Neither was printed.`,
    "Next:",
    `  1. Keep an offline copy of the new LENTE_KEK line (and keep the old one until step 4).`,
    "  2. Re-wrap every data key: node --env-file=.env scripts/rotate-kek.ts",
    "  3. Load the Modal secret (node --env-file=.env deploy/modal/secret.ts) and restart the hub.",
    "  4. Once the hub is up, delete the LENTE_KEK_PREVIOUS line, load the secret again and restart.",
  ].join("\n");
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
  const args = process.argv.slice(2);
  const rotate = args.includes("--rotate");
  const file = resolve(args.find((a) => a !== "--rotate") ?? ".env");
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  let after: string;
  let message: string;
  try {
    if (rotate) {
      const rotated = withRotatedKek(before, randomBytes(KEY_BYTES));
      after = rotated.text;
      message = rotationSteps(file, rotated.version);
    } else {
      after = withNewKek(before, randomBytes(KEY_BYTES));
      message = nextSteps(file);
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  writeFileSync(file, after, { mode: 0o600 });
  chmodSync(file, 0o600); // an existing file keeps its mode on write; a file holding keys is the owner's only
  console.log(message);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
