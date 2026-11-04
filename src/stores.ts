// One interface per store the hub keeps (add-accounts 4.1, design decision 10). Two backends
// implement them: today's files (src/meeting-store.ts and friends, unchanged) when no Supabase keys
// are set, and the sealed Supabase stores (4.3) when they are. Methods that may reach the database
// return `Awaitable<T>`: a file store answers at once, a Supabase store with a promise, and callers
// `await` either. What the live loop reads on every frame (today's entries, the profile, the
// glossary) stays a plain in-memory value that the Supabase store loads when the user's runtime
// starts and writes behind.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { NotificationSettings } from "./notifications.ts";
import { dirname } from "node:path";
import type { TraceStep, Proposal } from "./agent-loop.ts";
import type { Task, TaskPatch } from "./agent-tools.ts";
import type { Fact } from "./fact-store.ts";
import type { PendingAction } from "./action-store.ts";
import type { TraceEntry } from "./agent-trace.ts";
import type { DayEntry } from "./day-log.ts";
import type { Digest, DigestScope } from "./digests.ts";
import type { GlossaryEntry } from "./language-profile.ts";
import type { Meeting, ProposedFact } from "./meetings.ts";
import type { AssistMode } from "./profile.ts";
import type { UsageSnapshot } from "./usage-meter.ts";

export type { DeviceStore } from "./user-devices.ts";

export type Awaitable<T> = T | Promise<T>;

/** Meetings, oldest first. */
export interface Meetings {
  save(meeting: Meeting): Awaitable<void>;
  list(): Awaitable<Meeting[]>;
  /** A new id that does not clash with a meeting started in the same second. */
  uniqueId(id: string): Awaitable<string>;
  delete(id: string): Awaitable<boolean>;
  deleteAll(): Awaitable<number>;
}

/** The day record: today's entries in memory, earlier days on request. */
export interface DayRecord {
  readonly entries: DayEntry[];
  add(entry: DayEntry): Awaitable<void>;
  since(at: number): DayEntry[];
  /** Today and the `days - 1` days before it, oldest first. */
  recent(days: number, now?: number): Awaitable<DayEntry[]>;
}

export interface Facts {
  list(): Awaitable<Fact[]>;
  propose(meetingId: string, proposed: ProposedFact[], now: number): Awaitable<Fact[]>;
  keep(id: string): Awaitable<boolean>;
  remove(id: string): Awaitable<boolean>;
  removeMeeting(meetingId: string): Awaitable<number>;
  removeAll(): Awaitable<void>;
}

export interface Tasks {
  list(): Awaitable<Task[]>;
  add(input: Omit<Task, "id" | "done" | "createdAt">, now: number): Awaitable<Task>;
  setDone(id: string, done: boolean): Awaitable<Task | undefined>;
  update(id: string, patch: TaskPatch): Awaitable<Task | undefined>;
  remove(id: string): Awaitable<boolean>;
}

export interface Actions {
  list(): Awaitable<PendingAction[]>;
  get(id: string): Awaitable<PendingAction | undefined>;
  addAll(meetingId: string, proposals: Proposal[], now: number): Awaitable<PendingAction[]>;
  save(action: PendingAction): Awaitable<void>;
  removeMeeting(meetingId: string): Awaitable<number>;
  removeAll(): Awaitable<void>;
}

/** The agent's traces, per meeting. */
export interface Traces {
  append(meetingId: string, entries: TraceEntry[]): Awaitable<void>;
  appendRun(meetingId: string, steps: TraceStep[], at: number): Awaitable<void>;
  read(meetingId: string): Awaitable<TraceEntry[]>;
  delete(meetingId: string): Awaitable<void>;
  deleteAll(): Awaitable<void>;
}

/** The wearer's settings: read on every turn, so kept in memory. */
export interface Profile {
  readonly names: string[];
  readonly everyQuestion: boolean;
  readonly assistMode: AssistMode;
  /** «Guardar audio» and «Guardar fotos» (add-media-archive). */
  readonly media: { audio: boolean; photos: boolean };
  readonly mediaRetentionDays: 7 | 30 | 90;
  /** The activity feed's read mark and the wearer's notification settings (add-notifications). */
  readonly notifications: NotificationSettings;
  setNames(input: string): string[];
  setEveryQuestion(on: boolean): void;
  setAssistMode(mode: AssistMode): void;
  setMedia(kind: "audio" | "photos", on: boolean): void;
  setMediaRetention(days: 7 | 30 | 90): void;
  setNotifications(settings: NotificationSettings): void;
}

/** The glossary and language profile: read by transcription, so kept in memory. */
export interface Language {
  readonly glossary: GlossaryEntry[];
  set(glossary: GlossaryEntry[]): void;
}

