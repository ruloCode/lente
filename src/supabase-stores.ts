// The stores on Supabase (add-accounts 4.3, design decisions 5, 6 and 10): the same interfaces as
// the file stores (src/stores.ts), for one user, sealing every content value with that user's data
// key before it leaves the hub and opening it on read. Plain columns carry only what the hub
// filters, sorts or cascades on. The ids the hub and the phone already use (`m2026…` meetings) stay
// the outward ids; rows get uuids. What the live loop reads on every frame (today's entries, the
// profile, the glossary) is held in memory, loaded when the store opens and written behind.

import { createHash, randomUUID } from "node:crypto";
import type { Proposal, TraceStep } from "./agent-loop.ts";
import type { Task } from "./agent-tools.ts";
import type { PendingAction } from "./action-store.ts";
import type { AccountRecord, AccountStore } from "./accounts.ts";
import type { TraceEntry } from "./agent-trace.ts";
import { type DayEntry, dayKey } from "./day-log.ts";
import type { Fact } from "./fact-store.ts";
import type { CanaryStore } from "./kek-check.ts";
import type { GlossaryEntry } from "./language-profile.ts";
import type { Meeting, MeetingTurn, Notes, ProposedFact } from "./meetings.ts";
import { parseNames } from "./addressing.ts";
import type { AssistMode } from "./profile.ts";
import { open, seal } from "./seal.ts";
import type { Actions, DayRecord, DeviceStore, Facts, Language, Meetings, Profile, Tasks, Traces, UsageStore } from "./stores.ts";
import { SupabaseRest, fromBytea, toBytea } from "./supabase-rest.ts";
import { type UsageSnapshot, priceTokens } from "./usage-meter.ts";
import type { DeviceRecord } from "./user-devices.ts";

type Db = ReturnType<SupabaseRest["forUser"]>;
type Row = Record<string, unknown>;

const iso = (ms: number): string => new Date(ms).toISOString();
const msOf = (value: unknown): number => Date.parse(String(value));
const msOrUndefined = (value: unknown): number | undefined => (value == null ? undefined : msOf(value));
const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("base64url");

/** Seals and opens one user's values, bound to table, column and row. */
export class Sealer {
  readonly userId: string;
  private readonly dek: Buffer;

  constructor(userId: string, dek: Buffer) {
    this.userId = userId;
    this.dek = dek;
  }

  json(table: string, column: string, rowId: string, value: unknown): string {
    return toBytea(seal(this.dek, JSON.stringify(value), { table, column, userId: this.userId, rowId }));
  }

  openJson<T>(table: string, column: string, rowId: string, value: unknown): T {
    return JSON.parse(open(this.dek, fromBytea(value), { table, column, userId: this.userId, rowId }).toString("utf8")) as T;
  }
}

/** Each meeting's row uuid by the id the hub uses. */
class MeetingIndex {
  private readonly byLegacy = new Map<string, string>();
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  remember(legacyId: string, uuid: string): void {
    this.byLegacy.set(legacyId, uuid);
  }

  forget(legacyId: string): void {
    this.byLegacy.delete(legacyId);
  }

  async uuidOf(legacyId: string): Promise<string | undefined> {
    const known = this.byLegacy.get(legacyId);
    if (known) return known;
    const rows = await this.db.select<{ id: string }>(this.db.query("meetings").eq("legacy_id", legacyId).limit(1), "id");
    if (rows[0]) this.byLegacy.set(legacyId, rows[0].id);
    return rows[0]?.id;
  }
}

// Meetings ------------------------------------------------------------------------------------------

export class SupabaseMeetings implements Meetings {
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly index: MeetingIndex;
  /** What was last written per meeting, so a save sends only the turns and notes that changed. */
  private readonly written = new Map<string, { meta: string; turns: string[]; notes?: string }>();

  constructor(db: Db, sealer: Sealer, index: MeetingIndex) {
    this.db = db;
    this.s = sealer;
    this.index = index;
  }

