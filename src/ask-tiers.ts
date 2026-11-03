// Asking the whole memory (add-accounts 5.3, design decisions 7 and 8). Four steps:
//   1. Context: the profile, recent day digests, week and month digests and the newest meetings'
//      notes, as lines with ids. It only grows at the end, so it caches well.
//   2. Plan: one structured call names the meetings and days to open (only ids it was shown), an
//      optional date range and a few terms.
//   3. Lookup: the hub opens just those records (by id and date; the database never sees a word of
//      the question), ranks their turns against the terms in memory, and shows the best.
//   4. Answer: the same schema as add-ask-lente; cited ids are checked against everything shown.
// Pure apart from the injected model call and loaders.

import { type AskMessage, type AskOutcome, type AskSource, COMMAND_RULE, NOT_FOUND, askSchema, parseAsk } from "./ask.ts";
import type { ChatMessage } from "./chat.ts";
import type { DayEntry } from "./day-log.ts";
import { type Digest, digestId } from "./digests.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting } from "./meetings.ts";

/** Characters of context in step 1 (the same budget as the 7-day window it replaces). */
export const TIER_CONTEXT_CHARS = 60_000;
/** Characters of looked-up material in step 3. */
export const LOOKUP_CHARS = 24_000;
export const PLAN_LIMITS = { meetings: 5, days: 7, terms: 8, rangeDays: 92 } as const;
const HISTORY = 8;
const MAX_QUESTION_CHARS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["needs_lookup", "meetings", "days", "from", "to", "terms"],
  properties: {
    needs_lookup: { type: "boolean" },
    meetings: { type: "array", items: { type: "string" } },
    days: { type: "array", items: { type: "string" } },
    from: { type: ["string", "null"] },
    to: { type: ["string", "null"] },
    terms: { type: "array", items: { type: "string" } },
  },
} as const;

export interface LookupPlan {
  meetings: string[];
  days: string[];
  from?: string;
  to?: string;
  terms: string[];
}

export interface TierInput {
  profile?: Digest;
  /** Newest first: the last 14 days, the last 8 weeks, every month. */
  days: Digest[];
  weeks: Digest[];
  months: Digest[];
  /** The newest meetings, whose notes go in the context. */
  recentMeetings: Meeting[];
  keptFacts: Fact[];
}

/** Reads records by id and date only. */
export interface TierLoaders {
  meetings(ids: string[]): Promise<Meeting[]>;
  /** Meetings that started in [from, to), at most `limit`, newest first. */
  meetingsBetween(from: number, to: number, limit: number): Promise<Meeting[]>;
  days(days: string[]): Promise<DayEntry[]>;
}

export type TierCall = (messages: ChatMessage[], schema: object, name: string) => Promise<string>;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10);
const hhmm = (at: number) => new Date(at).toISOString().slice(11, 16);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lowercase, no accents, for matching terms against turns in memory. */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lines with ids, and what each id points to. */
class Shown {
  readonly lines: string[] = [];
  readonly sources = new Map<string, AskSource>();
  private used = 0;
  private readonly budget: number;

  constructor(budget: number) {
    this.budget = budget;
  }

  add(id: string, line: string, source: AskSource): boolean {
    const text = `[${id}] ${line}`;
    if (this.used + text.length > this.budget) return false;
    this.lines.push(text);
    this.used += text.length + 1;
    this.sources.set(id, source);
    return true;
  }
}

const digestSource = (d: Digest): AskSource => ({ id: digestId(d), kind: "fact", label: d.scope === "profile" ? "Tu perfil" : `Resumen · ${d.periodStart}`, at: d.createdAt });

function notesLine(m: Meeting): string {
  const n = m.notes;
  const parts = n ? [n.summary, ...n.decisions.map((d) => `Decisión: ${d.text}`), ...n.commitments.map((c) => `Compromiso (${c.owner === "you" ? "el usuario" : c.owner}): ${c.what}${c.due ? ` (${c.due})` : ""}`), ...n.openQuestions.map((q) => `Pregunta abierta: ${q.text}`)] : [];
  return `Reunión «${m.title || "sin título"}» ${isoDay(m.startedAt)} ${hhmm(m.startedAt)}${parts.length ? `: ${oneLine(parts.join(" | "))}` : ""}`;
}

