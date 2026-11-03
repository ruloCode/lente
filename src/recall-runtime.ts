// The fast path inside a wearer's runtime (add-memory-engine 3.4, 7.2): the memory index kept in step
// with the records the runtime already holds decrypted, and one answer per question streamed from a
// single model call. When the runtime opens, the hot months (this one and the two before) come from
// their snapshots, and only what changed since is replayed: meetings whose change signature differs,
// and the day record from the day the snapshot was built through. Older months load when a question
// names a time in them, three at most. Dirty shards are written back every few minutes and when the
// runtime is evicted. The records, the clock, the snapshot store and the model call come in, so this
// runs the same on the laptop, on a sealed runtime and in the bench.

import type { AskMessage, AskSource } from "./ask.ts";
import type { ChatMessage } from "./chat.ts";
import { cardUnits } from "./cards.ts";
import type { DayEntry } from "./day-log.ts";
import { type Digest, personKey } from "./digests.ts";
import type { Fact } from "./fact-store.ts";
import { SNAPSHOT_FORMAT, decodeShard, encodeShard } from "./index-snapshot.ts";
import type { Meeting } from "./meetings.ts";
import { MemoryIndex, type MemoryUnit, isMonthShard, shardOf } from "./memory-index.ts";
import { localDay, localDayStart } from "./nightly.ts";
import { RECALL_MAX_TOKENS, RECALL_TEXT_CHARS, RECALL_VOICE_CHARS, VOICE_LINES, looksLikeCommand, voiceAttachment, type RecallEvent, type RecallResult, RecallStream, dayUnits, digestUnit, factUnit, meetingUnits, memoryPrefix, notesText, parseQuestion, recallMessages, retrieve, sourceOf } from "./recall.ts";
import type { SnapshotStore } from "./stores.ts";

/** Days of what was heard and seen an older day is re-read from (a forgotten day). */
export const HOT_DAYS = 92;
/** Months kept in memory while the runtime lives: this one and the two before (decision 3). */
export const HOT_MONTHS = 3;
/** Older months loaded for a question, least recently used dropped first. */
export const COLD_SHARDS = 3;
/** Facts, digests, briefs and people cards: few, rebuilt at open, never in a snapshot. */
export const PINNED_SHARD = "pinned";
/** Newest meetings whose notes make the memory prefix when there are no digests (laptop) or in a project. */
const PREFIX_MEETINGS = 5;
const PREFIX_DAY_DIGESTS = 7;
const PREFIX_WEEK_DIGESTS = 4;
const PREFIX_PEOPLE = 12;

type Awaitable<T> = T | Promise<T>;

export interface RecallRecords {
  meetings(): Meeting[];
  assignments(): Awaitable<ReadonlyMap<string, string>>;
  /** Today's entries as the live loop holds them. */
  today(): DayEntry[];
  /** The last `days` days of entries. */
  recent(days: number): Awaitable<DayEntry[]>;
  /** Entries in [from, to), read by time (the sealed store's plain column); falls back to `recent`. */
  between?(from: number, to: number): Awaitable<DayEntry[]>;
  keptFacts(): Fact[];
  /** Accounts: the profile and the newest day and week digests, for the whole memory's prefix. */
  digests?(): Promise<{ profile?: Digest; days: Digest[]; weeks: Digest[] }>;
  /** Project briefs and people cards (add-memory-engine 6.5). */
  memoryDigests?(): Promise<{ briefs: Digest[]; people: Digest[] }>;
}

export interface RecallOptions {
  snapshots?: SnapshotStore;
  /** The encoder's id the shards are built with; `lexical` while there are no vectors. */
  encoder?: string;
  log?: (line: string) => void;
}

/** A diarization label ("A", "B") or a placeholder is not a person. */
export const isName = (s: string | undefined): s is string => Boolean(s && s.length >= 3 && !/^(?:alguien|tú|tu|you|speaker \w+)$/i.test(s));

