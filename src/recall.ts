// Fast recall (add-memory-engine decisions 1, 2 and 10): the question parsed with no model call, the
// wearer's records turned into index units, retrieval with hard filters and fusion, one prompt in
// cache order (rules, memory prefix, «RECUPERADO», history, question) and a streaming parser for the
// one answer call: a header (`@answer`, `@none`, `@command`), then text whose `[[id]]` markers become
// source events as they arrive and are never shown. Pure: the hub owns the index, the clock and the call.

import { type AskMessage, type AskSource, NOT_FOUND } from "./ask.ts";
import { JOB_AGENTS, type JobAgent } from "./agent-jobs.ts";
import type { ChatMessage } from "./chat.ts";
import { segmentTurns } from "./consolidate.ts";
import type { DayEntry } from "./day-log.ts";
import { type Digest, digestId } from "./digests.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting } from "./meetings.ts";
import { type Hit, type IndexFilter, type MemoryIndex, type MemoryUnit } from "./memory-index.ts";
import { localDay } from "./nightly.ts";
import { confident, expand, fuse } from "./recall-fusion.ts";
import { fold, terms } from "./terms.ts";
import { type TimeRange, parseTimePhrase } from "./time-phrases.ts";

/** «RECUPERADO» budgets, in characters (about 4 per token): 6,000 tokens for text, 2,500 for voice. */
export const RECALL_TEXT_CHARS = 24_000;
export const RECALL_VOICE_CHARS = 10_000;
/** The memory prefix's budget, in characters. */
export const PREFIX_CHARS = 16_000;
/** Units retrieved per list before fusion, and lines shown at most. */
const LIST_LIMIT = 40;
const MAX_LINES = 60;
export const RECALL_HISTORY = 8;
/** Output cap for the answer call; a reply cut there keeps what streamed and ends in «…». */
export const RECALL_MAX_TOKENS = 600;
const MAX_QUESTION_CHARS = 500;

const AGGREGATE = /\b(?:todo lo|todas? las?|todos los|resume|resumen|resumir|cuantas veces|cuantos|everything|summari[sz]e|summary of|how many times|all the)\b/;

export interface Person {
  /** As spoken or written: "PROBE-Ana Ruiz". */
  name: string;
}

export interface ParsedQuestion {
  text: string;
  terms: string[];
  range?: TimeRange;
  /** Folded names of known people the question names. */
  people: string[];
  /** A project the question names, by id. */
  project?: string;
  aggregate: boolean;
}

/** Name tokens that identify a person: "PROBE-Ana Ruiz" → "ana", "ruiz" (folded, 3+ letters). */
const nameTokens = (name: string): string[] => fold(name).replace(/^probe-/, "").split(/[^a-z0-9ñ]+/).filter((t) => t.length >= 3);

/** The question's terms, time range, people, project and whether it asks for a summary of many things. */
export function parseQuestion(question: string, ctx: { now: number; timeZone: string; people: readonly string[]; projects: readonly { id: string; name: string }[] }): ParsedQuestion {
  const text = question.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
  const time = parseTimePhrase(text, ctx.now, ctx.timeZone);
  const words = new Set(fold(text).split(/[^a-z0-9ñ]+/).filter(Boolean));
  const people = [...new Set(ctx.people.filter((p) => nameTokens(p).some((t) => words.has(t))).map(fold))];
  const project = ctx.projects.find((p) => nameTokens(p.name).some((t) => words.has(t)))?.id;
  return { text, terms: terms(time.rest), ...(time.range ? { range: time.range } : {}), people, ...(project ? { project } : {}), aggregate: AGGREGATE.test(fold(text)) };
}

// --- Records → units -----------------------------------------------------------------------------

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const WEARER = "Tú";