  async save(m: Meeting): Promise<void> {
    const id = (await this.index.uuidOf(m.id)) ?? randomUUID();
    this.index.remember(m.id, id);
    const before = this.written.get(m.id) ?? { meta: "", turns: [] };
    const meta = { ...m, turns: undefined, notes: undefined };
    const metaPrint = fingerprint(meta);
    if (metaPrint !== before.meta) {
      await this.db.insert("meetings", [{
        id,
        legacy_id: m.id,
        started_at: iso(m.startedAt),
        ended_at: m.endedAt === undefined ? null : iso(m.endedAt),
        status: m.status,
        end_reason: m.endReason ?? null,
        auto: Boolean(m.auto),
        topic: m.topic ?? null,
        title_enc: this.s.json("meetings", "title_enc", id, m.title),
        title_generated: Boolean(m.titleGenerated),
        asked: m.stats?.asked ?? 0,
        answered: m.stats?.answered ?? 0,
        dropped_items: m.droppedItems ?? 0,
        error_enc: m.error === undefined ? null : this.s.json("meetings", "error_enc", id, m.error),
      }], { upsertOn: "id" });
    }
    const turnPrints = m.turns.map(fingerprint);
    const changed = m.turns.map((t, seq) => ({ t, seq })).filter(({ seq }) => before.turns[seq] !== turnPrints[seq]);
    if (changed.length) {
      await this.db.insert("meeting_turns", changed.map(({ t, seq }) => this.turnRow(id, seq, t)), { upsertOn: "meeting_id,seq" });
    }
    let notesPrint = before.notes;
    if (m.notes) {
      notesPrint = fingerprint(m.notes);
      if (notesPrint !== before.notes) {
        await this.db.insert("meeting_notes", [{ meeting_id: id, body_enc: this.s.json("meeting_notes", "body_enc", id, m.notes), model: null, created_at: iso(Date.now()) }], { upsertOn: "meeting_id" });
      }
    }
    this.written.set(m.id, { meta: metaPrint, turns: turnPrints, notes: notesPrint });
  }

  private turnRow(meetingId: string, seq: number, t: MeetingTurn): Row {
    const rowId = `${meetingId}:${seq}`;
    return {
      meeting_id: meetingId,
      seq,
      at: iso(t.at),
      start_at: t.startAt === undefined ? null : iso(t.startAt),
      addressed: Boolean(t.addressed),
      wearer: Boolean(t.wearer),
      speaker_enc: t.speaker === undefined ? null : this.s.json("meeting_turns", "speaker_enc", rowId, t.speaker),
      text_enc: this.s.json("meeting_turns", "text_enc", rowId, { id: t.id, text: t.text }),
    };
  }