/** `YYYY-MM` of `at` and of the months before it. */
const monthsBack = (at: number, n: number): string[] => Array.from({ length: n }, (_, i) => {
  const d = new Date(at);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});
const monthStart = (key: string): number => Date.parse(`${key}-01T00:00:00Z`);
const nextMonth = (key: string): number => {
  const d = new Date(`${key}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
};

export class RecallRuntime {
  readonly index = new MemoryIndex();
  /** Names seen as speakers or owners, for parsing questions. */
  readonly people = new Set<string>();
  readonly ready: Promise<void>;
  /** How the runtime opened: shards from snapshots, shards rebuilt, meetings and days replayed. */
  readonly opened = { fromSnapshot: 0, rebuilt: 0, meetingsReplayed: 0, daysReplayed: 0 };
  private readonly records: RecallRecords;
  private readonly timeZone: string;
  private readonly now: () => number;
  private readonly opts: RecallOptions;
  private readonly encoder: string;
  private readonly dirtyMeetings = new Set<string>();
  private readonly dirtyDays = new Set<string>();
  private factsDirty = false;
  private projects = new Map<string, string>();
  /** What each indexed meeting looked like, today's entry count and the kept facts, to find changes. */
  private readonly meetingSigs = new Map<string, string>();
  private todaySig = "";
  private factsSig = "";
  private digestsSig = "";
  private hot = new Set<string>();
  /** Older months in memory, least recently used first. */
  private cold: string[] = [];

  constructor(records: RecallRecords, timeZone: string, now: () => number = Date.now, opts: RecallOptions = {}) {
    this.records = records;
    this.timeZone = timeZone;
    this.now = now;
    this.opts = opts;
    this.encoder = opts.encoder ?? "lexical";
    this.ready = this.build();
  }

  /** The months whose meetings and days are indexed now. */
  private loadedMonth(key: string): boolean {
    return this.hot.has(key) || this.cold.includes(key);
  }

  private async build(): Promise<void> {
    this.projects = new Map(await this.records.assignments());
    this.hot = new Set(monthsBack(this.now(), HOT_MONTHS));
    const builtThrough = new Map<string, number>();
    for (const key of this.hot) {
      const at = await this.loadSnapshot(key);
      if (at !== undefined) builtThrough.set(key, at);
    }
    for (const m of this.records.meetings()) {
      if (!this.hot.has(shardOf(m.startedAt)) || this.meetingSigs.get(m.id) === this.sigOf(m)) continue;
      this.reindexMeeting(m);
      this.opened.meetingsReplayed++;
    }
    // The day record from the earliest point a hot month is missing: its start, or the day its snapshot was built through.
    const from = Math.min(...[...this.hot].map((k) => builtThrough.get(k) ?? monthStart(k)));
    await this.replayDays(localDayStart(localDay(from, this.timeZone), this.timeZone), this.now() + 1);
    this.indexFacts();
    await this.indexDigests();
    this.todaySig = `${localDay(this.now(), this.timeZone)}:${this.records.today().length}:`;
  }

  /** A month from its snapshot when there is a whole, current one; returns when it was built through. */
  private async loadSnapshot(key: string): Promise<number | undefined> {
    const rec = await Promise.resolve(this.opts.snapshots?.get(key)).catch((error: Error) => (this.opts.log?.(`[recall] snapshot ${key} unreadable: ${error.message.slice(0, 120)}`), undefined));
    if (!rec) return this.rebuilt(key);
    if (rec.formatVersion !== SNAPSHOT_FORMAT || rec.encoder !== this.encoder) return this.rebuilt(key, `format ${rec.formatVersion}, encoder ${rec.encoder}`);
    try {
      const { shard, meta } = decodeShard(rec.bytes);
      shard.dirty = false;
      this.index.shards.set(key, shard);
      for (const [id, sig] of shard.sources) this.meetingSigs.set(id, sig);
      this.opened.fromSnapshot++;
      return meta.builtThrough;
    } catch (error) {
      return this.rebuilt(key, (error as Error).message);
    }
  }

  private rebuilt(key: string, why?: string): undefined {
    this.opened.rebuilt++;
    if (why) this.opts.log?.(`[recall] rebuilding ${key} from its records (${why.slice(0, 120)})`);
    return undefined;
  }

  private async replayDays(from: number, to: number): Promise<void> {
    const entries = this.records.between ? await this.records.between(from, to) : (await this.records.recent(HOT_DAYS)).filter((e) => e.at >= from && e.at < to);
    const byDay = new Map<string, DayEntry[]>();
    for (const e of entries) {
      const d = localDay(e.at, this.timeZone);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    for (const [d, list] of byDay) this.indexDay(d, list);
    this.opened.daysReplayed += byDay.size;
  }

  markMeeting(id: string): void {
    this.dirtyMeetings.add(id);
  }
  markDay(at: number): void {
    this.dirtyDays.add(localDay(at, this.timeZone));
  }
  markFacts(): void {
    this.factsDirty = true;
  }

  /**
   * Brings the index up to what changed: meetings in loaded months whose turns, notes, title, project or
   * cards differ from what was indexed (or that are gone), today's new entries, the kept facts, the
   * digests, and anything marked.
   */
  async flush(): Promise<void> {
    await this.ready;
    this.projects = new Map(await this.records.assignments());
    const meetings = new Map(this.records.meetings().map((m) => [m.id, m]));
    for (const [id, m] of meetings) if (this.loadedMonth(shardOf(m.startedAt)) && this.meetingSigs.get(id) !== this.sigOf(m)) this.dirtyMeetings.add(id);
    for (const id of this.meetingSigs.keys()) if (!meetings.has(id)) this.dirtyMeetings.add(id);
    const changed = this.dirtyMeetings.size > 0;
    for (const id of this.dirtyMeetings) {
      const m = meetings.get(id);
      if (m) this.reindexMeeting(m);
      else this.forgetMeeting(id);
    }
    this.dirtyMeetings.clear();
    const today = localDay(this.now(), this.timeZone);
    const todayEntries = this.records.today();
    const todaySig = `${today}:${todayEntries.length}:`;
    // A meeting that changed can move today's entries in or out of its span.
    if (todaySig !== this.todaySig || changed) this.dirtyDays.add(today);
    this.todaySig = todaySig;
    for (const d of this.dirtyDays) {
      // Only today's entries are in memory; an older day is re-read when it is marked (a forgotten day).
      const entries = d === today ? todayEntries : (await this.records.recent(HOT_DAYS)).filter((e) => localDay(e.at, this.timeZone) === d);
      this.indexDay(d, entries);
    }
    this.dirtyDays.clear();
    if (this.factsDirty || this.factsSigOf(this.records.keptFacts()) !== this.factsSig) this.indexFacts();
    this.factsDirty = false;
    await this.indexDigests();
  }

  /**
   * Forgetting (task 7.3): a day's speech and moments, and the given meetings with their segments and
   * cards, leave the index, and the months that changed are written again at once so no snapshot keeps
   * them. The meetings' records, facts and the day record are removed by the caller. Returns the
   * projects and people whose briefs and cards must be rewritten from what is left.
   */
  async forget(what: { day?: string; meetings?: readonly Meeting[] }): Promise<{ projects: string[]; people: string[] }> {
    await this.ready;
    const projects = new Set<string>();
    const people = new Set<string>();
    if (what.day) this.index.removeWhere((u) => u.id.startsWith(`s${what.day}:`) || u.id.startsWith(`d${what.day}:`));
    for (const m of what.meetings ?? []) {
      const p = this.projects.get(m.id);
      if (p) projects.add(p);
      for (const n of [...m.turns.map((t) => t.speaker), ...(m.cards ?? []).flatMap((c) => c.people.map((x) => x.name))]) if (isName(n)) people.add(n);
      this.forgetMeeting(m.id);
    }
    await this.persist();
    return { projects: [...projects], people: [...people] };
  }

  /** Loads the older months a time range needs (from their snapshots, or rebuilt), keeping at most `COLD_SHARDS`. */
  async ensureRange(from: number, to: number): Promise<void> {
    await this.ready;
    for (const key of monthsBack(to - 1, 120).filter((k) => nextMonth(k) > from).reverse()) {
      if (this.hot.has(key)) continue;
      if (this.cold.includes(key)) {
        this.cold = [...this.cold.filter((k) => k !== key), key];
        continue;
      }
      const builtThrough = await this.loadSnapshot(key);
      this.cold.push(key);
      for (const m of this.records.meetings()) if (shardOf(m.startedAt) === key && (builtThrough === undefined || this.meetingSigs.get(m.id) !== this.sigOf(m))) this.reindexMeeting(m);
      if (builtThrough === undefined) await this.replayDays(monthStart(key), nextMonth(key));
      while (this.cold.length > COLD_SHARDS) await this.dropCold(this.cold.shift()!);
    }
  }

  private async dropCold(key: string): Promise<void> {
    const shard = this.index.shards.get(key);
    if (shard?.dirty) await this.persistShard(key);
    this.index.shards.delete(key);
    for (const m of this.records.meetings()) if (shardOf(m.startedAt) === key) this.meetingSigs.delete(m.id);
  }

  /** Writes every month shard that changed since its last snapshot; returns how many. */
  async persist(): Promise<number> {
    if (!this.opts.snapshots) return 0;
    let written = 0;
    for (const [key, shard] of this.index.shards) {
      if (!isMonthShard(key) || !shard.dirty) continue;
      await this.persistShard(key);
      written++;
    }
    return written;
  }

  private async persistShard(key: string): Promise<void> {
    const shard = this.index.shards.get(key);
    if (!shard || !this.opts.snapshots) return;
    const builtThrough = this.now();
    await this.opts.snapshots.put({ shard: key, formatVersion: SNAPSHOT_FORMAT, encoder: this.encoder, builtThrough, bytes: encodeShard(shard, { encoder: this.encoder, builtThrough }) });
    shard.dirty = false;
  }

  private sigOf(m: Meeting): string {
    const cards = (m.cards ?? []).map((c) => c.facts.map((f) => `${f.id}${f.validTo ?? ""}`).join(",")).join(";");
    return `${m.turns.length}|${m.title}|${m.endedAt ?? ""}|${m.notes ? notesText(m).length : ""}|${this.projects.get(m.id) ?? ""}|${cards}`;
  }

  private forgetMeeting(id: string): void {
    this.index.removeWhere((u) => u.id === id || u.id.startsWith(`s${id}:`) || u.id.startsWith(`c${id}:`));
    this.meetingSigs.delete(id);
    for (const s of this.index.shards.values()) if (s.sources.delete(id)) s.dirty = true;
  }

  private reindexMeeting(m: Meeting): void {
    this.forgetMeeting(m.id);
    for (const u of [...meetingUnits(m, this.projects.get(m.id)), ...cardUnits(m, this.projects.get(m.id))]) this.index.add(u);
    const sig = this.sigOf(m);
    this.meetingSigs.set(m.id, sig);
    this.index.shard(shardOf(m.startedAt)).sources.set(m.id, sig);
    for (const c of m.cards ?? []) for (const p of c.people) if (isName(p.name)) this.people.add(p.name);
    for (const t of m.turns) if (isName(t.speaker)) this.people.add(t.speaker);
    for (const c of m.notes?.commitments ?? []) if (c.owner !== "you" && isName(c.owner)) this.people.add(c.owner);
  }

  private indexDay(day: string, entries: readonly DayEntry[]): void {
    this.index.removeWhere((u) => u.id.startsWith(`s${day}:`) || u.id.startsWith(`d${day}:`));
    const spans = this.records.meetings().map((m) => ({ startedAt: m.startedAt, ...(m.endedAt ? { endedAt: m.endedAt } : {}), ...(this.projects.get(m.id) ? { projectId: this.projects.get(m.id) } : {}) }));
    for (const u of dayUnits(day, entries, spans, this.now())) this.index.add(u);
  }

  private factsSigOf(kept: readonly Fact[]): string {
    return kept.map((f) => `${f.id}@${this.projects.get(f.meetingId) ?? ""}`).join(",");
  }

  private indexFacts(): void {
    const kept = this.records.keptFacts();
    this.index.removeWhere((u) => u.kind === "fact");
    for (const f of kept) this.index.add(factUnit(f, this.projects.get(f.meetingId)), undefined, PINNED_SHARD);
    this.factsSig = this.factsSigOf(kept);
  }

  /** Briefs and people cards as units, re-read when one was rewritten. */
  private async indexDigests(): Promise<void> {
    if (!this.records.memoryDigests) return;
    const { briefs, people } = await this.records.memoryDigests();
    const sig = [...briefs, ...people].map((d) => `${d.scope}:${d.periodStart}@${d.createdAt}`).join(",");
    if (sig === this.digestsSig) return;
    this.digestsSig = sig;
    this.index.removeWhere((u) => u.id.startsWith("brief:") || u.id.startsWith("person:"));
    for (const d of [...briefs, ...people]) this.index.add(digestUnit(d), undefined, PINNED_SHARD);
  }

  /** The memory prefix: digests for the whole memory (accounts), else the newest meetings' notes and the kept facts; in a project only its own. */
  async prefix(projectId: string | undefined): Promise<MemoryUnit[]> {
    const memory = this.records.memoryDigests ? await this.records.memoryDigests() : { briefs: [], people: [] };
    // People cards only for the whole memory: a card is written from all of a person's meetings, so inside
    // a project it could carry another project's facts (decision 10: scope holds in the data).
    const inProject = new Set(this.records.meetings().filter((m) => projectId === undefined || this.projects.get(m.id) === projectId).flatMap((m) => [...m.turns.map((t) => t.speaker ?? ""), ...(m.cards ?? []).flatMap((c) => c.people.map((p) => p.name))]).filter(isName).map((n) => personKey(n)));
    const people = memory.people.filter((p) => projectId === undefined && inProject.has(p.periodStart)).sort((a, b) => b.createdAt - a.createdAt).slice(0, PREFIX_PEOPLE).map(digestUnit);
    const brief = projectId ? memory.briefs.filter((b) => b.periodStart === projectId).map(digestUnit) : [];
    const inScope = (m: Meeting) => projectId === undefined || this.projects.get(m.id) === projectId;
    const notes = this.records.meetings().filter((m) => inScope(m) && m.notes && notesText(m)).sort((a, b) => b.startedAt - a.startedAt).slice(0, PREFIX_MEETINGS);
    const noteUnits = notes.map((m) => meetingUnits(m, this.projects.get(m.id))[0]!).filter((u) => u.kind === "notes");
    const facts = this.records.keptFacts().filter((f) => projectId === undefined || this.projects.get(f.meetingId) === projectId).map((f) => factUnit(f, this.projects.get(f.meetingId)));
    if (projectId === undefined && this.records.digests) {
      const d = await this.records.digests();
      const digests = [...(d.profile ? [d.profile] : []), ...d.weeks.slice(0, PREFIX_WEEK_DIGESTS).reverse(), ...d.days.slice(0, PREFIX_DAY_DIGESTS).reverse()].map(digestUnit);
      if (digests.length) return [...digests, ...people, ...facts];
    }
    return [...brief, ...people, ...facts, ...noteUnits.reverse()];
  }
}

export interface FastAnswer {
  path: "fast" | "deep";
  /** Set on the fast path. */
  result?: RecallResult;
  retrievalMs: number;
  lines: number;
}

/** The streamed model call: deltas through `onDelta`; resolves with why it stopped. */
export type RecallCall = (messages: ChatMessage[], opts: { maxTokens: number; onDelta: (delta: string) => void }) => Promise<{ finishReason?: string }>;

/**
 * One question on the fast path: parse, retrieve, and, when retrieval is confident and the question is
 * not an aggregate, one streamed answer whose text and chips go to `emit` as they arrive. Otherwise it
 * returns `deep` before any model call, and the caller runs the deep path.
 */
export async function answerRecall(input: {
  runtime: RecallRuntime;
  question: string;
  history: readonly AskMessage[];
  /** The project the question is asked in, if any. */
  projectId?: string;
  projects: readonly { id: string; name: string }[];
  now: number;
  timeZone: string;
  call: RecallCall;
  emit: (event: RecallEvent) => void;
  queryVector?: Int8Array;
}): Promise<FastAnswer> {
  const { runtime } = input;
  await runtime.flush();
  const parsed = parseQuestion(input.question, { now: input.now, timeZone: input.timeZone, people: [...runtime.people], projects: input.projects });
  const projectId = input.projectId ?? parsed.project;
  if (parsed.range) await runtime.ensureRange(parsed.range.from, parsed.range.to);
  const retrieved = retrieve(runtime.index, parsed, { ...(projectId ? { projectId } : {}), now: input.now, budget: RECALL_TEXT_CHARS, ...(input.queryVector ? { queryVector: input.queryVector } : {}) });
  if (!retrieved.confident || retrieved.aggregate) return { path: "deep", retrievalMs: retrieved.ms, lines: retrieved.lines.length };
  const prefixUnits = await runtime.prefix(input.projectId);
  const prefix = memoryPrefix(prefixUnits, input.timeZone);
  const sources = new Map<string, AskSource>();
  for (const u of [...prefixUnits.filter((u) => prefix.ids.has(u.id)), ...retrieved.lines]) sources.set(u.id, sourceOf(u, input.timeZone));
  const parser = new RecallStream(sources);
  const messages = recallMessages({ prefix: prefix.text, lines: retrieved.lines, history: input.history, question: parsed.text, now: input.now, timeZone: input.timeZone });
  const done = await input.call(messages, { maxTokens: RECALL_MAX_TOKENS, onDelta: (d) => parser.push(d).forEach(input.emit) });
  const result = parser.finish(done.finishReason === "length");
  result.events.forEach(input.emit);
  return { path: "fast", result, retrievalMs: retrieved.ms, lines: retrieved.lines.length };
}

/**
 * Memory lines for a voice turn (decision 9): retrieval on what the wearer said, with an optional time
 * phrase and person (the `ask_memory` filters). `attach` is false for commands and when retrieval is
 * not confident, so a task request never gets memory lines.
 */
export async function voiceRecall(input: {
  runtime: RecallRuntime;
  text: string;
  when?: string;
  person?: string;
  projectId?: string;
  projects: readonly { id: string; name: string }[];
  now: number;
  timeZone: string;
}): Promise<{ attach: boolean; lines: MemoryUnit[]; text: string; citable: Map<string, AskSource>; ms: number }> {
  await input.runtime.flush();
  const question = [input.text, input.when, input.person].filter(Boolean).join(" ");
  const parsed = parseQuestion(question, { now: input.now, timeZone: input.timeZone, people: [...input.runtime.people], projects: input.projects });
  if (parsed.range) await input.runtime.ensureRange(parsed.range.from, parsed.range.to);
  const r = retrieve(input.runtime.index, parsed, { ...(input.projectId ? { projectId: input.projectId } : {}), now: input.now, budget: RECALL_VOICE_CHARS });
  const lines = r.lines.slice(0, VOICE_LINES);
  const att = voiceAttachment(lines, input.timeZone);
  return { attach: r.confident && !looksLikeCommand(input.text) && lines.length > 0, lines, ...att, ms: r.ms };
}
