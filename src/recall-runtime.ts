// The fast path inside a wearer's runtime (add-memory-engine 3.4): the memory index kept in step with
// the records the runtime already holds decrypted, and one answer per question streamed from a single
// model call. The hub marks what changed (a meeting, a day, the kept facts); the index catches up
// before each question and every few seconds. The records, the clock and the model call come in, so
// this runs the same on the laptop, on a sealed runtime and in the bench.

import type { AskMessage, AskSource } from "./ask.ts";
import type { ChatMessage } from "./chat.ts";
import type { DayEntry } from "./day-log.ts";
import type { Digest } from "./digests.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting } from "./meetings.ts";
import { MemoryIndex, type MemoryUnit } from "./memory-index.ts";
import { localDay } from "./nightly.ts";
import { RECALL_MAX_TOKENS, RECALL_TEXT_CHARS, RECALL_VOICE_CHARS, VOICE_LINES, looksLikeCommand, voiceAttachment, type RecallEvent, type RecallResult, RecallStream, dayUnits, digestUnit, factUnit, meetingUnits, memoryPrefix, notesText, parseQuestion, recallMessages, retrieve, sourceOf } from "./recall.ts";

/** Days of what was heard and seen that the index loads when the runtime opens: the hot window (decision 3). */
export const HOT_DAYS = 92;
/** Newest meetings whose notes make the memory prefix when there are no digests (laptop) or in a project. */
const PREFIX_MEETINGS = 5;
const PREFIX_DAY_DIGESTS = 7;
const PREFIX_WEEK_DIGESTS = 4;

type Awaitable<T> = T | Promise<T>;

export interface RecallRecords {
  meetings(): Meeting[];
  assignments(): Awaitable<ReadonlyMap<string, string>>;
  /** Today's entries as the live loop holds them. */
  today(): DayEntry[];
  /** The last `days` days of entries (at open). */
  recent(days: number): Awaitable<DayEntry[]>;
  keptFacts(): Fact[];
  /** Accounts: the profile and the newest day and week digests, for the whole memory's prefix. */
  digests?(): Promise<{ profile?: Digest; days: Digest[]; weeks: Digest[] }>;
}

/** A diarization label ("A", "B") or a placeholder is not a person. */
const isName = (s: string | undefined): s is string => Boolean(s && s.length >= 3 && !/^(?:alguien|tú|tu|you|speaker \w+)$/i.test(s));

export class RecallRuntime {
  readonly index = new MemoryIndex();
  /** Names seen as speakers or owners, for parsing questions. */
  readonly people = new Set<string>();
  readonly ready: Promise<void>;
  private readonly records: RecallRecords;
  private readonly timeZone: string;
  private readonly now: () => number;
  private readonly dirtyMeetings = new Set<string>();
  private readonly dirtyDays = new Set<string>();
  private factsDirty = false;
  private projects = new Map<string, string>();
  /** What each indexed meeting looked like, today's entry count and the kept facts, to find changes. */
  private readonly meetingSigs = new Map<string, string>();
  private todaySig = "";
  private factsSig = "";

  constructor(records: RecallRecords, timeZone: string, now: () => number = Date.now) {
    this.records = records;
    this.timeZone = timeZone;
    this.now = now;
    this.ready = this.build();
  }