  /** Oldest first, with their turns and notes. */
  async list(): Promise<Meeting[]> {
    const rows = await this.db.select<Row>(this.db.query("meetings").order("started_at", "asc"));
    if (rows.length === 0) return [];
    const turns = await this.db.select<Row>(this.db.query("meeting_turns").order("meeting_id").order("seq"));
    const notes = await this.db.select<Row>(this.db.query("meeting_notes"));
    const turnsBy = new Map<string, Row[]>();
    for (const t of turns) turnsBy.set(String(t.meeting_id), [...(turnsBy.get(String(t.meeting_id)) ?? []), t]);
    const notesBy = new Map(notes.map((n) => [String(n.meeting_id), n]));
    return rows.map((r) => {
      const id = String(r.id);
      const legacy = String(r.legacy_id);
      this.index.remember(legacy, id);
      const meeting: Meeting = {
        id: legacy,
        title: this.s.openJson<string>("meetings", "title_enc", id, r.title_enc),
        startedAt: msOf(r.started_at),
        status: r.status as Meeting["status"],
        turns: (turnsBy.get(id) ?? []).sort((a, b) => Number(a.seq) - Number(b.seq)).map((t) => this.openTurn(id, t)),
      };
      if (r.title_generated) meeting.titleGenerated = true;
      if (r.topic != null) meeting.topic = r.topic as Meeting["topic"];
      if (r.auto) meeting.auto = true;
      if (r.ended_at != null) meeting.endedAt = msOf(r.ended_at);
      if (r.end_reason != null) meeting.endReason = r.end_reason as Meeting["endReason"];
      if (Number(r.asked) || Number(r.answered)) meeting.stats = { asked: Number(r.asked), answered: Number(r.answered) };
      if (Number(r.dropped_items)) meeting.droppedItems = Number(r.dropped_items);
      if (r.error_enc != null) meeting.error = this.s.openJson<string>("meetings", "error_enc", id, r.error_enc);
      const n = notesBy.get(id);
      if (n) meeting.notes = this.s.openJson<Notes>("meeting_notes", "body_enc", id, n.body_enc);
      this.written.set(legacy, { meta: fingerprint({ ...meeting, turns: undefined, notes: undefined }), turns: meeting.turns.map(fingerprint), notes: meeting.notes && fingerprint(meeting.notes) });
      return meeting;
    });
  }

  private openTurn(meetingId: string, t: Row): MeetingTurn {
    const rowId = `${meetingId}:${t.seq}`;
    const body = this.s.openJson<{ id: string; text: string }>("meeting_turns", "text_enc", rowId, t.text_enc);
    const turn: MeetingTurn = { id: body.id, at: msOf(t.at), text: body.text };
    if (t.start_at != null) turn.startAt = msOf(t.start_at);
    if (t.addressed) turn.addressed = true;
    if (t.speaker_enc != null) turn.speaker = this.s.openJson<string>("meeting_turns", "speaker_enc", rowId, t.speaker_enc);
    if (t.wearer) turn.wearer = true;
    return turn;
  }

  async uniqueId(id: string): Promise<string> {
    let candidate = id;
    for (let n = 2; await this.index.uuidOf(candidate); n++) candidate = `${id}-${n}`;
    return candidate;
  }

  async delete(id: string): Promise<boolean> {
    const uuid = await this.index.uuidOf(id);
    if (!uuid) return false;
    const gone = await this.db.remove(this.db.query("meetings").eq("id", uuid));
    this.index.forget(id);
    this.written.delete(id);
    return gone.length > 0;
  }

  async deleteAll(): Promise<number> {
    const gone = await this.db.remove(this.db.query("meetings"));
    this.written.clear();
    return gone.length;
  }
}

// The day record ------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (at: number): number => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export class SupabaseDayRecord implements DayRecord {
  readonly entries: DayEntry[] = [];
  private day: string;
  private readonly db: Db;
  private readonly s: Sealer;

  private constructor(db: Db, sealer: Sealer, now: number) {
    this.db = db;
    this.s = sealer;
    this.day = dayKey(now);
  }

  /** Loads today's entries, the part of the record the live loop reads. */
  static async open(db: Db, sealer: Sealer, now = Date.now()): Promise<SupabaseDayRecord> {
    const record = new SupabaseDayRecord(db, sealer, now);
    record.entries.push(...(await record.between(startOfDay(now), startOfDay(now) + DAY_MS)));
    return record;
  }

  async add(entry: DayEntry): Promise<void> {
    const day = dayKey(entry.at);
    if (day !== this.day) {
      this.day = day;
      this.entries.length = 0;
    }
    this.entries.push(entry);
    const id = randomUUID();
    await this.db.insert("day_entries", [{ id, at: iso(entry.at), kind: entry.kind, label: null, meeting_id: null, body_enc: this.s.json("day_entries", "body_enc", id, entry) }]);
  }

  since(at: number): DayEntry[] {
    return this.entries.filter((e) => e.at >= at);
  }

  async recent(days: number, now = Date.now()): Promise<DayEntry[]> {
    const today = startOfDay(now);
    const earlier = days > 1 ? await this.between(startOfDay(today - (days - 1) * DAY_MS + DAY_MS / 2), today) : [];
    return [...earlier, ...this.entries];
  }

  private async between(from: number, to: number): Promise<DayEntry[]> {
    const rows = await this.db.select<Row>(this.db.query("day_entries").gte("at", iso(from)).lt("at", iso(to)).order("at"), "id,body_enc");
    return rows.map((r) => this.s.openJson<DayEntry>("day_entries", "body_enc", String(r.id), r.body_enc));
  }
}

