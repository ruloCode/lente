// Re-wraps every user's data key under the current KEK version (add-accounts 2.4, design decision 5).
// Only `user_keys` changes: the data keys themselves stay the same, so no sealed content is read or
// rewritten. Run after `node scripts/new-kek.ts --rotate`, with both keys loaded:
//   node --env-file=.env scripts/rotate-kek.ts
// Prints counts only; never a key, a user's email or any content.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkKekAtStart, keksFromEnv } from "../src/kek-check.ts";
import { type Kek, unwrapDek, wrapDek } from "../src/seal.ts";
import { fromBytea, SupabaseRest } from "../src/supabase-rest.ts";
import { supabaseCanaries } from "../src/supabase-stores.ts";

export interface RotationReport {
  version: number;
  users: number;
  rewrapped: number;
  alreadyCurrent: number;
}

/**
 * Brings every wrapped key to the current KEK (`keks[0]`). The canary of the new version is sealed
 * first and the previous one checked, so a wrong key stops before any row changes. Each row is
 * replaced only if it still has the version that was read, and at the end every key must open
 * under the current KEK alone.
 */
export async function rotateKeys(rest: SupabaseRest, keks: readonly Kek[], now = Date.now()): Promise<RotationReport> {
  const [current] = keks;
  if (!current || keks.length < 2) throw new Error("a rotation needs the new LENTE_KEK and LENTE_KEK_PREVIOUS; run node scripts/new-kek.ts --rotate first");
  await checkKekAtStart(keks, supabaseCanaries(rest));
  const at = new Date(now).toISOString();
  const report: RotationReport = { version: current.version, users: 0, rewrapped: 0, alreadyCurrent: 0 };
  for (const row of await rest.system.wrappedKeys()) {
    const userId = String(row.user_id);
    const version = Number(row.kek_version);
    report.users++;
    if (version === current.version) {
      report.alreadyCurrent++;
      continue;
    }
    const dek = unwrapDek(fromBytea(row.wrapped_dek), version, keks, userId);
    try {
      const changed = await rest.system.rewrapKey(userId, version, current.version, wrapDek(dek, current, userId), at);
      if (changed.length !== 1) throw new Error(`user ${userId}'s key changed during the rotation; run the rotation again`);
    } finally {
      dek.fill(0);
    }
    report.rewrapped++;
  }
  for (const row of await rest.system.wrappedKeys()) {
    const userId = String(row.user_id);
    if (Number(row.kek_version) !== current.version) throw new Error(`user ${userId}'s key is still at version ${row.kek_version}; run the rotation again`);
    unwrapDek(fromBytea(row.wrapped_dek), current.version, [current], userId).fill(0);
  }
  return report;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not set; run with node --env-file=.env");
  const rest = new SupabaseRest({ url, secretKey: process.env.SUPABASE_SECRET_KEY ?? "" });
  const r = await rotateKeys(rest, keksFromEnv(process.env));
  console.log(`KEK version ${r.version}: ${r.users} users, ${r.rewrapped} keys re-wrapped, ${r.alreadyCurrent} already current; every key opens under the new KEK.`);
  console.log("Next: load the Modal secret and restart the hub; once it is up, delete LENTE_KEK_PREVIOUS, load the secret again and restart.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    console.error(`rotation failed: ${error.message}`);
    process.exit(1);
  });
}