/** Step 1: the context, oldest tiers first so it only grows at the end. */
export function buildTierContext(input: TierInput, budget = TIER_CONTEXT_CHARS): Shown {
  const shown = new Shown(budget);
  const withSources = (d: Digest) => `${oneLine(d.text)}${d.sources.length ? ` (de: ${d.sources.join(", ")})` : ""}`;
  if (input.profile) shown.add(digestId(input.profile), `Perfil del usuario: ${withSources(input.profile)}`, digestSource(input.profile));
  for (const [i, f] of input.keptFacts.entries()) shown.add(`F${i + 1}`, `Recuerdo confirmado: ${oneLine(f.text)}`, { id: `F${i + 1}`, kind: "fact", label: "Recuerdo", at: f.createdAt, meetingId: f.meetingId, turnId: f.evidence[0] });
  for (const d of [...input.months].reverse()) shown.add(digestId(d), `Mes ${d.periodStart.slice(0, 7)}: ${withSources(d)}`, digestSource(d));
  for (const d of [...input.weeks].reverse()) shown.add(digestId(d), `Semana del ${d.periodStart}: ${withSources(d)}`, digestSource(d));
  for (const d of [...input.days].reverse()) shown.add(digestId(d), `Día ${d.periodStart}: ${withSources(d)}`, digestSource(d));
  for (const m of [...input.recentMeetings].sort((a, b) => a.startedAt - b.startedAt)) {
    shown.add(m.id, notesLine(m), { id: m.id, kind: "meeting", label: `${m.title || "Reunión"} · ${hhmm(m.startedAt)}`, at: m.startedAt, meetingId: m.id });
  }
  return shown;
}

/** The meeting and day ids the plan may name: those in the context lines and in the digests' sources. */
function nameable(shown: Shown): { meetings: Set<string>; days: Set<string> } {
  const meetings = new Set<string>();
  const days = new Set<string>();
  for (const id of shown.sources.keys()) {
    if (/^m\d{14}(-\d+)?$/.test(id)) meetings.add(id);
    if (id.startsWith("day:")) days.add(id.slice(4));
  }
  for (const line of shown.lines) {
    for (const m of line.matchAll(/\bm\d{14}(?:-\d+)?\b/g)) meetings.add(m[0]);
    for (const d of line.matchAll(/\bd(\d{4}-\d{2}-\d{2})\b/g)) days.add(d[1]!);
  }
  return { meetings, days };
}

/** Step 2's answer, kept to what was shown and to the limits; undefined when no lookup is needed. */
export function parsePlan(raw: string, shown: Shown, now: number): LookupPlan | undefined {
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (out.needs_lookup !== true) return undefined;
  const allowed = nameable(shown);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const plan: LookupPlan = {
    meetings: [...new Set(strings(out.meetings))].filter((id) => allowed.meetings.has(id)).slice(0, PLAN_LIMITS.meetings),
    days: [...new Set(strings(out.days).map((d) => d.replace(/^d/, "")))].filter((d) => DAY.test(d) && allowed.days.has(d)).slice(0, PLAN_LIMITS.days),
    terms: [...new Set(strings(out.terms).map((t) => oneLine(t).slice(0, 40)).filter(Boolean))].slice(0, PLAN_LIMITS.terms),
  };
  const from = typeof out.from === "string" && DAY.test(out.from) ? out.from : undefined;
  const to = typeof out.to === "string" && DAY.test(out.to) ? out.to : undefined;
  if (from && Date.parse(from) <= now) {
    plan.from = from;
    const end = to && to >= from ? to : isoDay(now);
    plan.to = isoDay(Math.min(Date.parse(end), Date.parse(from) + PLAN_LIMITS.rangeDays * DAY_MS));
  }
  return plan;
}

/** How well a text matches the terms: one point per term it contains. */
const score = (text: string, terms: string[]): number => {
  const t = fold(text);
  return terms.reduce((n, term) => n + (t.includes(fold(term)) ? 1 : 0), 0);
};