// Facts, tasks, actions, traces ---------------------------------------------------------------------

export class SupabaseFacts implements Facts {
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly index: MeetingIndex;

  constructor(db: Db, sealer: Sealer, index: MeetingIndex) {
    this.db = db;
    this.s = sealer;
    this.index = index;
  }

  async list(): Promise<Fact[]> {
    const rows = await this.db.select<Row>(this.db.query("facts").order("created_at"));
    return rows.map((r) => {
      const body = this.s.openJson<{ text: string; meetingId: string }>("facts", "text_enc", String(r.id), r.text_enc);
      return { id: String(r.id), text: body.text, status: r.status as Fact["status"], meetingId: body.meetingId, evidence: (r.evidence as string[]) ?? [], createdAt: msOf(r.created_at) };
    });
  }

  async propose(meetingId: string, proposed: ProposedFact[], now: number): Promise<Fact[]> {
    const seen = new Set((await this.list()).map((f) => f.text.toLowerCase()));
    const added: Fact[] = [];
    for (const p of proposed) {
      if (seen.has(p.text.toLowerCase())) continue;
      seen.add(p.text.toLowerCase());
      added.push({ id: randomUUID(), text: p.text, status: "proposed", meetingId, evidence: p.evidence, createdAt: now });
    }
    if (added.length) {
      const meetingUuid = (await this.index.uuidOf(meetingId)) ?? null;
      await this.db.insert("facts", added.map((f) => ({ id: f.id, status: f.status, text_enc: this.s.json("facts", "text_enc", f.id, { text: f.text, meetingId: f.meetingId }), meeting_id: meetingUuid, evidence: f.evidence, created_at: iso(now) })));
    }
    return added;
  }

  async keep(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await this.db.update(this.db.query("facts").eq("id", id).eq("status", "proposed"), { status: "kept", decided_at: iso(Date.now()) });
    return rows.length > 0;
  }

  async remove(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.remove(this.db.query("facts").eq("id", id))).length > 0;
  }

  /** Facts name their meeting inside the sealed body, so the match happens here, not in SQL. */
  async removeMeeting(meetingId: string): Promise<number> {
    const ids = (await this.list()).filter((f) => f.meetingId === meetingId).map((f) => f.id);
    if (ids.length === 0) return 0;
    return (await this.db.remove(this.db.query("facts").in("id", ids))).length;
  }

  async removeAll(): Promise<void> {
    await this.db.remove(this.db.query("facts"));
  }
}

const isUuid = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class SupabaseTasks implements Tasks {
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly index: MeetingIndex;

  constructor(db: Db, sealer: Sealer, index: MeetingIndex) {
    this.db = db;
    this.s = sealer;
    this.index = index;
  }

  async list(): Promise<Task[]> {
    const rows = await this.db.select<Row>(this.db.query("tasks").order("created_at"));
    return rows.map((r) => {
      const body = this.s.openJson<Omit<Task, "id" | "done" | "createdAt">>("tasks", "title_enc", String(r.id), r.title_enc);
      return { ...body, id: String(r.id), done: r.done_at != null, createdAt: msOf(r.created_at) };
    });
  }

  async add(input: Omit<Task, "id" | "done" | "createdAt">, now: number): Promise<Task> {
    const id = randomUUID();
    await this.db.insert("tasks", [{ id, title_enc: this.s.json("tasks", "title_enc", id, input), due: null, done_at: null, meeting_id: (await this.index.uuidOf(input.meetingId)) ?? null, created_at: iso(now) }]);
    return { ...input, id, done: false, createdAt: now };
  }

  async setDone(id: string, done: boolean): Promise<Task | undefined> {
    if (!isUuid(id)) return undefined;
    const rows = await this.db.update(this.db.query("tasks").eq("id", id), { done_at: done ? iso(Date.now()) : null });
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { ...this.s.openJson<Omit<Task, "id" | "done" | "createdAt">>("tasks", "title_enc", id, r.title_enc), id, done, createdAt: msOf(r.created_at) };
  }
}