  private async build(): Promise<void> {
    this.projects = new Map(await this.records.assignments());
    for (const m of this.records.meetings()) this.indexMeeting(m);
    const byDay = new Map<string, DayEntry[]>();
    for (const e of await this.records.recent(HOT_DAYS)) {
      const d = localDay(e.at, this.timeZone);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    for (const [d, entries] of byDay) this.indexDay(d, entries);
    this.indexFacts();
    this.todaySig = `${localDay(this.now(), this.timeZone)}:${this.records.today().length}:`;
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
   * Brings the index up to what changed: meetings whose turns, notes, title or project differ from what
   * was indexed (or that are gone), today's new entries, the kept facts, and anything marked.
   */
  async flush(): Promise<void> {
    await this.ready;
    this.projects = new Map(await this.records.assignments());
    const meetings = new Map(this.records.meetings().map((m) => [m.id, m]));
    for (const [id, m] of meetings) if (this.meetingSigs.get(id) !== this.sigOf(m)) this.dirtyMeetings.add(id);
    for (const id of this.meetingSigs.keys()) if (!meetings.has(id)) this.dirtyMeetings.add(id);
    for (const id of this.dirtyMeetings) {
      this.index.removeWhere((u) => u.id === id || u.id.startsWith(`s${id}:`));
      this.meetingSigs.delete(id);
      const m = meetings.get(id);
      if (m) this.indexMeeting(m);
    }
    const today = localDay(this.now(), this.timeZone);
    const todayEntries = this.records.today();
    const todaySig = `${today}:${todayEntries.length}:${this.dirtyMeetings.size ? "m" : ""}`;
    // A meeting that changed can move today's entries in or out of its span.
    if (todaySig !== this.todaySig || this.dirtyMeetings.size) this.dirtyDays.add(today);
    this.todaySig = todaySig;
    this.dirtyMeetings.clear();
    for (const d of this.dirtyDays) {
      // Only today's entries are in memory; an older day is re-read when it is marked (a forgotten day).
      const entries = d === today ? todayEntries : (await this.records.recent(HOT_DAYS)).filter((e) => localDay(e.at, this.timeZone) === d);
      this.indexDay(d, entries);
    }
    this.dirtyDays.clear();
    const kept = this.records.keptFacts();
    const factsSig = kept.map((f) => `${f.id}@${this.projects.get(f.meetingId) ?? ""}`).join(",");
    if (this.factsDirty || factsSig !== this.factsSig) this.indexFacts();
    this.factsSig = factsSig;
    this.factsDirty = false;
  }

  private sigOf(m: Meeting): string {
    return `${m.turns.length}|${m.title}|${m.endedAt ?? ""}|${m.notes ? notesText(m).length : ""}|${this.projects.get(m.id) ?? ""}`;
  }

  private indexMeeting(m: Meeting): void {
    for (const u of meetingUnits(m, this.projects.get(m.id))) this.index.add(u);
    this.meetingSigs.set(m.id, this.sigOf(m));
    for (const t of m.turns) if (isName(t.speaker)) this.people.add(t.speaker);
    for (const c of m.notes?.commitments ?? []) if (c.owner !== "you" && isName(c.owner)) this.people.add(c.owner);
  }

  private indexDay(day: string, entries: readonly DayEntry[]): void {
    this.index.removeWhere((u) => u.id.startsWith(`s${day}:`) || u.id.startsWith(`d${day}:`));
    const spans = this.records.meetings().map((m) => ({ startedAt: m.startedAt, ...(m.endedAt ? { endedAt: m.endedAt } : {}), ...(this.projects.get(m.id) ? { projectId: this.projects.get(m.id) } : {}) }));
    for (const u of dayUnits(day, entries, spans, this.now())) this.index.add(u);
  }

  private indexFacts(): void {
    this.index.removeWhere((u) => u.kind === "fact");
    for (const f of this.records.keptFacts()) this.index.add(factUnit(f, this.projects.get(f.meetingId)));
  }

  /** The memory prefix: digests for the whole memory (accounts), else the newest meetings' notes and the kept facts; in a project only its own. */
  async prefix(projectId: string | undefined): Promise<MemoryUnit[]> {
    const inScope = (m: Meeting) => projectId === undefined || this.projects.get(m.id) === projectId;
    const notes = this.records.meetings().filter((m) => inScope(m) && m.notes && notesText(m)).sort((a, b) => b.startedAt - a.startedAt).slice(0, PREFIX_MEETINGS);
    const noteUnits = notes.map((m) => meetingUnits(m, this.projects.get(m.id))[0]!).filter((u) => u.kind === "notes");
    const facts = this.records.keptFacts().filter((f) => projectId === undefined || this.projects.get(f.meetingId) === projectId).map((f) => factUnit(f, this.projects.get(f.meetingId)));
    if (projectId === undefined && this.records.digests) {
      const d = await this.records.digests();
      const digests = [...(d.profile ? [d.profile] : []), ...d.weeks.slice(0, PREFIX_WEEK_DIGESTS).reverse(), ...d.days.slice(0, PREFIX_DAY_DIGESTS).reverse()].map(digestUnit);
      if (digests.length) return [...digests, ...facts];
    }
    return [...facts, ...noteUnits.reverse()];
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
  const r = retrieve(input.runtime.index, parsed, { ...(input.projectId ? { projectId: input.projectId } : {}), now: input.now, budget: RECALL_VOICE_CHARS });
  const lines = r.lines.slice(0, VOICE_LINES);
  const att = voiceAttachment(lines, input.timeZone);
  return { attach: r.confident && !looksLikeCommand(input.text) && lines.length > 0, lines, ...att, ms: r.ms };
}
