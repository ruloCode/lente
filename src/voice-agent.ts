// The voice agent (add-voice-mode): one spoken turn with Lente is a short Muse Spark tool loop.
// Pure: the model is injected (`VoiceModel`, wire format in src/voice-wire.ts), tools are handlers
// on the hub's stores (src/voice-tools.ts). The reply reaches the phone one sentence at a time so
// its text-to-speech can start before the model has finished.

/** Model steps per turn: a tool, maybe a second, and the answer. */
export const VOICE_MAX_STEPS = 4;
/** Turns of the session the model sees (wearer and Lente, oldest dropped first). */
export const VOICE_HISTORY_MESSAGES = 12;
/** Sentences of a final answer that are spoken; the rest stays in the chat. */
export const MAX_SPOKEN_SENTENCES = 3;
/** Shorter pieces wait for more text, so "Sr." or "1." never become a sentence of their own. */
export const MIN_SENTENCE_CHARS = 12;

export const LONG_REPLY_NOTE = "El resto te lo dejo en el chat.";
export const STEP_LIMIT_REPLY = "No alcancé a terminar; inténtalo con una pregunta más corta.";
export const MODEL_ERROR_REPLY = "No pude responder ahora; prueba otra vez.";

/** What the model sees and says: messages, and the function calls with their results. */
export type VoiceItem =
  | { type: "message"; role: "user" | "assistant"; text: string; phase?: "commentary" }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | { type: "function_call_output"; callId: string; output: string };

export interface VoiceUsage {
  input: number;
  cached: number;
  output: number;
  /** Web searches the model ran (billed per query). */
  searches: number;
}

/** A source the phone shows as a chip: a page from the web, or a place in the memory. */
export interface VoiceSource {
  kind: "web" | "meeting" | "heard" | "seen" | "fact";
  label: string;
  url?: string;
  meetingId?: string;
  turnId?: string;
}

/** What one model step streamed and returned. */
export interface VoiceStep {
  /** The step's output in order (commentary, final text, function calls), for the next step's input. */
  items: VoiceItem[];
  calls: { callId: string; name: string; args: Record<string, unknown> }[];
  /** Pages the model's own web search used. */
  sources: VoiceSource[];
  /** Queries it searched, in order. */
  searches: string[];
  usage?: Omit<VoiceUsage, "searches">;
}

export interface VoiceStreamHandlers {
  /** A text delta; `commentary` is a preamble before a tool, not the answer. */
  text(delta: string, commentary: boolean): void;
  /** The model started a web search. */
  search(query: string): void;
}

export type VoiceModel = (input: VoiceItem[], signal: AbortSignal, on: VoiceStreamHandlers) => Promise<VoiceStep>;

export interface FunctionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool's answer: what goes back to the model, and what the phone shows about it. */
export interface ToolOutcome {
  result: unknown;
  /** The chip under the reply ("Tarea agregada", "Buscando en tus reuniones"). */
  label: string;
  sources?: VoiceSource[];
}

export type VoiceToolHandler = (args: Record<string, unknown>) => Promise<ToolOutcome> | ToolOutcome;

export type VoiceTurnEvent =
  | { kind: "sentence"; text: string; commentary: boolean }
  | { kind: "tool"; name: string; label: string }
  | { kind: "sources"; sources: VoiceSource[] };

export type VoiceStop = "answered" | "step-limit" | "cancelled" | "model-error";

export interface VoiceTurnResult {
  stopped: VoiceStop;
  /** The final answer as written, all of it (the chat keeps it). */
  text: string;
  sources: VoiceSource[];
  tools: string[];
  steps: number;
  usage: VoiceUsage;
  /** From the turn's start: first text of any kind, and first sentence sent to the phone. */
  firstTextMs?: number;
  firstSentenceMs?: number;
  error?: string;
}

// --- Speaking -----------------------------------------------------------------------------------

/** Text as it should be spoken: no markdown marks, bullets, headings or links' URLs. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cuts streamed text into sentences: at `.`, `?`, `!` or `…` followed by a space, and at a line
 * break. Pieces under MIN_SENTENCE_CHARS wait for the next one.
 */