type ActionBody = Pick<PendingAction, "meetingId" | "tool" | "proposedArgs" | "args" | "evidence">;

export class SupabaseActions implements Actions {
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly index: MeetingIndex;

  constructor(db: Db, sealer: Sealer, index: MeetingIndex) {
    this.db = db;
    this.s = sealer;
    this.index = index;
  }

  private open(r: Row): PendingAction {
    const id = String(r.id);
    const body = this.s.openJson<ActionBody>("agent_actions", "payload_enc", id, r.payload_enc);
    const action: PendingAction = { id, ...body, status: r.status as PendingAction["status"], createdAt: msOf(r.created_at) };
    if (r.decided_at != null) action.decidedAt = msOf(r.decided_at);
    if (r.outcome_enc != null) action.outcome = this.s.openJson<unknown>("agent_actions", "outcome_enc", id, r.outcome_enc);
    return action;
  }

  async list(): Promise<PendingAction[]> {
    return (await this.db.select<Row>(this.db.query("agent_actions").order("created_at"))).map((r) => this.open(r));
  }

  async get(id: string): Promise<PendingAction | undefined> {
    if (!isUuid(id)) return undefined;
    const rows = await this.db.select<Row>(this.db.query("agent_actions").eq("id", id).limit(1));
    return rows[0] && this.open(rows[0]);
  }

  async addAll(meetingId: string, proposals: Proposal[], now: number): Promise<PendingAction[]> {
    const added = proposals.map((p): PendingAction => ({ id: randomUUID(), meetingId, tool: p.tool, proposedArgs: p.args, args: p.args, evidence: p.evidence, status: "pending", createdAt: now }));
    if (added.length) {
      const meetingUuid = (await this.index.uuidOf(meetingId)) ?? null;
      await this.db.insert("agent_actions", added.map((a) => ({ id: a.id, kind: a.tool, status: a.status, payload_enc: this.payload(a), outcome_enc: null, meeting_id: meetingUuid, created_at: iso(now) })));
    }
    return added;
  }

  private payload(a: PendingAction): string {
    const body: ActionBody = { meetingId: a.meetingId, tool: a.tool, proposedArgs: a.proposedArgs, args: a.args, evidence: a.evidence };
    return this.s.json("agent_actions", "payload_enc", a.id, body);
  }

  async save(a: PendingAction): Promise<void> {
    if (!isUuid(a.id)) return;
    await this.db.update(this.db.query("agent_actions").eq("id", a.id), {
      status: a.status,
      payload_enc: this.payload(a),
      outcome_enc: a.outcome === undefined ? null : this.s.json("agent_actions", "outcome_enc", a.id, a.outcome),
      decided_at: a.decidedAt === undefined ? null : iso(a.decidedAt),
    });
  }

  async removeMeeting(meetingId: string): Promise<number> {
    const ids = (await this.list()).filter((a) => a.meetingId === meetingId).map((a) => a.id);
    if (ids.length === 0) return 0;
    return (await this.db.remove(this.db.query("agent_actions").in("id", ids))).length;
  }

  async removeAll(): Promise<void> {
    await this.db.remove(this.db.query("agent_actions"));
  }
}