export function notesText(m: Meeting): string {
  const n = m.notes;
  const parts = n ? [n.summary, ...n.decisions.map((d) => `Decisión: ${d.text}`), ...n.commitments.map((c) => `Compromiso (${c.owner === "you" ? "el usuario" : c.owner}): ${c.what}${c.due ? ` (${c.due})` : ""}`), ...n.openQuestions.map((q) => `Pregunta abierta: ${q.text}`)] : [];
  return oneLine(parts.join(" | "));
}

/** A meeting as its notes unit and its speech segments (`s<meeting id>:<n>`). */
export function meetingUnits(m: Meeting, projectId: string | undefined): MemoryUnit[] {
  const base = { ...(projectId ? { projectId } : {}), title: m.title || "Reunión" };
  const speakers = (t: Meeting["turns"][number]) => (t.wearer ? WEARER : t.speaker ?? "alguien");
  const segments = segmentTurns(m.turns.map((t) => ({ ...t, speaker: speakers(t) }))).map((s): MemoryUnit => ({
    id: `s${m.id}:${s.n}`,
    kind: "segment",
    at: s.from,
    to: s.to,
    ...base,
    speakers: s.speakers,
    refs: `${m.id}:${s.turns[0]!.id}–${s.turns.at(-1)!.id}`,
    text: s.turns.map((t) => `${t.speaker}: ${oneLine(t.text)}`).join(" "),
  }));
  const notes = notesText(m);
  const people = [...new Set(m.turns.map(speakers))];
  return [...(notes ? [{ id: m.id, kind: "notes" as const, at: m.startedAt, ...(m.endedAt ? { to: m.endedAt } : {}), ...base, people, text: `Reunión «${base.title}»: ${notes}` }] : []), ...segments];
}

/**
 * One local day's entries outside meetings: speech as segments (`s<day>:<n>`), camera descriptions and
 * piano practice as moments (`d<day>:<n>`). A description inside a project's meeting belongs to that project.
 */
export function dayUnits(day: string, entries: readonly DayEntry[], meetings: readonly { startedAt: number; endedAt?: number; projectId?: string }[], now: number): MemoryUnit[] {
  const inMeeting = (at: number) => meetings.find((m) => at >= m.startedAt && at <= (m.endedAt ?? now));
  const heard = entries.filter((e): e is Extract<DayEntry, { kind: "turn" }> => e.kind === "turn" && Boolean(e.text.trim()) && !inMeeting(e.at));
  const segments = segmentTurns(heard.map((e, i) => ({ id: `h${i + 1}`, at: e.at, ...(e.spokeAt ? { startAt: e.spokeAt } : {}), speaker: e.speaker ?? "alguien", text: e.text }))).map((s): MemoryUnit => ({
    id: `s${day}:${s.n}`,
    kind: "segment",
    at: s.from,
    to: s.to,
    speakers: s.speakers,
    text: s.turns.map((t) => `${t.speaker}: ${oneLine(t.text)}`).join(" "),
  }));
  let seen = 0;
  const moments: MemoryUnit[] = [];
  for (const e of entries) {
    // Piano practice (add-practice-mode) shares the moments' numbering, so the runtime's `d<day>:` sweep covers it.
    if (e.kind === "practice" && e.text.trim()) {
      moments.push({ id: `d${day}:${++seen}`, kind: "practice", at: e.at, text: `Práctica: ${oneLine(e.text)}` });
      continue;
    }
    if (!((e.kind === "live" || (e.kind === "cue" && e.label === "ON SCREEN")) && e.text.trim())) continue;
    const projectId = inMeeting(e.at)?.projectId;
    moments.push({ id: `d${day}:${++seen}`, kind: "seen", at: e.at, ...(projectId ? { projectId } : {}), text: `La cámara vio: ${oneLine(e.text)}` });
  }
  return [...segments, ...moments];
}

export const factUnit = (f: Fact, projectId: string | undefined): MemoryUnit => ({ id: `F${f.id}`, kind: "fact", at: f.createdAt, ...(projectId ? { projectId } : {}), refs: `${f.meetingId}:${f.evidence[0] ?? ""}`, text: `Recuerdo confirmado: ${oneLine(f.text)}` });

