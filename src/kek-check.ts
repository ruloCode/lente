// Loading the key-encryption keys and proving at start that they are the ones the database was set
// up with (add-accounts 2.2). A canary sealed under each KEK version sits in `kek_canaries`; a KEK
// that cannot open its canary stops the hub before it serves anything. Pure but for the store.

import { type Kek, opensCanary, parseKek, sealCanary } from "./seal.ts";

/** Where the canaries live: the `kek_canaries` table on Supabase, a map in the tests. */
export interface CanaryStore {
  read(version: number): Promise<Buffer | undefined>;
  write(version: number, sealed: Buffer): Promise<void>;
}

export class KekCheckError extends Error {
  override name = "KekCheckError";
}

/**
 * The KEKs in the environment, current first: `LENTE_KEK` with `LENTE_KEK_VERSION` (default 1) and,
 * during a rotation, `LENTE_KEK_PREVIOUS` one version lower. Never logs or returns the key text.
 */
export function keksFromEnv(env: Record<string, string | undefined>): Kek[] {
  const version = env.LENTE_KEK_VERSION ? Number(env.LENTE_KEK_VERSION) : 1;
  const keks = [parseKek(env.LENTE_KEK, version)];
  if (env.LENTE_KEK_PREVIOUS) {
    if (version < 2) throw new KekCheckError("LENTE_KEK_PREVIOUS is set but LENTE_KEK_VERSION is 1; the current KEK must be version 2 or later");
    keks.push(parseKek(env.LENTE_KEK_PREVIOUS, version - 1));
  }
  return keks;
}

/**
 * Opens the canary of every loaded KEK. The current KEK seals its canary on first start (setup);
 * a previous KEK must already have one. Returns what happened per version, or throws before serving.
 */
export async function checkKekAtStart(keks: readonly Kek[], store: CanaryStore): Promise<Record<number, "ok" | "created">> {
  if (keks.length === 0) throw new KekCheckError("no KEK loaded; set LENTE_KEK (scripts/new-kek.ts)");
  const result: Record<number, "ok" | "created"> = {};
  for (const [i, kek] of keks.entries()) {
    const sealed = await store.read(kek.version);
    if (!sealed) {
      if (i > 0) throw new KekCheckError(`KEK canary check failed: no canary for the previous KEK version ${kek.version}; it was never set up here`);
      await store.write(kek.version, sealCanary(kek));
      result[kek.version] = "created";
      continue;
    }
    if (!opensCanary(kek, sealed)) {
      throw new KekCheckError(`KEK canary check failed for version ${kek.version}: this LENTE_KEK is not the key the database was set up with; refusing to start`);
    }
    result[kek.version] = "ok";
  }
  return result;
}