export class SupabaseTraces implements Traces {
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly index: MeetingIndex;

  constructor(db: Db, sealer: Sealer, index: MeetingIndex) {
    this.db = db;
    this.s = sealer;
    this.index = index;
  }

  async append(meetingId: string, entries: TraceEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const meetingUuid = await this.index.uuidOf(meetingId);
    if (!meetingUuid) return;
    await this.db.insert("agent_traces", entries.map((e) => {
      const id = randomUUID();
      return { id, meeting_id: meetingUuid, body_enc: this.s.json("agent_traces", "body_enc", id, e), created_at: iso(e.at) };
    }));
  }

  appendRun(meetingId: string, steps: TraceStep[], at: number): Promise<void> {
    return this.append(meetingId, steps.map((s) => ({ ...s, at })));
  }

  async read(meetingId: string): Promise<TraceEntry[]> {
    const meetingUuid = await this.index.uuidOf(meetingId);
    if (!meetingUuid) return [];
    const rows = await this.db.select<Row>(this.db.query("agent_traces").eq("meeting_id", meetingUuid).order("created_at"), "id,body_enc");
    return rows.map((r) => this.s.openJson<TraceEntry>("agent_traces", "body_enc", String(r.id), r.body_enc));
  }

  async delete(meetingId: string): Promise<void> {
    const meetingUuid = await this.index.uuidOf(meetingId);
    if (meetingUuid) await this.db.remove(this.db.query("agent_traces").eq("meeting_id", meetingUuid));
  }

  async deleteAll(): Promise<void> {
    await this.db.remove(this.db.query("agent_traces"));
  }
}

// In memory, written behind --------------------------------------------------------------------------

/** Writes that run after a synchronous setter; `flush()` waits for them (runtime eviction, tests). */
class WriteBehind {
  private chain: Promise<void> = Promise.resolve();
  private failure: Error | undefined;

  push(write: () => Promise<unknown>): void {
    this.chain = this.chain.then(() => write()).then(
      () => undefined,
      (error: Error) => {
        this.failure = error;
        console.error(`[store] a write did not reach the database: ${error.message}`);
      },
    );
  }

  async flush(): Promise<void> {
    await this.chain;
    const failure = this.failure;
    this.failure = undefined;
    if (failure) throw failure;
  }
}

export class SupabaseProfile implements Profile {
  names: string[] = [];
  everyQuestion = false;
  assistMode: AssistMode = "assist";
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly writes = new WriteBehind();

  private constructor(db: Db, sealer: Sealer) {
    this.db = db;
    this.s = sealer;
  }

  static async open(db: Db, sealer: Sealer): Promise<SupabaseProfile> {
    const profile = new SupabaseProfile(db, sealer);
    const [row] = await db.select<Row>(db.query("accounts").limit(1), "display_name_enc,assist_mode");
    if (row) {
      profile.assistMode = row.assist_mode === "record" ? "record" : "assist";
      if (row.display_name_enc != null) {
        const saved = sealer.openJson<{ names: string[]; everyQuestion: boolean }>("accounts", "display_name_enc", sealer.userId, row.display_name_enc);
        profile.names = saved.names;
        profile.everyQuestion = saved.everyQuestion;
      }
    }
    return profile;
  }

  private save(): void {
    const values = { display_name_enc: this.s.json("accounts", "display_name_enc", this.s.userId, { names: this.names, everyQuestion: this.everyQuestion }), assist_mode: this.assistMode };
    this.writes.push(() => this.db.update(this.db.query("accounts"), values));
  }

  setNames(input: string): string[] {
    this.names = parseNames(input);
    this.save();
    return this.names;
  }

  setEveryQuestion(on: boolean): void {
    this.everyQuestion = on;
    this.save();
  }

  setAssistMode(mode: AssistMode): void {
    this.assistMode = mode;
    this.save();
  }

