// A signed-in user's stores as the live runtime uses them (add-accounts 6.5, design decision 10):
// the same synchronous calls as the laptop's file stores, answered from memory, with every write
// sent to the sealed Supabase stores behind, in order, through one queue that eviction flushes.
// Meetings, facts, actions and tasks are loaded when the runtime opens; traces and earlier days are
// read from the database when asked (those routes await). Ids are chosen here, so memory and the
// database agree on them.

import type { SupabaseStorage } from "./supabase-storage.ts";
import { randomUUID } from "node:crypto";
import type { PendingAction } from "./action-store.ts";
import type { Proposal, TraceStep } from "./agent-loop.ts";
import { type Task, type TaskPatch, applyPatch } from "./agent-tools.ts";
import type { TraceEntry } from "./agent-trace.ts";
import type { DayEntry } from "./day-log.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting, ProposedFact } from "./meetings.ts";
import { openUserStores } from "./supabase-stores.ts";
import type { SupabaseRest } from "./supabase-rest.ts";
import type { UsageSnapshot } from "./usage-meter.ts";

type Sealed = Awaited<ReturnType<typeof openUserStores>>;

/** Writes in the order they were made, one at a time; a failure is logged (never its content) and kept for `flush`. */
export class WriteQueue {
  private chain: Promise<void> = Promise.resolve();
  private readonly loose = new Set<Promise<unknown>>();
  private failures = 0;

  push(what: string, write: () => Promise<unknown>): void {
    this.chain = this.chain.then(write).then(
      () => undefined,
      (error: Error) => {
        this.failures++;
        console.error(`[store] ${what} did not reach the database: ${error.message}`);
      },
    );
  }

  /** A write that need not wait its turn (a day entry); still awaited by `flush`. */
  track(what: string, write: Promise<unknown>): void {
    const p = write.catch((error: Error) => {
      this.failures++;
      console.error(`[store] ${what} did not reach the database: ${error.message}`);
    });
    this.loose.add(p);
    void p.finally(() => this.loose.delete(p));
  }

  /** Waits for every pending write; says how many failed since the last flush. */
  async flush(): Promise<number> {
    await this.chain;
    await Promise.all([...this.loose]);
    const failed = this.failures;
    this.failures = 0;
    return failed;
  }
}

const clone = <T>(value: T): T => structuredClone(value);

export class CachedMeetings {
  private readonly byId = new Map<string, Meeting>();
  private readonly sealed: Sealed["meetings"];
  private readonly queue: WriteQueue;

  constructor(loaded: Meeting[], sealed: Sealed["meetings"], queue: WriteQueue) {
    for (const m of loaded) this.byId.set(m.id, m);
    this.sealed = sealed;
    this.queue = queue;
  }

  /** Oldest first, as copies: callers change them and save, as with the files. */
  list(): Meeting[] {
    return [...this.byId.values()].sort((a, b) => a.startedAt - b.startedAt).map(clone);
  }

  save(meeting: Meeting): void {
    const copy = clone(meeting);
    this.byId.set(copy.id, copy);
    this.queue.push("a meeting", () => this.sealed.save(clone(copy)));
  }

  uniqueId(id: string): string {
    let candidate = id;
    for (let n = 2; this.byId.has(candidate); n++) candidate = `${id}-${n}`;
    return candidate;
  }

  delete(id: string): boolean {
    if (!this.byId.delete(id)) return false;
    this.queue.push("a meeting deletion", () => this.sealed.delete(id));
    return true;
  }

  deleteAll(): number {
    const n = this.byId.size;
    this.byId.clear();
    this.queue.push("deleting every meeting", () => this.sealed.deleteAll());
    return n;
  }
}

export class CachedFacts {
  private facts: Fact[];
  private readonly sealed: Sealed["facts"];
  private readonly queue: WriteQueue;

  constructor(loaded: Fact[], sealed: Sealed["facts"], queue: WriteQueue) {
    this.facts = loaded;
    this.sealed = sealed;
    this.queue = queue;
  }

  list(): Fact[] {
    return this.facts.map(clone);
  }

  propose(meetingId: string, proposed: ProposedFact[], now: number): Fact[] {
    const seen = new Set(this.facts.map((f) => f.text.toLowerCase()));
    const added: Fact[] = [];
    for (const p of proposed) {
      if (seen.has(p.text.toLowerCase())) continue;
      seen.add(p.text.toLowerCase());
      added.push({ id: randomUUID(), text: p.text, status: "proposed", meetingId, evidence: p.evidence, createdAt: now });
    }
    if (added.length) {
      this.facts.push(...added);
      this.queue.push("proposed facts", () => this.sealed.insert(added.map(clone)));
    }
    return added.map(clone);
  }

  keep(id: string): boolean {
    const fact = this.facts.find((f) => f.id === id && f.status === "proposed");
    if (!fact) return false;
    fact.status = "kept";
    this.queue.push("a kept fact", () => this.sealed.keep(id));
    return true;
  }

  remove(id: string): boolean {
    const before = this.facts.length;
    this.facts = this.facts.filter((f) => f.id !== id);
    if (this.facts.length === before) return false;
    this.queue.push("a removed fact", () => this.sealed.remove(id));
    return true;
  }

  removeMeeting(meetingId: string): number {
    const before = this.facts.length;
    this.facts = this.facts.filter((f) => f.meetingId !== meetingId);
    if (this.facts.length !== before) this.queue.push("a meeting's facts", () => this.sealed.removeMeeting(meetingId));
    return before - this.facts.length;
  }

