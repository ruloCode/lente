// Devices that belong to users (add-accounts 3.4, design decision 4). A signed-in user creates a
// clip, desktop or MCP token; it is shown once and kept only as a SHA-256 hash with the user id.
// Every read and change is scoped to the caller: another user's device answers as if it did not
// exist. The store is an interface: a JSON file here, the `devices` table on Supabase (4.3).

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEVICE_KINDS = ["clip", "desktop", "mcp"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
/** Longest label kept, in characters. */
export const DEVICE_LABEL_MAX = 40;
/** Devices one user may hold at once (revoked ones do not count). */
export const DEVICES_PER_USER_MAX = 20;

export interface DeviceRecord {
  id: string;
  userId: string;
  kind: DeviceKind;
  label: string;
  /** SHA-256 of the token, hex. */
  tokenHash: string;
  createdAt: number;
  lastSeenAt?: number;
  revokedAt?: number;
}

/** What the account screen shows: never the hash. */
export interface DeviceView {
  id: string;
  kind: DeviceKind;
  label: string;
  createdAt: number;
  lastSeenAt: number | null;
  revoked: boolean;
}

export interface DeviceStore {
  insert(device: DeviceRecord): Promise<void>;
  listFor(userId: string): Promise<DeviceRecord[]>;
  /** Lookup by hash across users: the hash is unique, and is all a connecting device carries. */
  byTokenHash(tokenHash: string): Promise<DeviceRecord | undefined>;
  /** Marks the user's device revoked; false when the user has no such live device. */
  revoke(userId: string, id: string, at: number): Promise<boolean>;
  touch(userId: string, id: string, at: number): Promise<void>;
}

export const tokenHashOf = (token: string): string => createHash("sha256").update(token).digest("hex");

const view = (d: DeviceRecord): DeviceView => ({ id: d.id, kind: d.kind, label: d.label, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt ?? null, revoked: d.revokedAt !== undefined });

export class DeviceError extends Error {
  override name = "DeviceError";
}

export class UserDevices {
  private readonly store: DeviceStore;
  private readonly now: () => number;

  constructor(store: DeviceStore, now: () => number = Date.now) {
    this.store = store;
    this.now = now;
  }

  /** A new device token for the user; the token is in this answer and nowhere else. */
  async create(userId: string, kind: unknown, label: unknown): Promise<DeviceView & { token: string }> {
    if (!DEVICE_KINDS.includes(kind as DeviceKind)) throw new DeviceError(`kind must be one of ${DEVICE_KINDS.join(", ")}`);
    const name = typeof label === "string" ? label.trim().slice(0, DEVICE_LABEL_MAX) : "";
    if (!name) throw new DeviceError("label is required");
    const live = (await this.store.listFor(userId)).filter((d) => d.revokedAt === undefined);
    if (live.length >= DEVICES_PER_USER_MAX) throw new DeviceError(`at most ${DEVICES_PER_USER_MAX} devices; revoke one first`);
    const token = randomBytes(24).toString("base64url");
    const device: DeviceRecord = { id: randomBytes(8).toString("hex"), userId, kind: kind as DeviceKind, label: name, tokenHash: tokenHashOf(token), createdAt: this.now() };
    await this.store.insert(device);
    return { ...view(device), token };
  }

  async list(userId: string): Promise<DeviceView[]> {
    return (await this.store.listFor(userId)).map(view).sort((a, b) => b.createdAt - a.createdAt);
  }

  revoke(userId: string, id: unknown): Promise<boolean> {
    if (typeof id !== "string" || !id) return Promise.resolve(false);
    return this.store.revoke(userId, id, this.now());
  }

  /** The owner of a live device token, recording that it was seen now; undefined when unknown or revoked. */
  async resolve(token: string): Promise<{ userId: string; deviceId: string } | undefined> {
    const device = await this.store.byTokenHash(tokenHashOf(token));
    if (!device || device.revokedAt !== undefined) return undefined;
    await this.store.touch(device.userId, device.id, this.now());
    return { userId: device.userId, deviceId: device.id };
  }
}

/** The answer to one `/devices` route, for the caller's user id. */
export async function deviceRoute(devices: UserDevices, userId: string, method: string, path: string, body: string): Promise<{ status: number; json?: unknown } | undefined> {
  const input = (): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(body || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };
  if (method === "GET" && path === "/devices") return { status: 200, json: { devices: await devices.list(userId) } };
  if (method === "POST" && path === "/devices") {
    const { kind, label } = input();
    try {
      return { status: 201, json: await devices.create(userId, kind ?? "clip", label) };
    } catch (error) {
      if (error instanceof DeviceError) return { status: 400, json: { error: error.message } };
      throw error;
    }
  }
  if (method === "POST" && path === "/devices/revoke") {
    return (await devices.revoke(userId, input().id)) ? { status: 204 } : { status: 404, json: { error: "no such device" } };
  }
  return undefined;
}

/** Devices in memory: the tests, and the base of the file store. */
export class MemoryDeviceStore implements DeviceStore {
  protected devices: DeviceRecord[] = [];

  async insert(device: DeviceRecord): Promise<void> {
    if (this.devices.some((d) => d.tokenHash === device.tokenHash)) throw new Error("device token hash already exists");
    this.devices.push({ ...device });
    this.saved();
  }

  async listFor(userId: string): Promise<DeviceRecord[]> {
    return this.devices.filter((d) => d.userId === userId).map((d) => ({ ...d }));
  }

  async byTokenHash(tokenHash: string): Promise<DeviceRecord | undefined> {
    const found = this.devices.find((d) => d.tokenHash === tokenHash);
    return found && { ...found };
  }

  async revoke(userId: string, id: string, at: number): Promise<boolean> {
    const device = this.devices.find((d) => d.userId === userId && d.id === id && d.revokedAt === undefined);
    if (!device) return false;
    device.revokedAt = at;
    this.saved();
    return true;
  }

  async touch(userId: string, id: string, at: number): Promise<void> {
    const device = this.devices.find((d) => d.userId === userId && d.id === id);
    if (device) {
      device.lastSeenAt = at;
      this.saved();
    }
  }

  /** Called after every change. */
  protected saved(): void {}
}

/** Devices in one JSON file on the hub's volume (accounts mode before the Supabase stores). */
export class FileDeviceStore extends MemoryDeviceStore {
  private readonly file: string;

  constructor(file: string) {
    super();
    this.file = file;
    if (!existsSync(file)) return;
    try {
      this.devices = (JSON.parse(readFileSync(file, "utf8")) as { devices: DeviceRecord[] }).devices;
    } catch (error) {
      throw new Error(`${file} is not valid JSON (${(error as Error).message}); fix or delete it to start without user devices`);
    }
  }

  protected override saved(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ devices: this.devices }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
