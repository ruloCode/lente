// Ask Lente: a conversation with the wearer's agent over what it saw and heard. Answers come only from
// the memory (meeting notes and turns, today's record of what was heard and what the camera described,
// the facts the wearer kept), cite where they come from, and say so when the memory has nothing.
// Pure apart from the model call, which the hub passes in.

import type { ChatMessage } from "./chat.ts";
import type { DayEntry } from "./day-log.ts";
import type { Fact } from "./fact-store.ts";
import type { Meeting } from "./meetings.ts";
import { JOB_AGENTS, type JobAgent, chatCommand } from "./agent-jobs.ts";

/** Characters of memory the model reads; the newest material is kept when it does not all fit. */
export const ASK_MEMORY_CHARS = 60_000;
/** Earlier messages of the conversation the model sees, newest last. */
export const ASK_HISTORY = 8;
const MAX_QUESTION_CHARS = 500;
const MAX_ANSWER_CHARS = 700;

export const NOT_FOUND = "No lo encuentro en lo que viste y escuchaste.";

export type SourceKind = "meeting" | "heard" | "seen" | "fact";

/** Where an answer comes from, for the chips under it. */
export interface AskSource {
  id: string;
  kind: SourceKind;
  /** «Fecha de lanzamiento · 10:31», «Lo viste · 11:02», «Lo escuchaste · 09:40», «Recuerdo». */
  label: string;
  at: number;
  meetingId?: string;
  turnId?: string;
}

export interface AskMessage {
  role: "user" | "lente";
  text: string;
}

/** Something the user asked to have done (add-agent-bridge): the hub queues it as a job, never runs it. */
export interface AskCommand {
  agent: JobAgent;
  instruction: string;
}

export type AskOutcome =
  | { ok: true; answer: string; sources: AskSource[]; found: boolean; ms: number; command?: AskCommand }
  | { ok: false; reason: "empty-question"; message: string };

const hhmm = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The memory as numbered lines the model cites: `M2` a meeting's notes, `M2.t5` one of its turns,
 * `H14` something heard today outside a meeting, `S3` something the camera described, `F1` a kept
 * fact. Newest material first, cut at `budget` characters.
 */
export function buildMemory(input: { meetings: Meeting[]; day: DayEntry[]; facts: Fact[] }, budget = ASK_MEMORY_CHARS): { text: string; sources: Map<string, AskSource> } {
  const sources = new Map<string, AskSource>();
  const blocks: string[] = [];
  let used = 0;
  const push = (block: string): boolean => {
    if (used + block.length > budget) return false;
    blocks.push(block);
    used += block.length + 1;
    return true;
  };

  input.facts.forEach((f, i) => {
    const id = `F${i + 1}`;
    if (push(`[${id}] Recuerdo: ${oneLine(f.text)}`)) sources.set(id, { id, kind: "fact", label: "Recuerdo", at: f.createdAt, meetingId: f.meetingId, turnId: f.evidence[0] });
  });

  // Today outside meetings: what was heard and what the camera described, newest first.
  const inMeeting = (at: number) => input.meetings.some((m) => at >= m.startedAt && at <= (m.endedAt ?? Number.MAX_SAFE_INTEGER));
  let heard = 0, seen = 0;
  for (const e of [...input.day].reverse()) {
    if (e.kind === "turn" && !inMeeting(e.at) && e.text.trim()) {
      const id = `H${++heard}`;
      if (push(`[${id}] ${day(e.at)} ${hhmm(e.at)} se oyó (${e.speaker ?? "alguien"}): ${oneLine(e.text)}`)) sources.set(id, { id, kind: "heard", label: `Lo escuchaste · ${hhmm(e.at)}`, at: e.at });
    } else if ((e.kind === "live" || (e.kind === "cue" && e.label === "ON SCREEN")) && e.text.trim()) {
      const id = `S${++seen}`;
      if (push(`[${id}] ${day(e.at)} ${hhmm(e.at)} la cámara vio: ${oneLine(e.text)}`)) sources.set(id, { id, kind: "seen", label: `Lo viste · ${hhmm(e.at)}`, at: e.at });
    }
  }

  // Meetings, newest first: notes, then turns while they fit.
  const meetings = [...input.meetings].sort((a, b) => b.startedAt - a.startedAt);
  meetings.forEach((m, i) => {
    const id = `M${i + 1}`;
    const title = m.title || "Reunión sin título";
    const n = m.notes;
    const notes = n ? [n.summary, ...n.decisions.map((d) => `Decisión: ${d.text}`), ...n.commitments.map((c) => `Compromiso (${c.owner === "you" ? "el usuario" : c.owner}): ${c.what}${c.due ? ` (${c.due})` : ""}`), ...n.openQuestions.map((q) => `Pregunta abierta: ${q.text}`)].filter(Boolean).join(" | ") : "";
    if (!push(`[${id}] Reunión «${title}» ${day(m.startedAt)} ${hhmm(m.startedAt)}${notes ? `: ${oneLine(notes)}` : ""}`)) return;
    sources.set(id, { id, kind: "meeting", label: `${title} · ${hhmm(m.startedAt)}`, at: m.startedAt, meetingId: m.id });
    for (const t of m.turns) {
      const tid = `${id}.${t.id}`;
      if (!push(`[${tid}] ${hhmm(t.at)} ${t.speaker ?? "alguien"}: ${oneLine(t.text)}`)) break;
      sources.set(tid, { id: tid, kind: "meeting", label: `${title} · ${hhmm(t.at)}`, at: t.at, meetingId: m.id, turnId: t.id });
    }
  });

  return { text: blocks.join("\n"), sources };
}