  removeAll(): void {
    this.facts = [];
    this.queue.push("every fact", () => this.sealed.removeAll());
  }
}

export class CachedTasks {
  private readonly tasks: Task[];
  private readonly sealed: Sealed["tasks"];
  private readonly queue: WriteQueue;

  constructor(loaded: Task[], sealed: Sealed["tasks"], queue: WriteQueue) {
    this.tasks = loaded;
    this.sealed = sealed;
    this.queue = queue;
  }

  list(): Task[] {
    return this.tasks.map(clone);
  }

  add(input: Omit<Task, "id" | "done" | "createdAt">, now: number): Task {
    const task: Task = { ...input, id: randomUUID(), done: false, createdAt: now };
    this.tasks.push(task);
    this.queue.push("a task", () => this.sealed.insert(clone(task)));
    return clone(task);
  }

  setDone(id: string, done: boolean): Task | undefined {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return undefined;
    task.done = done;
    this.queue.push("a task's state", () => this.sealed.setDone(id, done));
    return clone(task);
  }

  update(id: string, patch: TaskPatch): Task | undefined {
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i < 0) return undefined;
    const next = applyPatch(this.tasks[i]!, patch);
    this.tasks[i] = next;
    this.queue.push("a task", () => this.sealed.replace(clone(next)));
    return clone(next);
  }

  remove(id: string): boolean {
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i < 0) return false;
    this.tasks.splice(i, 1);
    this.queue.push("a task's removal", () => this.sealed.remove(id).then(() => undefined));
    return true;
  }
}

export class CachedActions {
  private actions: PendingAction[];
  private readonly sealed: Sealed["actions"];
  private readonly queue: WriteQueue;

  constructor(loaded: PendingAction[], sealed: Sealed["actions"], queue: WriteQueue) {
    this.actions = loaded;
    this.sealed = sealed;
    this.queue = queue;
  }

  list(): PendingAction[] {
    return this.actions.map(clone);
  }

  get(id: string): PendingAction | undefined {
    const found = this.actions.find((a) => a.id === id);
    return found && clone(found);
  }

  addAll(meetingId: string, proposals: Proposal[], now: number): PendingAction[] {
    const added = proposals.map((p): PendingAction => ({ id: randomUUID(), meetingId, tool: p.tool, proposedArgs: p.args, args: p.args, evidence: p.evidence, status: "pending", createdAt: now }));
    if (added.length) {
      this.actions.push(...added);
      this.queue.push("proposed actions", () => this.sealed.insert(added.map(clone)));
    }
    return added.map(clone);
  }

  save(action: PendingAction): void {
    this.actions = this.actions.map((a) => (a.id === action.id ? clone(action) : a));
    const copy = clone(action);
    this.queue.push("an action", () => this.sealed.save(copy));
  }

  removeMeeting(meetingId: string): number {
    const before = this.actions.length;
    this.actions = this.actions.filter((a) => a.meetingId !== meetingId);
    if (this.actions.length !== before) this.queue.push("a meeting's actions", () => this.sealed.removeMeeting(meetingId));
    return before - this.actions.length;
  }

  removeAll(): void {
    this.actions = [];
    this.queue.push("every action", () => this.sealed.removeAll());
  }
}

/** Every store of one signed-in user, opened with their data key. */
export async function openCachedStores(rest: SupabaseRest, userId: string, dek: Buffer, now = Date.now(), storage?: SupabaseStorage) {
  const sealed = await openUserStores(rest, userId, dek, now, storage);
  const queue = new WriteQueue();
  const [meetings, facts, tasks, actions, usage] = await Promise.all([sealed.meetings.list(), sealed.facts.list(), sealed.tasks.list(), sealed.actions.list(), sealed.usage.load(now)]);
  return {
    sealed,
    meetings: new CachedMeetings(meetings, sealed.meetings, queue),
    facts: new CachedFacts(facts, sealed.facts, queue),
    tasks: new CachedTasks(tasks, sealed.tasks, queue),
    actions: new CachedActions(actions, sealed.actions, queue),
    traces: {
      append: (meetingId: string, entries: TraceEntry[]) => queue.push("a trace", () => sealed.traces.append(meetingId, entries)),
      appendRun: (meetingId: string, steps: TraceStep[], at: number) => queue.push("a trace", () => sealed.traces.appendRun(meetingId, steps, at)),
      read: (meetingId: string) => sealed.traces.read(meetingId),
      delete: (meetingId: string) => queue.push("a meeting's trace", () => sealed.traces.delete(meetingId)),
      deleteAll: () => queue.push("every trace", () => sealed.traces.deleteAll()),
    },
    day: {
      entries: sealed.day.entries,
      add: (entry: DayEntry) => queue.track("a day entry", sealed.day.add(entry)),
      since: (at: number) => sealed.day.since(at),
      recent: (days: number, at?: number) => sealed.day.recent(days, at),
    },
    profile: sealed.profile,
    language: sealed.language,
    digests: sealed.digests,
    usage: { initial: usage, save: (snapshot: UsageSnapshot) => queue.push("usage", () => sealed.usage.save(snapshot)) },
    /** Eviction: every pending write, the settings written behind included. Returns how many failed. */
    flush: async (): Promise<number> => {
      const failed = await queue.flush();
      await sealed.flush().catch(() => undefined);
      return failed;
    },
  };
}

export type CachedStores = Awaited<ReturnType<typeof openCachedStores>>;