/** A digest as a unit; a brief belongs to its project, and briefs and people cards date from when they were written. */
export const digestUnit = (d: Digest): MemoryUnit => ({
  id: digestId(d),
  kind: "digest",
  at: d.scope === "brief" || d.scope === "person" ? d.createdAt : Date.parse(`${d.periodStart}T12:00:00Z`),
  ...(d.scope === "brief" ? { projectId: d.periodStart } : {}),
  text: oneLine(d.text),
});

/** The chip for a unit. */
export function sourceOf(u: MemoryUnit, timeZone: string): AskSource {
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(u.at));
  const [meetingId, turns] = (u.refs ?? "").split(":");
  const turnId = turns?.split("–")[0];
  switch (u.kind) {
    case "notes":
      return { id: u.id, kind: "meeting", label: `${u.title ?? "Reunión"} · ${hhmm}`, at: u.at, meetingId: u.id };
    case "segment":
      return meetingId?.startsWith("m") ? { id: u.id, kind: "meeting", label: `${u.title ?? "Reunión"} · ${hhmm}`, at: u.at, meetingId, ...(turnId ? { turnId } : {}) } : { id: u.id, kind: "heard", label: `Lo escuchaste · ${hhmm}`, at: u.at };
    case "seen":
      return { id: u.id, kind: "seen", label: `Lo viste · ${hhmm}`, at: u.at };
    case "practice":
      return { id: u.id, kind: "heard", label: `Practicaste · ${hhmm}`, at: u.at };
    case "fact":
    case "card":
      return { id: u.id, kind: "fact", label: "Recuerdo", at: u.at, ...(meetingId ? { meetingId } : {}), ...(turnId ? { turnId } : {}) };
    case "digest":
      return { id: u.id, kind: "fact", label: u.id.startsWith("profile:") ? "Tu perfil" : u.id.startsWith("brief:") ? "Resumen del proyecto" : u.id.startsWith("person:") ? "Ficha de la persona" : `Resumen · ${u.id.split(":")[1] ?? ""}`, at: u.at };
  }
}

// --- Retrieval -----------------------------------------------------------------------------------

export interface Retrieved {
  lines: MemoryUnit[];
  /** The fast path may answer; otherwise the deep path runs. */
  confident: boolean;
  aggregate: boolean;
  /** Retrieval time, for the log and the bench. */
  ms: number;
}

/**
 * The lines for a question: hard filters (project, time range, "now" for card facts), BM25, the
 * people list and, with `queryVector`, the vector list, fused, with segment neighbours, in at most
 * `budget` characters of lines.
 */
export function retrieve(index: MemoryIndex, q: ParsedQuestion, opts: { projectId?: string; now: number; budget: number; queryVector?: Int8Array; clock?: () => number }): Retrieved {
  const clock = opts.clock ?? (() => performance.now());
  const started = clock();
  const filter: IndexFilter = {
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(q.range ? { from: q.range.from, to: q.range.to } : {}),
    // Card facts closed before now are only for questions about a past time.
    ...(q.range ? {} : { validAt: opts.now }),
  };
  const lexical = index.lexical(q.terms, filter, LIST_LIMIT);
  const vector = opts.queryVector ? index.vector(opts.queryVector, filter, LIST_LIMIT) : [];
  // The people list: units with a person the question names, ranked by the question's words when it
  // has any (so the person's relevant line, not just their newest, leads), else newest first.
  const byPerson = q.people.length && q.terms.length ? index.lexical(q.terms, { ...filter, people: q.people }, LIST_LIMIT) : index.people(q.people, filter, LIST_LIMIT);
  // A time question brings that range's notes, cards and facts (where commitments and decisions are
  // written, whatever words the question used); with no other match ("¿qué pasó ayer?"), its newest lines too.
  const byTime: Hit[] = q.range
    ? [...index.recent({ ...filter, kinds: ["notes", "card", "fact"] }, LIST_LIMIT), ...(!lexical.length && !vector.length && !byPerson.length ? index.recent(filter, LIST_LIMIT) : [])]
    : [];
  const fused = fuse(
    [
      { name: "lexical", hits: lexical },
      { name: "vector", hits: vector },
      { name: "people", hits: byPerson },
      { name: "time", hits: byTime },
    ],
    { now: opts.now, timeNamed: Boolean(q.range), people: q.people },
  );
  const keep = (u: MemoryUnit) => (opts.projectId === undefined || u.projectId === opts.projectId);
  const expanded = expand(fused, (id) => index.get(id), keep, MAX_LINES);
  const lines: MemoryUnit[] = [];
  let used = 0;
  for (const u of expanded) {
    const size = u.text.length + 60;
    if (used + size > opts.budget) continue;
    lines.push(u);
    used += size;
  }
  return { lines, confident: confident(lexical, vector, fused, { person: byPerson.length > 0, time: Boolean(q.range) && fused.length > 0 }), aggregate: q.aggregate, ms: clock() - started };
}