/** Step 3: open what the plan named and show the best-matching turns, within the lookup budget. */
export async function lookUp(plan: LookupPlan, loaders: TierLoaders, budget = LOOKUP_CHARS): Promise<Shown> {
  const shown = new Shown(budget);
  const byId = new Map<string, Meeting>();
  for (const m of plan.meetings.length ? await loaders.meetings(plan.meetings) : []) byId.set(m.id, m);
  if (plan.from && plan.to && byId.size < PLAN_LIMITS.meetings) {
    const ranged = await loaders.meetingsBetween(Date.parse(plan.from), Date.parse(plan.to) + DAY_MS, PLAN_LIMITS.meetings - byId.size);
    for (const m of ranged) byId.set(m.id, m);
  }
  const entries = plan.days.length ? await loaders.days(plan.days) : [];

  type Candidate = { id: string; line: string; source: AskSource; score: number; at: number };
  const candidates: Candidate[] = [];
  for (const m of byId.values()) {
    shown.add(m.id, notesLine(m), { id: m.id, kind: "meeting", label: `${m.title || "Reunión"} · ${hhmm(m.startedAt)}`, at: m.startedAt, meetingId: m.id });
    for (const t of m.turns) {
      candidates.push({ id: `${m.id}:${t.id}`, line: `${isoDay(t.at)} ${hhmm(t.at)} en «${m.title}» ${t.speaker ?? "alguien"}: ${oneLine(t.text)}`, source: { id: `${m.id}:${t.id}`, kind: "meeting", label: `${m.title || "Reunión"} · ${hhmm(t.at)}`, at: t.at, meetingId: m.id, turnId: t.id }, score: score(t.text, plan.terms), at: t.at });
    }
  }
  entries.forEach((e, i) => {
    if (!("text" in e) || !e.text.trim()) return;
    const seen = e.kind === "live" || (e.kind === "cue" && e.label === "ON SCREEN");
    if (e.kind !== "turn" && !seen) return;
    const id = `d${isoDay(e.at)}:${i + 1}`;
    const line = `${isoDay(e.at)} ${hhmm(e.at)} ${seen ? "la cámara vio" : `se oyó (${e.kind === "turn" ? e.speaker ?? "alguien" : ""})`}: ${oneLine(e.text)}`;
    candidates.push({ id, line, source: { id, kind: seen ? "seen" : "heard", label: `${seen ? "Lo viste" : "Lo escuchaste"} · ${hhmm(e.at)}`, at: e.at }, score: score(e.text, plan.terms), at: e.at });
  });
  // Best matches first; with no terms (or no match) the newest, so a date question still sees its day.
  candidates.sort((a, b) => b.score - a.score || b.at - a.at);
  for (const c of candidates) if (!shown.add(c.id, c.line, c.source)) break;
  return shown;
}

const SYSTEM = [
  "Eres Lente, el agente personal del usuario. Recuerdas solo lo que el usuario vivió con Lente. Abajo va su memoria por capas (perfil, resúmenes por mes, semana y día, reuniones), línea por línea, con un id entre corchetes.",
  "Responde en español, en una a tres frases, cálido y directo, hablándole de tú.",
  "Usa solo la memoria. Cada afirmación debe salir de una o más líneas: pon sus ids en `sources`. Prefiere citar la línea más concreta (una frase de una reunión antes que un resumen).",
  "Si la memoria no lo dice, responde `found: false` y `answer` vacío. No uses conocimiento general ni inventes nombres, fechas ni cifras.",
  COMMAND_RULE,
].join("\n");

const PLANNER = [
  "Decides qué abrir de la memoria del usuario para responder su pregunta. Abajo va su memoria por capas con ids.",
  "Si lo de abajo ya basta para responder, o la pregunta no es sobre su memoria, `needs_lookup: false`.",
  "Si no, nombra hasta 5 reuniones (ids `m…` que aparezcan abajo), hasta 7 días (`YYYY-MM-DD` que aparezcan abajo), y si sirve un rango `from`/`to` en `YYYY-MM-DD`; y hasta 8 términos cortos para buscar en lo que se dijo (nombres, temas, palabras clave), en el idioma en que se habrían dicho.",
  "No nombres ids que no estén abajo.",
].join("\n");

const historyMessages = (history: AskMessage[]): ChatMessage[] => history.slice(-HISTORY).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 700) }));

/** The four steps for one question. */
export async function askTiers(
  input: TierInput & { question: unknown; history: unknown; now: number },
  loaders: TierLoaders,
  call: TierCall,
  clock: () => number = () => performance.now(),
): Promise<AskOutcome & { plan?: LookupPlan }> {
  const question = typeof input.question === "string" ? oneLine(input.question).slice(0, MAX_QUESTION_CHARS) : "";
  if (!question) return { ok: false, reason: "empty-question", message: "Escribe una pregunta." };
  const history = Array.isArray(input.history) ? input.history.filter((m): m is AskMessage => Boolean(m) && (m.role === "user" || m.role === "lente") && typeof m.text === "string") : [];
  const started = clock();
  const context = buildTierContext(input);
  const memory = `Hoy es ${isoDay(input.now)}.\n\nMEMORIA:\n${context.lines.join("\n") || "(vacía)"}`;

  const plan = parsePlan(await call([{ role: "system", content: `${PLANNER}\n\n${memory}` }, ...historyMessages(history), { role: "user", content: question }], planSchema, "lookup_plan"), context, input.now);
  const found = plan ? await lookUp(plan, loaders) : new Shown(0);

  const lookupText = found.lines.length ? `\n\nBUSCADO PARA ESTA PREGUNTA:\n${found.lines.join("\n")}` : "";
  const raw = await call([{ role: "system", content: `${SYSTEM}\n\n${memory}${lookupText}` }, ...historyMessages(history), { role: "user", content: question }], askSchema, "ask");
  const sources = new Map([...context.sources, ...found.sources]);
  const answer = parseAsk(raw, sources, question);
  return { ok: true, ...answer, answer: answer.found ? answer.answer : NOT_FOUND, ms: Math.round(clock() - started), ...(plan ? { plan } : {}) };
}