  flush(): Promise<void> {
    return this.writes.flush();
  }
}

export class SupabaseLanguage implements Language {
  glossary: GlossaryEntry[] = [];
  private rowId: string;
  private readonly db: Db;
  private readonly s: Sealer;
  private readonly writes = new WriteBehind();

  private constructor(db: Db, sealer: Sealer, rowId: string) {
    this.db = db;
    this.s = sealer;
    this.rowId = rowId;
  }

  static async open(db: Db, sealer: Sealer): Promise<SupabaseLanguage> {
    const [row] = await db.select<Row>(db.query("glossary").order("created_at", "desc").limit(1), "id,body_enc");
    const language = new SupabaseLanguage(db, sealer, row ? String(row.id) : randomUUID());
    if (row) language.glossary = sealer.openJson<GlossaryEntry[]>("glossary", "body_enc", String(row.id), row.body_enc);
    return language;
  }

  set(glossary: GlossaryEntry[]): void {
    this.glossary = glossary;
    const row = { id: this.rowId, body_enc: this.s.json("glossary", "body_enc", this.rowId, glossary), created_at: iso(Date.now()) };
    this.writes.push(() => this.db.insert("glossary", [row], { upsertOn: "id" }));
  }

  flush(): Promise<void> {
    return this.writes.flush();
  }
}

// Numbers, devices, accounts, canaries ---------------------------------------------------------------

const TRANSCRIPTION = "transcription";

export class SupabaseUsage implements UsageStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async load(now = Date.now()): Promise<Partial<UsageSnapshot> | undefined> {
    const day = dayKey(now);
    const rows = await this.db.select<Row>(this.db.query("usage_daily").eq("day", day));
    if (rows.length === 0) return undefined;
    const snapshot: UsageSnapshot = { day, audioSeconds: 0, models: {} };
    for (const r of rows) {
      if (r.model === TRANSCRIPTION) snapshot.audioSeconds = Number(r.audio_seconds);
      else snapshot.models[String(r.model)] = { calls: Number(r.calls ?? 0), input: Number(r.input_tokens), cached: Number(r.cached_tokens ?? 0), output: Number(r.output_tokens) };
    }
    return snapshot;
  }

  async save(snapshot: UsageSnapshot): Promise<void> {
    const rows: Row[] = [{ day: snapshot.day, provider: "meta", model: TRANSCRIPTION, calls: 0, input_tokens: 0, cached_tokens: 0, output_tokens: 0, audio_seconds: snapshot.audioSeconds, cost_micro_usd: 0 }];
    for (const [model, t] of Object.entries(snapshot.models)) {
      const usd = priceTokens(model, t);
      rows.push({ day: snapshot.day, provider: model.includes("open") ? "baseten" : "meta", model, calls: t.calls, input_tokens: t.input, cached_tokens: t.cached, output_tokens: t.output, audio_seconds: 0, cost_micro_usd: usd === undefined ? 0 : Math.round(usd * 1e6) });
    }
    await this.db.insert("usage_daily", rows, { upsertOn: "user_id,day,provider,model" });
  }
}

export class SupabaseDevices implements DeviceStore {
  private readonly rest: SupabaseRest;

  constructor(rest: SupabaseRest) {
    this.rest = rest;
  }

  private static record(r: Row): DeviceRecord {
    const device: DeviceRecord = { id: String(r.id), userId: String(r.user_id), kind: r.kind as DeviceRecord["kind"], label: String(r.label), tokenHash: fromBytea(r.token_hash).toString("hex"), createdAt: msOf(r.created_at) };
    const seen = msOrUndefined(r.last_seen_at);
    const revoked = msOrUndefined(r.revoked_at);
    if (seen !== undefined) device.lastSeenAt = seen;
    if (revoked !== undefined) device.revokedAt = revoked;
    return device;
  }