// --- The prompt ----------------------------------------------------------------------------------

/** Static for every user and every question, so it heads the cached prefix. */
export const RECALL_RULES = [
  "Eres Lente, el agente personal del usuario. Recuerdas solo lo que el usuario vivió con Lente: sus reuniones, lo que se oyó a su alrededor y lo que describió la cámara de sus lentes.",
  "Abajo van su memoria resumida (MEMORIA) y las líneas recuperadas para esta pregunta (RECUPERADO), cada una con un id entre corchetes.",
  "Empieza tu respuesta con una de estas tres marcas, sola en la primera línea:",
  "- `@answer` y luego la respuesta: en español, de una a tres frases, cálida y directa, hablándole de tú. Después de cada afirmación pon los ids de las líneas que la sostienen así: [[id]]. Cita la línea más concreta: la frase dicha antes que un resumen, con nombres, cifras y fechas tal como se dijeron.",
  "- `@none` y nada más, si la memoria no lo dice. No uses conocimiento general ni inventes nombres, fechas ni cifras.",
  "- `@command` si el usuario pide que se haga algo (haz, ejecuta, corre, «que Claude…», «que Codex…»); en la línea siguiente un JSON {\"agent\": \"claude\" o \"codex\", \"instruction\": \"la tarea completa y clara para un agente de programación\"}. `codex` solo si nombra a Codex. Nunca digas que lo hiciste.",
  "Si el usuario solo saluda o pregunta qué puedes hacer, `@answer` y una respuesta breve sin ids.",
].join("\n");

const dateLine = (at: number, timeZone: string) => `${localDay(at, timeZone)} ${new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at))}`;

/** A unit as one prompt line: `[id] 2026-11-02 10:03 en «title»: text`. */
export function unitLine(u: MemoryUnit, timeZone: string): string {
  const where = u.title && u.kind === "segment" ? ` en «${u.title}»` : "";
  return `[${u.id}] ${dateLine(u.at, timeZone)}${where}: ${u.text}`;
}

/**
 * The memory prefix: for the whole memory, the profile, the last 7 day digests and the week digests;
 * inside a project, only what belongs to it (its brief, its people and its recent notes). Changes only
 * after consolidation, so it caches per user.
 */
export function memoryPrefix(units: readonly MemoryUnit[], timeZone: string, budget = PREFIX_CHARS): { text: string; ids: Set<string> } {
  const lines: string[] = [];
  const ids = new Set<string>();
  let used = 0;
  for (const u of units) {
    const line = `[${u.id}] ${u.kind === "digest" ? "" : `${dateLine(u.at, timeZone)}: `}${u.text}`;
    if (used + line.length > budget) break;
    lines.push(line);
    ids.add(u.id);
    used += line.length + 1;
  }
  return { text: lines.join("\n"), ids };
}