/** The profile and the day, week and month digests (design decision 8). */
export interface DigestStore {
  get(scope: DigestScope, periodStart: string): Awaitable<Digest | undefined>;
  /** Newest first. */
  latest(scope: DigestScope, count: number): Awaitable<Digest[]>;
  /** Replaces the digest of the same scope and period. */
  put(digest: Digest): Awaitable<void>;
  /** Removes one (a brief or person card with nothing left behind it after a forget). */
  remove(scope: DigestScope, periodStart: string): Awaitable<void>;
}

/** Digests in one JSON file (`data/digests.json`), for the laptop hub. */
export class FileDigestStore implements DigestStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private all(): Digest[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Digest[]) : [];
    } catch (error) {
      console.error(`[digests] could not read ${this.file}: ${(error as Error).message}`);
      return [];
    }
  }

  get(scope: DigestScope, periodStart: string): Digest | undefined {
    return this.all().find((d) => d.scope === scope && d.periodStart === periodStart);
  }

  latest(scope: DigestScope, count: number): Digest[] {
    return this.all().filter((d) => d.scope === scope).sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.createdAt - a.createdAt).slice(0, count);
  }

  put(digest: Digest): void {
    this.write([...this.all().filter((d) => !(d.scope === digest.scope && d.periodStart === digest.periodStart)), digest]);
  }

  remove(scope: DigestScope, periodStart: string): void {
    this.write(this.all().filter((d) => !(d.scope === scope && d.periodStart === periodStart)));
  }

  private write(list: Digest[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(list, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
}

/** Today's usage numbers, for the meter that counts them in memory. */
export interface UsageStore {
  load(): Awaitable<Partial<UsageSnapshot> | undefined>;
  save(snapshot: UsageSnapshot): Awaitable<void>;
}

/** Usage in one JSON file (`data/usage.json`), the format the laptop hub already writes. */
export class FileUsageStore implements UsageStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  load(): Partial<UsageSnapshot> | undefined {
    if (!existsSync(this.file)) return undefined;
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Partial<UsageSnapshot>;
    } catch (error) {
      console.error(`[usage] could not read ${this.file}: ${(error as Error).message}`);
      return undefined;
    }
  }

  save(snapshot: UsageSnapshot): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot) + "\n");
    renameSync(tmp, this.file);
  }
}

// --- Memory index snapshots (add-memory-engine 7.1) -----------------------------------------------

/** One month shard of the memory index as bytes (src/index-snapshot.ts) with what the database may see. */
export interface SnapshotRecord {
  shard: string;
  formatVersion: number;
  /** The encoder's id, or `lexical`. */
  encoder: string;
  builtThrough: number;
  bytes: Uint8Array;
}

/** Snapshots by shard (`YYYY-MM`). The Supabase store seals the bytes; the laptop keeps them as 0600 files like the rest of `data/`. */
export interface SnapshotStore {
  get(shard: string): Awaitable<SnapshotRecord | undefined>;
  put(record: SnapshotRecord): Awaitable<void>;
  /** Shards it holds, without their bytes. */
  list(): Awaitable<Omit<SnapshotRecord, "bytes">[]>;
  remove(shard: string): Awaitable<void>;
}

/** `data/memory/<shard>.bin` with a small JSON sidecar for the plain fields. */
export class FileSnapshots implements SnapshotStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private path(shard: string, ext: string): string {
    if (!/^\d{4}-\d{2}$/.test(shard)) throw new Error(`memory snapshot: "${shard}" is not a YYYY-MM shard`);
    return `${this.dir}/${shard}.${ext}`;
  }

  get(shard: string): SnapshotRecord | undefined {
    const meta = this.path(shard, "json");
    if (!existsSync(meta) || !existsSync(this.path(shard, "bin"))) return undefined;
    const m = JSON.parse(readFileSync(meta, "utf8")) as Omit<SnapshotRecord, "bytes">;
    return { ...m, bytes: new Uint8Array(readFileSync(this.path(shard, "bin"))) };
  }

  put(record: SnapshotRecord): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const { bytes, ...meta } = record;
    for (const [ext, data] of [["bin", bytes], ["json", JSON.stringify(meta)]] as const) {
      const tmp = `${this.path(record.shard, ext)}.tmp`;
      writeFileSync(tmp, data, { mode: 0o600 });
      renameSync(tmp, this.path(record.shard, ext));
    }
  }

  list(): Omit<SnapshotRecord, "bytes">[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(`${this.dir}/${f}`, "utf8")) as Omit<SnapshotRecord, "bytes">);
  }

  remove(shard: string): void {
    for (const ext of ["bin", "json"]) rmSync(this.path(shard, ext), { force: true });
  }
}