export class SentenceSplitter {
  private buffer = "";

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const cut = this.findCut();
      if (cut < 0) break;
      const piece = speakable(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
      if (piece) out.push(piece);
    }
    return out;
  }

  /** The rest, at the end of the message. */
  flush(): string[] {
    const piece = speakable(this.buffer);
    this.buffer = "";
    return piece ? [piece] : [];
  }

  private findCut(): number {
    const re = /[.?!…]+["»”)]?\s+|\n+/g;
    for (let m = re.exec(this.buffer); m; m = re.exec(this.buffer)) {
      const end = m.index + m[0].length;
      if (speakable(this.buffer.slice(0, end)).length >= MIN_SENTENCE_CHARS) return end;
    }
    return -1;
  }
}

// --- Confirmation -------------------------------------------------------------------------------

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const YES = /^(si|claro|dale|hazlo|confirmo|confirmado|de una|correcto|exacto|listo|ok|okay|vale|adelante|por favor|yes)\b/;
/** A yes that goes on to change the request ("sí, pero la otra") is not a yes. */
const HEDGE = /\b(pero|no|otra|otro|mejor|espera)\b/;
const NO = /^(no|nop|nada|cancela|cancelalo|mejor no|dejalo|deja|olvidalo|espera|todavia no|aun no)\b/;

/** A spoken answer to "¿lo hago?": yes, no, or something else (a new request). */
export function confirmation(text: string): "yes" | "no" | undefined {
  const t = fold(text);
  if (!t) return undefined;
  if (NO.test(t)) return "no";
  if (YES.test(t) && !HEDGE.test(t)) return "yes";
  return undefined;
}

// --- Instructions and tools ---------------------------------------------------------------------

export interface VoiceContext {
  /** How the wearer is called, so "Rulo" in the memory is "tú" to them. */
  names: string[];
  now: number;
  timeZone: string;
  /** Active projects with the short ids the tools accept. */
  projects?: { id: string; name: string }[];
}

/** Projects named in the instructions; more are reached with list_projects. */
export const MAX_INSTRUCTION_PROJECTS = 20;

/**
 * The developer instructions. They come first in every request and do not change within a
 * session (the date is the day, not the minute), so the prefix stays cached.
 */