/** The chat's command intent (add-agent-bridge), shared by both answer paths. */
export const COMMAND_RULE =
  "Si el usuario te pide que se haga algo (haz, ejecuta, corre, «que Claude…», «que Codex…»), no lo respondas ni digas que lo hiciste: pon `intent: \"command\"`, " +
  "en `instruction` la tarea completa y clara para un agente de programación (con lo que la memoria aporte), y en `agent` `codex` si nombra a Codex o `claude` si no; `answer` vacío. " +
  "Si solo pregunta o conversa, `intent: \"answer\"` e `instruction` vacío.";

const SYSTEM = [
  "Eres Lente, el agente personal del usuario. Recuerdas solo lo que el usuario vivió con Lente: sus reuniones, lo que se oyó a su alrededor y lo que describió la cámara de sus lentes. Esa memoria va abajo, línea por línea, con un id entre corchetes.",
  "Responde en español, en una a tres frases, cálido y directo, hablándole de tú.",
  "Usa solo la memoria. Cada afirmación debe salir de una o más líneas: pon sus ids en `sources`.",
  "Si la memoria no lo dice, responde `found: false` y `answer` vacío. No uses conocimiento general ni inventes nombres, fechas ni cifras.",
  "Si el usuario solo saluda o pregunta qué puedes hacer, responde breve con `found: true` y `sources` vacío.",
  COMMAND_RULE,
].join("\n");

export const askSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "found", "answer", "sources", "agent", "instruction"],
  properties: {
    intent: { type: "string", enum: ["answer", "command"] },
    found: { type: "boolean" },
    answer: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    agent: { type: "string", enum: [...JOB_AGENTS] },
    instruction: { type: "string" },
  },
} as const;

export function askMessages(memory: string, history: AskMessage[], question: string, now: number): ChatMessage[] {
  const recent = history.slice(-ASK_HISTORY).map((m): ChatMessage => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, MAX_ANSWER_CHARS) }));
  return [
    { role: "system", content: `${SYSTEM}\n\nHoy es ${day(now)}, ${hhmm(now)}.\n\nMEMORIA:\n${memory || "(vacía)"}` },
    ...recent,
    { role: "user", content: question },
  ];
}

/**
 * The model's JSON as an answer: unknown ids dropped; a claimed answer with nothing real behind it
 * becomes NOT_FOUND. With `question`, a command the question really asks for comes back as `command`.
 */
export function parseAsk(raw: string, sources: Map<string, AskSource>, question?: string): { answer: string; sources: AskSource[]; found: boolean; command?: AskCommand } {
  let out: { found?: unknown; answer?: unknown; sources?: unknown; intent?: unknown; agent?: unknown; instruction?: unknown };
  try {
    out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return { answer: NOT_FOUND, sources: [], found: false };
  }
  const command = question === undefined ? undefined : chatCommand(out, question);
  if (command) return { answer: "", sources: [], found: true, command };
  const answer = typeof out.answer === "string" ? oneLine(out.answer).slice(0, MAX_ANSWER_CHARS) : "";
  const ids = Array.isArray(out.sources) ? out.sources.filter((s): s is string => typeof s === "string") : [];
  const cited = [...new Set(ids)].map((id) => sources.get(id.replace(/^\[|\]$/g, ""))).filter((s): s is AskSource => Boolean(s));
  if (out.found !== true || !answer) return { answer: NOT_FOUND, sources: [], found: false };
  // Small talk carries no ids; a factual answer that cites only ids that do not exist is not trusted.
  if (ids.length > 0 && cited.length === 0) return { answer: NOT_FOUND, sources: [], found: false };
  // One chip per meeting or moment, in the order the model gave them.
  const chips = cited.filter((s, i) => cited.findIndex((o) => o.label === s.label) === i);
  return { answer, sources: chips, found: true };
}

/** One model call per question; a failed call throws. */
export async function ask(
  input: { question: unknown; history: unknown; meetings: Meeting[]; day: DayEntry[]; facts: Fact[]; now: number },
  call: (messages: ChatMessage[]) => Promise<string>,
  clock: () => number = () => performance.now(),
): Promise<AskOutcome> {
  const question = typeof input.question === "string" ? oneLine(input.question).slice(0, MAX_QUESTION_CHARS) : "";
  if (!question) return { ok: false, reason: "empty-question", message: "Escribe una pregunta." };
  const history = Array.isArray(input.history)
    ? input.history.filter((m): m is AskMessage => Boolean(m) && (m.role === "user" || m.role === "lente") && typeof m.text === "string")
    : [];
  const memory = buildMemory(input);
  const started = clock();
  const raw = await call(askMessages(memory.text, history, question, input.now));
  return { ok: true, ...parseAsk(raw, memory.sources, question), ms: Math.round(clock() - started) };
}