// --- Media (add-media-archive 2.1) ---------------------------------------------------------------

export type MediaKind = "audio" | "frame";

/** What the database may see of a media object: ids, times, sizes and the codec, never content. */
export interface MediaRecord {
  kind: MediaKind;
  /** The segment (`s<meeting id>:<n>`) or the moment (`d<day>:<n>`) it belongs to. */
  ref: string;
  at: number;
  ms: number;
  bytes: number;
  codec: string;
}

export interface MediaStore {
  put(record: MediaRecord, data: Uint8Array): Awaitable<void>;
  get(kind: MediaKind, ref: string): Awaitable<{ record: MediaRecord; data: Uint8Array } | undefined>;
  /** Records in [from, to), oldest first. */
  list(from: number, to: number): Awaitable<MediaRecord[]>;
  /** Each removal deletes the objects before their rows; returns how many went. */
  remove(kind: MediaKind, refs: readonly string[]): Awaitable<number>;
  removeBetween(from: number, to: number): Awaitable<number>;
  /** Retention: up to `cap` records older than `before`, oldest first. */
  expire(before: number, cap: number): Awaitable<number>;
  removeAll(): Awaitable<number>;
}

const safeRef = (ref: string) => {
  if (!/^[a-zA-Z0-9:._-]{1,80}$/.test(ref)) throw new Error(`media: "${ref.slice(0, 40)}" is not a segment or moment id`);
  return ref.replace(/:/g, "_");
};

/** The laptop's media: `data/media/<kind>/<ref>.<codec>` and an index of the records, private to the user. */
export class FileMedia implements MediaStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private file(r: Pick<MediaRecord, "kind" | "ref" | "codec">): string {
    return `${this.dir}/${r.kind}/${safeRef(r.ref)}.${r.codec}`;
  }

  private all(): MediaRecord[] {
    const index = `${this.dir}/index.json`;
    return existsSync(index) ? (JSON.parse(readFileSync(index, "utf8")) as MediaRecord[]) : [];
  }

  private write(list: MediaRecord[]): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.dir}/index.json.tmp`;
    writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
    renameSync(tmp, `${this.dir}/index.json`);
  }

  put(record: MediaRecord, data: Uint8Array): void {
    mkdirSync(`${this.dir}/${record.kind}`, { recursive: true, mode: 0o700 });
    writeFileSync(this.file(record), data, { mode: 0o600 });
    this.write([...this.all().filter((r) => !(r.kind === record.kind && r.ref === record.ref)), record]);
  }

  get(kind: MediaKind, ref: string): { record: MediaRecord; data: Uint8Array } | undefined {
    const record = this.all().find((r) => r.kind === kind && r.ref === ref);
    if (!record || !existsSync(this.file(record))) return undefined;
    return { record, data: new Uint8Array(readFileSync(this.file(record))) };
  }

  list(from: number, to: number): MediaRecord[] {
    return this.all().filter((r) => r.at >= from && r.at < to).sort((a, b) => a.at - b.at);
  }

  private drop(pick: (r: MediaRecord) => boolean, cap = Infinity): number {
    const all = this.all();
    const gone = all.filter(pick).sort((a, b) => a.at - b.at).slice(0, cap);
    for (const r of gone) rmSync(this.file(r), { force: true });
    this.write(all.filter((r) => !gone.includes(r)));
    return gone.length;
  }

  remove(kind: MediaKind, refs: readonly string[]): number {
    return this.drop((r) => r.kind === kind && refs.includes(r.ref));
  }

  removeBetween(from: number, to: number): number {
    return this.drop((r) => r.at >= from && r.at < to);
  }

  expire(before: number, cap: number): number {
    return this.drop((r) => r.at < before, cap);
  }

  removeAll(): number {
    return this.drop(() => true);
  }
}

// --- The day's spend across accounts (ship-hackathon 2.2) -------------------------------------------

/** Every account's spend today in one JSON file (`data/usage-daily.json`), numbers and user ids only. */
export class FileDaySpend {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  async load(day: string): Promise<Record<string, number>> {
    if (!existsSync(this.file)) return {};
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as { day?: unknown; users?: Record<string, unknown> };
      if (saved.day !== day || !saved.users) return {};
      return Object.fromEntries(Object.entries(saved.users).filter((e): e is [string, number] => typeof e[1] === "number"));
    } catch (error) {
      console.error(`[spend] could not read ${this.file}: ${(error as Error).message}`);
      return {};
    }
  }

  async save(spend: { day: string; users: Record<string, number> }): Promise<void> {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(spend) + "\n", { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
