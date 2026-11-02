// Copies the keys the hub reads into the Modal secret `lente-hub`, without printing them.
// Usage: node --env-file=.env deploy/modal/secret.ts
// Only the hub's own variables go up; the Modal token and the auto lane's keys stay on the laptop.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SECRET_NAME = "lente-hub";
const HUB_VARIABLES = [
  "MODEL_API_KEY",
  "META_BASE_URL",
  "META_REALTIME_URL",
  "BASETEN_API_KEY",
  "BASETEN_BASE_URL",
  "BASETEN_MODEL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  // Accounts (add-accounts): Supabase, the key-encryption key and who may sign up.
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "LENTE_KEK",
  "LENTE_KEK_VERSION",
  "LENTE_KEK_PREVIOUS",
  "LENTE_ALLOWED_EMAILS",
  "LENTE_MAX_LISTENING",
];

const values = Object.fromEntries(HUB_VARIABLES.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
if (!values.MODEL_API_KEY) {
  console.error("MODEL_API_KEY is not set: run with `node --env-file=.env deploy/modal/secret.ts`");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "lente-secret-"));
const file = join(dir, "secret.json");
try {
  writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
  const run = spawnSync("modal", ["secret", "create", "--force", SECRET_NAME, "--from-json", file], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(`modal secret create failed (exit ${run.status}): ${(run.stderr || run.stdout).split("\n")[0]}`);
    process.exit(1);
  }
  console.log(`Secret ${SECRET_NAME} holds: ${Object.keys(values).join(", ")}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