/** The answer call's messages, in cache order. */
export function recallMessages(input: { prefix: string; lines: readonly MemoryUnit[]; history: readonly AskMessage[]; question: string; now: number; timeZone: string }): ChatMessage[] {
  const retrieved = input.lines.length ? input.lines.map((u) => unitLine(u, input.timeZone)).join("\n") : "(nada)";
  return [
    { role: "developer", content: RECALL_RULES },
    { role: "developer", content: `MEMORIA:\n${input.prefix || "(vacía)"}` },
    { role: "developer", content: `Hoy es ${dateLine(input.now, input.timeZone)}.\n\nRECUPERADO:\n${retrieved}` },
    ...input.history.slice(-RECALL_HISTORY).map((m): ChatMessage => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 700) })),
    { role: "user", content: input.question },
  ];
}

// --- The streaming parser ------------------------------------------------------------------------

export type RecallEvent = { type: "delta"; text: string } | { type: "source"; source: AskSource };

export interface RecallResult {
  kind: "answer" | "none" | "command";
  answer: string;
  sources: AskSource[];
  found: boolean;
  /** Set when the streamed text must be replaced on the phone (made-up citations only). */
  replace?: string;
  command?: { agent: JobAgent; instruction: string };
  /** The reply stopped at the length limit; the text ends in «…». */
  cut?: boolean;
}

const HEADER = /^\s*@(answer|none|command)\b[ \t]*\n?/;
const MAX_HEADER_WAIT = 24;

/**
 * Reads the answer as it streams. `push` returns what the phone sees now: text with markers removed,
 * and a source for each cited id that was shown (once per chip). Unknown ids are dropped silently.
 */
export class RecallStream {
  private raw = "";
  private kind: RecallResult["kind"] | undefined;
  /** Text after the header not yet shown: it may end in the start of a marker. */
  private pending = "";
  /** Trailing whitespace held until more text arrives. */
  private hold = "";
  private shown = "";
  private readonly cited = new Set<string>();
  private readonly chips: AskSource[] = [];
  private readonly sources: ReadonlyMap<string, AskSource>;

  constructor(sources: ReadonlyMap<string, AskSource>) {
    this.sources = sources;
  }

  push(delta: string): RecallEvent[] {
    this.raw += delta;
    if (!this.kind) {
      const head = this.raw.trimStart();
      const m = HEADER.exec(this.raw);
      if (m) {
        this.kind = m[1] as RecallResult["kind"];
        this.pending = this.raw.slice(m[0].length);
      } else if (head && (!head.startsWith("@") || head.length >= MAX_HEADER_WAIT)) {
        // No header: the model ignored the format; all of it is the answer.
        this.kind = "answer";
        this.pending = this.raw;
      } else return [];
    } else if (this.kind === "answer") this.pending += delta;
    if (this.kind !== "answer") return [];
    return this.drain(false);
  }

  private drain(final: boolean): RecallEvent[] {
    const events: RecallEvent[] = [];
    let text = "";
    for (;;) {
      const open = this.pending.indexOf("[[");
      if (open < 0) {
        // Hold back a trailing "[" that may open a marker in the next delta.
        const hold = !final && this.pending.endsWith("[") ? 1 : 0;
        text += this.pending.slice(0, this.pending.length - hold);
        this.pending = this.pending.slice(this.pending.length - hold);
        break;
      }
      const close = this.pending.indexOf("]]", open + 2);
      if (close < 0) {
        text += this.pending.slice(0, open);
        this.pending = final ? "" : this.pending.slice(open);
        break;
      }
      text += this.pending.slice(0, open);
      for (const id of this.pending.slice(open + 2, close).split(/[,\s]+/).filter(Boolean)) {
        this.cited.add(id);
        const source = this.sources.get(id);
        if (source && !this.chips.some((c) => c.label === source.label)) {
          this.chips.push(source);
          events.push({ type: "source", source });
        }
      }
      this.pending = this.pending.slice(close + 2);
    }
    // Whitespace at the end waits for the next text: a removed marker can follow it ("frase [[id]].").
    let full = (this.hold + text).replace(/[ \t]+([.,;:!?…])/g, "$1").replace(/[ \t]{2,}/g, " ");
    this.hold = "";
    if (!final) {
      const tail = /\s+$/.exec(full)?.[0] ?? "";
      this.hold = tail;
      full = full.slice(0, full.length - tail.length);
    }
    if (!this.shown) full = full.trimStart();
    if (full) {
      this.shown += full;
      events.unshift({ type: "delta", text: full });
    }
    return events;
  }

