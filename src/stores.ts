// One interface per store the hub keeps (add-accounts 4.1, design decision 10). Two backends
// implement them: today's files (src/meeting-store.ts and friends, unchanged) when no Supabase keys
// are set, and the sealed Supabase stores (4.3) when they are. Methods that may reach the database
// return `Awaitable<T>`: a file store answers at once, a Supabase store with a promise, and callers
// `await` either. What the live loop reads on every frame (today's entries, the profile, the
// glossary) stays a plain in-memory value that the Supabase store loads when the user's runtime
// starts and writes behind.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TraceStep, Proposal } from "./agent-loop.ts";
import type { Task } from "./agent-tools.ts";
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
  setNames(input: string): string[];
  setEveryQuestion(on: boolean): void;
  setAssistMode(mode: AssistMode): void;
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
    const rest = this.all().filter((d) => !(d.scope === digest.scope && d.periodStart === digest.periodStart));
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...rest, digest], null, 2) + "\n");
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
