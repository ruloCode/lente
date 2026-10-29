// Who may talk to a cloud hub: clips with a device token, phones paired through a short code.
// Pure but for the file it is given: tokens are kept only as SHA-256 hashes in one JSON file on the
// hub's volume (a leaked file reveals no token), and revoking a device marks its entry.

import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** How long a pairing code works, in milliseconds. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong codes tolerated per code before it is burned (6 digits is guessable without a limit). */
export const PAIRING_MAX_ATTEMPTS = 5;
/** Name of the cookie a paired browser keeps. */
export const SESSION_COOKIE = "lente_session";

interface Device {
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  revoked?: boolean;
}

interface AuthFile {
  devices: Device[];
  /** Hashes of the session tokens of paired phones. */
  phones: { hash: string; pairedAt: number }[];
}

const hashOf = (token: string): string => createHash("sha256").update(token).digest("hex");

export class DeviceAuth {
  private state: AuthFile = { devices: [], phones: [] };
  private code: { value: string; expiresAt: number; attempts: number } | undefined;

  private readonly file: string;
  private loadedAt = 0;

  constructor(file: string) {
    this.file = file;
    this.reload(true);
  }

  /** Picks up tokens added or revoked from another process (scripts/hub-token.ts) while the hub runs. */
  private reload(force = false): void {
    if (!existsSync(this.file)) return;
    const mtime = statSync(this.file).mtimeMs;
    if (!force && mtime === this.loadedAt) return;
    try {
      this.state = JSON.parse(readFileSync(this.file, "utf8")) as AuthFile;
      this.loadedAt = mtime;
    } catch (error) {
      throw new Error(`${this.file} is not valid JSON (${(error as Error).message}); fix or delete it to start without paired devices`);
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.loadedAt = statSync(this.file).mtimeMs;
  }

  /** A new clip token; shown once, only its hash is kept. */
  issueDevice(name: string, now = Date.now()): { id: string; token: string } {
    this.reload();
    const token = randomBytes(24).toString("base64url");
    const id = randomBytes(4).toString("hex");
    this.state.devices.push({ id, name, hash: hashOf(token), createdAt: now });
    this.save();
    return { id, token };
  }

  /** True when the token belongs to a device that has not been revoked. */
  checkDevice(token: string | undefined): boolean {
    if (!token) return false;
    this.reload();
    const hash = hashOf(token);
    return this.state.devices.some((d) => d.hash === hash && !d.revoked);
  }

  revokeDevice(id: string): boolean {
    this.reload();
    const device = this.state.devices.find((d) => d.id === id && !d.revoked);
    if (!device) return false;
    device.revoked = true;
    this.save();
    return true;
  }

  listDevices(): { id: string; name: string; revoked: boolean }[] {
    this.reload();
    return this.state.devices.map((d) => ({ id: d.id, name: d.name, revoked: Boolean(d.revoked) }));
  }

  /** A fresh six-digit code for the hub's console; it replaces the previous one. */
  newPairingCode(now = Date.now()): string {
    const value = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.code = { value, expiresAt: now + PAIRING_CODE_TTL_MS, attempts: 0 };
    return value;
  }

  /** Trades the code for a session token (single use), or undefined for a wrong, expired or burned code. */
  pair(code: string, now = Date.now()): string | undefined {
    const current = this.code;
    if (!current || now > current.expiresAt) return undefined;
    if (++current.attempts > PAIRING_MAX_ATTEMPTS) {
      this.code = undefined;
      return undefined;
    }
    if (code.trim() !== current.value) return undefined;
    this.code = undefined;
    this.reload();
    const token = randomBytes(24).toString("base64url");
    this.state.phones.push({ hash: hashOf(token), pairedAt: now });
    this.save();
    return token;
  }

  checkSession(token: string | undefined): boolean {
    if (!token) return false;
    const hash = hashOf(token);
    return this.state.phones.some((p) => p.hash === hash);
  }
}

/** The value of one cookie in a `Cookie` header. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** A device token from `Authorization: Bearer …` or, for browsers that cannot set headers, `?token=`. */
export function deviceTokenOf(headers: { authorization?: string }, url: string): string | undefined {
  const bearer = /^Bearer (.+)$/.exec(headers.authorization ?? "")?.[1];
  return bearer ?? new URL(url, "http://hub").searchParams.get("token") ?? undefined;
}