export function voiceInstructions(ctx: VoiceContext): string {
  const today = new Date(ctx.now).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ctx.timeZone });
  return [
    "Eres Lente y estás hablando en voz alta con quien te lleva puesto. Lo que escribes se lee con una voz sintética.",
    `Hoy es ${today}. ${ctx.names.length ? `La persona se llama ${ctx.names.join(" o ")}; en la memoria aparece con ese nombre, pero tú le hablas de tú.` : ""}`,
    "Responde siempre en español, corto y hablado: de una a tres frases, sin listas, sin markdown, sin URLs y sin emojis. Si la respuesta es larga, di lo esencial y avisa que el resto queda en el chat.",
    "Lo que sabes de la persona (reuniones, proyectos, compromisos, recuerdos) se consulta con ask_memory; no inventes nada de su vida. Para tareas y proyectos usa list_tasks y list_projects.",
    "Usa la búsqueda web solo cuando la pregunta necesita información actual o de fuera de su memoria, y di de qué sitio sale.",
    "Antes de llamar una herramienta puedes decir una frase corta de lo que vas a revisar («Lo busco en tus reuniones»), nunca que ya lo hiciste.",
    "Para completar, borrar o reasignar una tarea usa su id (t1, t2…) de list_tasks o add_task. complete_task y delete_task no actúan: devuelven una pregunta de confirmación que debes hacer tal cual.",
    "start_recording solo abre la hoja de grabación en el teléfono; la persona toca Grabar. delegate deja el trabajo como tarea para Lente; no se ejecuta nada sin su aprobación.",
    "Nunca envías correos ni mensajes ni prometes hacerlo.",
    ctx.projects?.length ? `Proyectos activos: ${ctx.projects.slice(0, MAX_INSTRUCTION_PROJECTS).map((p) => `${p.id} ${p.name}`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

const OWNER = { type: "string", enum: ["me", "lente", "other"], description: "me: la persona; lente: algo que Lente puede hacer; other: lo hace otra persona" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

export const VOICE_FUNCTIONS: FunctionSpec[] = [
  {
    name: "ask_memory",
    description: "Pregunta a la memoria de la persona (reuniones, lo que oyó y vio, recuerdos, resúmenes por día y semana). Devuelve la respuesta con sus fuentes.",
    parameters: obj({ question: { type: "string", description: "La pregunta, completa y en español" }, project: { type: "string", description: "Id de proyecto (p1…) para buscar solo ahí" } }, ["question"]),
  },
  { name: "list_projects", description: "Los proyectos activos de la persona, con sus tareas abiertas.", parameters: obj({}) },
  {
    name: "list_tasks",
    description: "Las tareas abiertas, con su id corto (t1…), dueño, proyecto y fecha.",
    parameters: obj({ who: OWNER, project: { type: "string", description: "Id de proyecto (p1…)" } }),
  },
  {
    name: "add_task",
    description: "Agrega una tarea. El título empieza con un verbo en infinitivo («Llamar a Ana»).",
    parameters: obj({ title: { type: "string" }, who: OWNER, other: { type: "string", description: "Quién la hace, si who es other" }, due: { type: "string", description: "Cuándo, como lo dijo la persona («viernes»)" }, project: { type: "string", description: "Id de proyecto (p1…)" } }, ["title", "who"]),
  },
  { name: "complete_task", description: "Pide marcar una tarea como hecha; devuelve la pregunta de confirmación.", parameters: obj({ id: { type: "string" } }, ["id"]) },
  { name: "delete_task", description: "Pide borrar una tarea; devuelve la pregunta de confirmación.", parameters: obj({ id: { type: "string" } }, ["id"]) },
  { name: "reassign_task", description: "Cambia quién hace una tarea.", parameters: obj({ id: { type: "string" }, who: OWNER, other: { type: "string" } }, ["id", "who"]) },
  {
    name: "start_recording",
    description: "Abre la hoja de grabación en el teléfono con el proyecto y la cámara elegidos. No graba: la persona toca Grabar.",
    parameters: obj({ project: { type: "string", description: "Id de proyecto (p1…)" }, camera: { type: "boolean" } }),
  },
  {
    name: "delegate",
    description: "Pasa un trabajo a un agente. Queda pendiente de la aprobación de la persona; no se ejecuta nada.",
    parameters: obj({ instruction: { type: "string" }, agent: { type: "string", description: "A quién, si lo dijo" } }, ["instruction"]),
  },
];

// --- The loop -----------------------------------------------------------------------------------

export interface VoiceTurnOptions {
  model: VoiceModel;
  tools: Record<string, VoiceToolHandler>;
  /** Earlier messages of the session, oldest first. */
  history: VoiceItem[];
  utterance: string;
  signal: AbortSignal;
  emit(event: VoiceTurnEvent): void;
  now?: () => number;
}

const emptyUsage = (): VoiceUsage => ({ input: 0, cached: 0, output: 0, searches: 0 });

/** The session's messages the model sees: the last VOICE_HISTORY_MESSAGES, starting with the wearer's. */
export function trimHistory(history: VoiceItem[]): VoiceItem[] {
  const messages = history.filter((i): i is Extract<VoiceItem, { type: "message" }> => i.type === "message" && !i.phase);
  const kept = messages.slice(-VOICE_HISTORY_MESSAGES);
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

/**
 * One turn: model steps until an answer without tool calls, or VOICE_MAX_STEPS. Sentences are
 * emitted as they complete; an aborted signal stops everything and emits nothing more.
 */
export async function runVoiceTurn(opts: VoiceTurnOptions): Promise<VoiceTurnResult> {
  const now = opts.now ?? (() => performance.now());
  const started = now();
  const input: VoiceItem[] = [...trimHistory(opts.history), { type: "message", role: "user", text: opts.utterance }];
  const usage = emptyUsage();
  const sources: VoiceSource[] = [];
  const tools: string[] = [];
  let finalText = "";
  let finalSentences = 0;
  let truncated = false;
  let firstTextMs: number | undefined;
  let firstSentenceMs: number | undefined;
  const cancelled = () => opts.signal.aborted;
  const result = (stopped: VoiceStop, steps: number, error?: string): VoiceTurnResult => ({ stopped, text: finalText.trim(), sources, tools, steps, usage, firstTextMs, firstSentenceMs, ...(error ? { error } : {}) });

  const say = (text: string, commentary: boolean) => {
    if (cancelled()) return;
    if (!commentary) {
      if (finalSentences >= MAX_SPOKEN_SENTENCES) return void (truncated = true);
      finalSentences++;
    }
    if (firstSentenceMs === undefined) firstSentenceMs = now() - started;
    opts.emit({ kind: "sentence", text, commentary });
  };

  for (let step = 1; step <= VOICE_MAX_STEPS; step++) {
    if (cancelled()) return result("cancelled", step - 1);
    const splitters = { commentary: new SentenceSplitter(), final: new SentenceSplitter() };
    let lastKind: "commentary" | "final" | undefined;
    let reply: VoiceStep;
    try {
      reply = await opts.model(input, opts.signal, {
        text(delta, commentary) {
          if (cancelled() || !delta) return;
          if (firstTextMs === undefined) firstTextMs = now() - started;
          const kind = commentary ? "commentary" : "final";
          // A commentary that ends where the answer starts is a sentence of its own.
          if (lastKind && lastKind !== kind) for (const s of splitters[lastKind].flush()) say(s, lastKind === "commentary");
          lastKind = kind;
          if (!commentary) finalText += delta;
          for (const s of splitters[kind].push(delta)) say(s, commentary);
        },
        search(query) {
          if (cancelled()) return;
          tools.push("web_search");
          opts.emit({ kind: "tool", name: "web_search", label: `Buscando en internet: ${query.slice(0, 60)}` });
        },
      });
    } catch (error) {
      if (cancelled()) return result("cancelled", step);
      const message = error instanceof Error ? error.message : String(error);
      say(MODEL_ERROR_REPLY, false);
      finalText ||= MODEL_ERROR_REPLY;
      return result("model-error", step, message);
    }
    if (cancelled()) return result("cancelled", step);
    for (const kind of ["commentary", "final"] as const) for (const s of splitters[kind].flush()) say(s, kind === "commentary");
    if (reply.usage) {
      usage.input += reply.usage.input;
      usage.cached += reply.usage.cached;
      usage.output += reply.usage.output;
    }
    usage.searches += reply.searches.length;
    if (reply.sources.length) {
      sources.push(...reply.sources);
      opts.emit({ kind: "sources", sources: reply.sources });
    }
    if (reply.calls.length === 0) {
      if (truncated) {
        say(LONG_REPLY_NOTE, true);
      }
      return result("answered", step);
    }
    input.push(...reply.items);
    for (const call of reply.calls) {
      if (cancelled()) return result("cancelled", step);
      const handler = opts.tools[call.name];
      let outcome: ToolOutcome;
      if (!handler) outcome = { result: { error: `unknown tool ${call.name}` }, label: call.name };
      else {
        try {
          outcome = await handler(call.args);
        } catch (error) {
          outcome = { result: { error: error instanceof Error ? error.message : String(error) }, label: call.name };
        }
      }
      if (cancelled()) return result("cancelled", step);
      tools.push(call.name);
      opts.emit({ kind: "tool", name: call.name, label: outcome.label });
      if (outcome.sources?.length) {
        sources.push(...outcome.sources);
        opts.emit({ kind: "sources", sources: outcome.sources });
      }
      input.push({ type: "function_call_output", callId: call.callId, output: typeof outcome.result === "string" ? outcome.result : JSON.stringify(outcome.result) });
    }
    // The text before a tool call was commentary, not the answer.
    finalText = "";
    finalSentences = 0;
  }
  say(STEP_LIMIT_REPLY, false);
  finalText ||= STEP_LIMIT_REPLY;
  return result("step-limit", VOICE_MAX_STEPS);
}
