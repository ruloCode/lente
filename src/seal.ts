// Envelope encryption for the per-user memory (add-accounts, design decision 5). Pure: keys and
// bytes in, bytes out. Each user has a random 32-byte data key (DEK) stored only wrapped under the
// key-encryption key (KEK, `LENTE_KEK`), which never enters the database. Every content value is
// AES-256-GCM under the user's DEK, bound by its additional data to the table, column, user and
// row it belongs to, so a ciphertext copied anywhere else fails to open.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Layout version, the first byte of every sealed value and wrapped key. */
export const SEAL_VERSION = 1;
export const KEY_BYTES = 32;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
const HEADER_BYTES = 1 + NONCE_BYTES;

/** A key-encryption key and the version it is stored under (`user_keys.kek_version`). */
export interface Kek {
  version: number;
  key: Buffer;
}

/** Where a sealed value lives; all four parts go into its additional authenticated data. */
export interface SealRef {
  table: string;
  column: string;
  userId: string;
  rowId: string;
}

/** A value that cannot be opened: tampered, moved, or under the wrong key. Never carries content. */
export class SealError extends Error {
  override name = "SealError";
}

/** Reads `LENTE_KEK` (base64 of 32 bytes) with its version; refuses anything else. */
export function parseKek(base64: string | undefined, version: number): Kek {
  if (!base64) throw new SealError("LENTE_KEK is not set; generate one with scripts/new-kek.ts");
  if (!Number.isInteger(version) || version < 1 || version > 0xffff) throw new SealError(`KEK version ${version} is not an integer from 1 to 65535`);
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== KEY_BYTES) throw new SealError(`LENTE_KEK must be ${KEY_BYTES} bytes in base64, got ${key.length}`);
  return { version, key };
}

/** A fresh random data key for a new account. */
export function newDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** The additional data of a content value: `lente/v1/<table>/<column>/<user_id>/<row_id>`. */
export function aadOf(ref: SealRef): Buffer {
  for (const [name, value] of Object.entries(ref)) {
    if (!value || value.includes("/")) throw new SealError(`seal reference ${name} must be non-empty and contain no "/"`);
  }
  return Buffer.from(`lente/v${SEAL_VERSION}/${ref.table}/${ref.column}/${ref.userId}/${ref.rowId}`, "utf8");
}

const kekAad = (userId: string, version: number): Buffer => Buffer.from(`lente/v${SEAL_VERSION}/user_keys/wrapped_dek/${userId}/kek-${version}`, "utf8");

function encrypt(key: Buffer, plain: Buffer, aad: Buffer): Buffer {
  if (key.length !== KEY_BYTES) throw new SealError(`key must be ${KEY_BYTES} bytes, got ${key.length}`);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([SEAL_VERSION]), nonce, body, cipher.getAuthTag()]);
}

function decrypt(key: Buffer, sealed: Buffer, aad: Buffer, what: string): Buffer {
  if (key.length !== KEY_BYTES) throw new SealError(`key must be ${KEY_BYTES} bytes, got ${key.length}`);
  if (sealed.length < HEADER_BYTES + TAG_BYTES) throw new SealError(`${what} is too short to be sealed (${sealed.length} bytes)`);
  if (sealed[0] !== SEAL_VERSION) throw new SealError(`${what} has layout version ${sealed[0]}, expected ${SEAL_VERSION}`);
  const nonce = sealed.subarray(1, HEADER_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(HEADER_BYTES, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new SealError(`${what} does not open: tampered, moved to another place, or sealed under another key`);
  }
}

/** The user's DEK wrapped under the KEK, bound to that user and KEK version. */
export function wrapDek(dek: Buffer, kek: Kek, userId: string): Buffer {
  if (dek.length !== KEY_BYTES) throw new SealError(`data key must be ${KEY_BYTES} bytes, got ${dek.length}`);
  return encrypt(kek.key, dek, kekAad(userId, kek.version));
}

/** Opens a wrapped DEK with the KEK of its version; an unknown version is an error, not a guess. */
export function unwrapDek(wrapped: Buffer, kekVersion: number, keks: readonly Kek[], userId: string): Buffer {
  const kek = keks.find((k) => k.version === kekVersion);
  if (!kek) throw new SealError(`no KEK loaded for version ${kekVersion} (loaded: ${keks.map((k) => k.version).join(", ") || "none"})`);
  const dek = decrypt(kek.key, wrapped, kekAad(userId, kekVersion), `data key of user ${userId}`);
  if (dek.length !== KEY_BYTES) throw new SealError(`data key of user ${userId} opened to ${dek.length} bytes`);
  return dek;
}

const CANARY = Buffer.from("lente-kek-canary", "utf8");
const canaryAad = (version: number): Buffer => Buffer.from(`lente/v${SEAL_VERSION}/kek_canaries/sealed/kek-${version}`, "utf8");

/** A fixed value sealed under the KEK at setup (`kek_canaries`), to prove at start that the KEK is the same one. */
export function sealCanary(kek: Kek): Buffer {
  return encrypt(kek.key, CANARY, canaryAad(kek.version));
}

/** True when the canary opens under this KEK to the fixed value. */
export function opensCanary(kek: Kek, sealed: Buffer): boolean {
  try {
    return decrypt(kek.key, sealed, canaryAad(kek.version), "KEK canary").equals(CANARY);
  } catch {
    return false;
  }
}

/** Seals a content value for one place in the database. */
export function seal(dek: Buffer, value: string | Buffer, ref: SealRef): Buffer {
  return encrypt(dek, typeof value === "string" ? Buffer.from(value, "utf8") : value, aadOf(ref));
}

/** Opens a sealed value, or throws a SealError naming the place (never the content). */
export function open(dek: Buffer, sealed: Buffer, ref: SealRef): Buffer {
  return decrypt(dek, sealed, aadOf(ref), `${ref.table}.${ref.column} of row ${ref.rowId}`);
}

export function openText(dek: Buffer, sealed: Buffer, ref: SealRef): string {
  return open(dek, sealed, ref).toString("utf8");
}

/** Seals a JSON value (notes, payloads, digests). */
export function sealJson(dek: Buffer, value: unknown, ref: SealRef): Buffer {
  return seal(dek, JSON.stringify(value), ref);
}

export function openJson<T>(dek: Buffer, sealed: Buffer, ref: SealRef): T {
  return JSON.parse(openText(dek, sealed, ref)) as T;
}