  /** The answer once the stream ends; `cut` when it stopped at the length limit. */
  finish(cut = false): RecallResult & { events: RecallEvent[] } {
    const events: RecallEvent[] = [];
    if (!this.kind) {
      this.kind = this.raw.trim() ? "answer" : "none";
      this.pending = this.raw;
    }
    if (this.kind === "command") {
      const json = this.raw.slice(this.raw.indexOf("{"), this.raw.lastIndexOf("}") + 1);
      try {
        const out = JSON.parse(json) as { agent?: unknown; instruction?: unknown };
        const instruction = typeof out.instruction === "string" ? oneLine(out.instruction) : "";
        const agent = JOB_AGENTS.includes(out.agent as JobAgent) ? (out.agent as JobAgent) : "claude";
        if (instruction) return { kind: "command", answer: "", sources: [], found: true, command: { agent, instruction }, events };
      } catch {
        // falls through to not found
      }
      return { kind: "none", answer: NOT_FOUND, sources: [], found: false, events };
    }
    if (this.kind === "none") return { kind: "none", answer: NOT_FOUND, sources: [], found: false, events };
    this.hold = this.hold.trim() ? this.hold : "";
    events.push(...this.drain(true));
    if (cut) {
      this.shown = this.shown.trimEnd() + "…";
      events.push({ type: "delta", text: "…" });
    }
    const answer = this.shown.trim();
    // A factual answer that cites only ids that were never shown is not trusted (as parseAsk).
    if (this.cited.size > 0 && this.chips.length === 0) return { kind: "answer", answer: NOT_FOUND, sources: [], found: false, replace: NOT_FOUND, events };
    if (!answer) return { kind: "none", answer: NOT_FOUND, sources: [], found: false, events };
    return { kind: "answer", answer, sources: [...this.chips], found: true, ...(cut ? { cut } : {}), events };
  }
}

// --- Voice (decision 9) --------------------------------------------------------------------------

/** Memory lines attached to one voice turn at most. */
export const VOICE_LINES = 6;

/** An utterance that asks for something to be done, not remembered: no memory lines are attached. */
const COMMAND_START = /^(?:(?:oye|lente|por favor|porfa)[, ]+)*(?:agrega|agregar|anade|anota|apunta|crea|pon|ponme|recuerdame|marca|completa|borra|elimina|cambia|reasigna|asigna|abre|graba|empieza|inicia|para|deten|busca en internet|busca en la web|haz que|dile a|manda|envia|add|create|remind|mark|delete|open|record|start|stop|search the web)\b/;

export function looksLikeCommand(text: string): boolean {
  return COMMAND_START.test(fold(text).replace(/[¿¡]/g, "").trim());
}

/** The developer item for a voice turn: the best lines with their ids, and what each id points to. */
export function voiceAttachment(lines: readonly MemoryUnit[], timeZone: string): { text: string; citable: Map<string, AskSource> } {
  const shown = lines.slice(0, VOICE_LINES);
  return {
    text: `MEMORIA PARA ESTE TURNO (si responde a lo que dijo, contesta en tu primer paso desde aquí y cita cada línea así: [[id]]; si no, ignórala):\n${shown.map((u) => unitLine(u, timeZone)).join("\n")}`,
    citable: new Map(shown.map((u) => [u.id, sourceOf(u, timeZone)])),
  };
}