  async insert(d: DeviceRecord): Promise<void> {
    await this.rest.forUser(d.userId).insert("devices", [{ id: d.id, kind: d.kind, label: d.label, token_hash: toBytea(Buffer.from(d.tokenHash, "hex")), created_at: iso(d.createdAt) }]);
  }

  async listFor(userId: string): Promise<DeviceRecord[]> {
    const db = this.rest.forUser(userId);
    return (await db.select<Row>(db.query("devices").order("created_at", "desc"))).map(SupabaseDevices.record);
  }

  async byTokenHash(tokenHash: string): Promise<DeviceRecord | undefined> {
    const [row] = await this.rest.system.deviceByTokenHash(Buffer.from(tokenHash, "hex"));
    return row && SupabaseDevices.record(row);
  }

  async revoke(userId: string, id: string, at: number): Promise<boolean> {
    if (!isUuid(id)) return false;
    const db = this.rest.forUser(userId);
    return (await db.update(db.query("devices").eq("id", id).eq("revoked_at", null), { revoked_at: iso(at) })).length > 0;
  }

  async touch(userId: string, id: string, at: number): Promise<void> {
    const db = this.rest.forUser(userId);
    await db.update(db.query("devices").eq("id", id), { last_seen_at: iso(at) });
  }
}

export class SupabaseAccounts implements AccountStore {
  private readonly rest: SupabaseRest;

  constructor(rest: SupabaseRest) {
    this.rest = rest;
  }

  async get(userId: string): Promise<AccountRecord | undefined> {
    const db = this.rest.forUser(userId);
    const [account] = await db.select<Row>(db.query("accounts").limit(1), "user_id,locale,created_at");
    if (!account) return undefined;
    const [key] = await db.select<Row>(db.query("user_keys").limit(1), "kek_version,wrapped_dek");
    if (!key) throw new Error(`account ${userId} has no data key row`);
    return { userId, createdAt: msOf(account.created_at), locale: String(account.locale), kekVersion: Number(key.kek_version), wrappedDek: fromBytea(key.wrapped_dek).toString("base64") };
  }

  /** The key row first: an account row without its key would be unreadable. Atomic through RPC in 4.4. */
  async create(a: AccountRecord): Promise<void> {
    const db = this.rest.forUser(a.userId);
    await db.insert("user_keys", [{ kek_version: a.kekVersion, wrapped_dek: toBytea(Buffer.from(a.wrappedDek, "base64")), created_at: iso(a.createdAt) }]);
    await db.insert("accounts", [{ locale: a.locale, created_at: iso(a.createdAt) }]);
  }
}

export function supabaseCanaries(rest: SupabaseRest): CanaryStore {
  return {
    read: async (version) => {
      const [row] = await rest.system.canary(version);
      return row ? fromBytea(row.sealed) : undefined;
    },
    write: async (version, sealed) => {
      await rest.system.putCanary(version, sealed);
    },
  };
}

/** Every store for one user, opened with their data key. */
export async function openUserStores(rest: SupabaseRest, userId: string, dek: Buffer, now = Date.now()) {
  const db = rest.forUser(userId);
  const sealer = new Sealer(userId, dek);
  const index = new MeetingIndex(db);
  const [day, profile, language] = await Promise.all([SupabaseDayRecord.open(db, sealer, now), SupabaseProfile.open(db, sealer), SupabaseLanguage.open(db, sealer)]);
  return {
    meetings: new SupabaseMeetings(db, sealer, index),
    day,
    facts: new SupabaseFacts(db, sealer, index),
    tasks: new SupabaseTasks(db, sealer, index),
    actions: new SupabaseActions(db, sealer, index),
    traces: new SupabaseTraces(db, sealer, index),
    profile,
    language,
    usage: new SupabaseUsage(db),
    /** Waits for the written-behind settings (eviction flushes before dropping the key). */
    flush: async () => {
      await Promise.all([profile.flush(), language.flush()]);
    },
  };
}
