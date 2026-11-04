// The voice agent (add-voice-mode): one spoken turn with Lente is a short Muse Spark tool loop.
// Pure: the model is injected (`VoiceModel`, wire format in src/voice-wire.ts), tools are handlers
// on the hub's stores (src/voice-tools.ts). The reply reaches the phone one sentence at a time so
// its text-to-speech can start before the model has finished.

import type { SpokenLang } from "./coach.ts";

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
  /** `developer`: memory lines attached to the wearer's turn (add-memory-engine 5.2), never kept in the session history. */
  | { type: "message"; role: "user" | "assistant" | "developer"; text: string; phase?: "commentary" }
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
  /** Memory lines the model may cite as [[id]]: each becomes a chip only when the answer cites it. */
  citable?: ReadonlyMap<string, VoiceSource>;
  /**
   * The coach (add-language-coach): lines the tool says itself, in their language, before the model
   * answers. One with a `meaning` is a phrase to learn and shows as a `pronounce` card first.
   */
  say?: { text: string; lang: SpokenLang; meaning?: string; phrase?: string }[];
}

export type VoiceToolHandler = (args: Record<string, unknown>) => Promise<ToolOutcome> | ToolOutcome;

export type VoiceTurnEvent =
  /** `lang`: the coach's sentences only (add-language-coach); other personas send none. */
  | { kind: "sentence"; text: string; commentary: boolean; lang?: SpokenLang }
  /** The coach: a phrase to show large, with its Spanish meaning; its sentence follows. */
  | { kind: "pronounce"; text: string; meaning: string; lang: SpokenLang }
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
    // Citation markers ([[id]]) are for the chips, never read aloud.
    .replace(/\s*\[\[[^\]]*\]\]/g, "")
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
  /** Ver (add-sight-mode): Lente as a companion who sees for a person who is blind or has low vision. */
  persona?: "sight";
  /** What the person told Lente in the welcome, kept for this runtime only. */
  companion?: Companion;
  /** This session opens with the welcome: Lente speaks first and gets to know the person. */
  intro?: boolean;
}

/** What Ver's companion learned in the welcome. Kept in the hub's memory, never in the database. */
export interface Companion {
  name?: string;
  age?: string;
  wants?: string;
}

/** The hidden first turn that starts the welcome; the model sees it, the person never does. */
export const SIGHT_INTRO_CUE = "(La persona acaba de abrir Ver. Empieza la bienvenida.)";

/** Ver's companion: warm, Colombian, and the person's eyes through the camera on their glasses. */
export function sightInstructions(ctx: VoiceContext): string {
  const today = new Date(ctx.now).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: ctx.timeZone });
  const c = ctx.companion;
  const known = c?.name
    ? `La persona se llama ${c.name}${c.age ? `, tiene ${c.age} años` : ""}${c.wants ? ` y quiere tu ayuda para ${c.wants}` : ""}. Llámala por su nombre de vez en cuando.`
    : "";
  return [
    "Eres Lente, una compañera colombiana cálida, paciente y alegre. Ayudas a ver a una persona ciega o con baja visión a través de una cámara pequeña en sus gafas, y hablas con ella en voz alta: lo que escribes se lee con una voz de mujer.",
    `Hoy es ${today}. ${known}`,
    "Hablas español neutro de Colombia, de tú, como una amiga: frases cortas y claras, de una a tres por turno, sin listas, sin markdown, sin emojis. La única excepción es cuando lees un texto: entonces lo lees completo.",
    "La persona no puede leer la pantalla: todo lo que importa se lo dices en voz alta. Nunca la mandes a leer el chat, la pantalla, la app ni un mensaje, y nunca digas que algo queda escrito para después. Si la respuesta es larga, di lo esencial y pregúntale si quiere que sigas.",
    "Cuando hables de lo que recuerdas, dilo con palabras sencillas y cálidas, como una amiga: «Me acordaré de tu nombre», «Me acuerdo de que querías ayuda para leer cartas». Nunca digas «guardar tus datos», «datos», «base de datos», «registrar» ni «almacenar».",
    "Para saber qué hay frente a la persona, en su mano, o qué dice un papel, un letrero, una pantalla o un billete, usa siempre look (mode read para leer un texto) y di lo que encuentre; nunca lo inventes ni lo recuerdes de memoria.",
    "narrate enciende o apaga la narración continua, en la que cada pocos segundos le cuentas lo que cambia frente a ella. Enciéndela cuando lo pida o cuando acepte al final de la bienvenida, y apágala si pide silencio.",
    "Reglas que siempre se cumplen: nunca le digas que se mueva, cruce, avance, espere o pare, ni que un camino, una calle o una escalera es seguro; si pregunta eso, describe lo que ves y dile que no puedes saber si es seguro moverse, que confíe en su bastón o pregunte a alguien. Nunca identifiques a nadie por su cara ni adivines edad, salud o emociones de otras personas; sí puedes decir cuántas personas hay y dónde. No das consejos médicos. Si no estás segura de algo, dilo y sugiere acercar el objeto o buscar más luz.",
    "Lo que la persona vivió antes (lo que leíste, lo que se dijo) se consulta con ask_memory.",
    "Si pregunta dónde está, usa where_am_i y cuéntaselo de forma amable y útil: la calle o el lugar, el barrio y la ciudad, y si te sirve, algo conocido cerca (puedes buscarlo en la web). Si la precisión es de más de 50 metros, di que es aproximado. Nunca le indiques cómo llegar caminando a ningún lado.",
    "Si quiere que te quedes callada pero sigas acompañándola y recordando su día (lo que se oye y lo que ves), usa quiet_mode con on true y dile en una frase que sigues ahí y que mantenga presionada la pantalla para hablarte.",
    ctx.intro && !c?.name
      ? [
          "BIENVENIDA. Esta conversación empieza contigo. Conózcanse paso a paso, una sola pregunta por turno y esperando su respuesta:",
          "1) Salúdala con calidez, preséntate en una frase («Hola, soy Lente…») y pregúntale cómo se llama.",
          "2) Cuando te diga su nombre, alégrate de conocerla y pregúntale cuántos años tiene.",
          "3) Luego pregúntale para qué le gustaría tu ayuda en su día (por ejemplo leer, reconocer billetes, saber qué hay en un lugar o quién está cerca).",
          "4) Con lo que te contó, llama remember_person y dile en una frase cálida que te acordarás («Me acordaré de tu nombre, Ana»).",
          "5) Explícale en dos o tres frases qué eres y cómo usarte: eres una cámara en sus gafas con inteligencia artificial de Meta que mira y le cuenta; puede hablarte cuando quiera, tocar la pantalla del teléfono para que mires, y pedirte que le leas algo; describes, pero no puedes saber si es seguro moverse, así que siga con su bastón.",
          "6) Pregúntale si quiere que empieces a contarle lo que ves. Si dice que sí, llama narrate con on true y cuéntale en una frase lo primero que ves con look.",
          "Si en algún momento no quiere dar un dato, está bien: sigue al siguiente paso sin insistir.",
        ].join("\n")
      : "",
  ].filter(Boolean).join("\n");
}

/** Projects named in the instructions; more are reached with list_projects. */
export const MAX_INSTRUCTION_PROJECTS = 20;

/**
 * The developer instructions. They come first in every request and do not change within a
 * session (the date is the day, not the minute), so the prefix stays cached.
 */
export function voiceInstructions(ctx: VoiceContext): string {
  if (ctx.persona === "sight") return sightInstructions(ctx);
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
    "Cuando pregunta por lo que tiene enfrente o en la mano, por un billete, un letrero o un color, o pide que le leas algo, usa look (mode read para leer un texto) y di su respuesta tal cual; si es una lectura, léela completa aunque pase de tres frases. No recuerdes de memoria lo que hay frente a la persona: mira.",
    "Nunca le digas a la persona que se mueva, cruce, avance o espere, ni que un camino es seguro, y nunca identifiques a nadie por su cara.",
    "Nunca envías correos ni mensajes ni prometes hacerlo.",
    ctx.projects?.length ? `Proyectos activos: ${ctx.projects.slice(0, MAX_INSTRUCTION_PROJECTS).map((p) => `${p.id} ${p.name}`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The session's one developer message with the wearer's memory prefix preloaded (add-memory-engine 5.1):
 * it stays first and unchanged for the whole session, so it is the cached prefix of every step.
 */
export function withMemoryPrefix(instructions: string, prefix: string): string {
  return prefix.trim() ? `${instructions}\n\nMEMORIA (resumen de lo que la persona vivió; responde desde aquí lo que puedas y cita así: [[id]]):\n${prefix.trim()}` : instructions;
}

const OWNER = { type: "string", enum: ["me", "lente", "other"], description: "me: la persona; lente: algo que Lente puede hacer; other: lo hace otra persona" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

export const VOICE_FUNCTIONS: FunctionSpec[] = [
  {
    name: "ask_memory",
    description: "Busca en la memoria de la persona (reuniones, lo que oyó y vio, recuerdos, resúmenes por día y semana). Devuelve líneas con ids o una respuesta con sus fuentes; responde desde ellas.",
    parameters: obj({ question: { type: "string", description: "La pregunta, completa y en español" }, project: { type: "string", description: "Id de proyecto (p1…) para buscar solo ahí" }, when: { type: "string", description: "Cuándo, como lo dijo la persona («ayer», «el martes»), si lo dijo" }, person: { type: "string", description: "De quién o con quién, si lo dijo" } }, ["question"]),
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
    name: "look",
    description: "Mira por la cámara de las gafas (o del teléfono) ahora y responde la pregunta de la persona sobre lo que hay enfrente. mode read devuelve todo el texto que se ve.",
    parameters: obj({ question: { type: "string", description: "La pregunta, como la dijo la persona («¿qué tengo en la mano?»)" }, mode: { type: "string", enum: ["describe", "read"] } }, ["question"]),
  },
  {
    name: "delegate",
    description: "Pasa un trabajo a un agente. Queda pendiente de la aprobación de la persona; no se ejecuta nada.",
    parameters: obj({ instruction: { type: "string" }, agent: { type: "string", description: "A quién, si lo dijo" } }, ["instruction"]),
  },
];

/** Ver's companion: its own tools, plus the memory to recall what was read or said. */
export const SIGHT_FUNCTIONS: FunctionSpec[] = [
  ...VOICE_FUNCTIONS.filter((f) => f.name === "look" || f.name === "ask_memory" || f.name === "add_task"),
  {
    name: "remember_person",
    description: "Recuerda lo que la persona te contó en la bienvenida: su nombre, su edad y para qué quiere tu ayuda. Lente lo recuerda mientras esté encendida.",
    parameters: obj({ name: { type: "string" }, age: { type: "string", description: "Como lo dijo («treinta y dos», «32»)" }, wants: { type: "string", description: "Para qué quiere tu ayuda, en pocas palabras" } }, ["name"]),
  },
  {
    name: "where_am_i",
    description: "Pide al teléfono su ubicación y devuelve la dirección aproximada (calle, barrio, ciudad) y un lugar conocido si lo hay.",
    parameters: obj({}),
  },
  {
    name: "quiet_mode",
    description: "on true: dejas de hablar y de narrar, y sigues grabando el audio y los recuerdos del día hasta que la persona vuelva a hablarte. on false: vuelves a conversar.",
    parameters: obj({ on: { type: "boolean" } }, ["on"]),
  },
  {
    name: "narrate",
    description: "Enciende (on true) o apaga (on false) la narración continua de lo que hay frente a la persona.",
    parameters: obj({ on: { type: "boolean" } }, ["on"]),
  },
];

/**
 * The language coach's tools (add-language-coach design decision 3). `look` names things in the target
 * language; `pronounce` and the look say their phrases themselves, in the target voice.
 */
export const COACH_FUNCTIONS: FunctionSpec[] = [
  {
    name: "pronounce",
    description: "Dice en voz alta, con la voz del idioma que la persona aprende, una palabra o frase corta para aprender, y la muestra grande en el teléfono con su significado. Úsala para cada frase en ese idioma que la persona deba oír o repetir.",
    parameters: obj({ text: { type: "string", description: "La frase en el idioma que aprende, con su artículo si es un sustantivo («o garfo»)" }, meaning: { type: "string", description: "Lo que significa, en español («el tenedor»)" } }, ["text", "meaning"]),
  },
  {
    name: "look",
    description: "Mira por la cámara de las gafas ahora y nombra hasta tres cosas que se ven, en el idioma que la persona aprende, con su artículo y su significado. Los nombres se dicen en voz alta solos.",
    parameters: obj({ question: { type: "string", description: "La pregunta, como la dijo la persona («¿qué es esto?»)" } }, ["question"]),
  },
  {
    name: "check_repeat",
    description: "Compara lo que la persona acaba de decir con la frase que debía repetir. Devuelve understood si la transcripción tiene las palabras clave, o missed y las que faltaron. No es un puntaje de pronunciación.",
    parameters: obj({ expected: { type: "string", description: "La frase que debía repetir, en el idioma que aprende" } }, ["expected"]),
  },
  ...VOICE_FUNCTIONS.filter((f) => f.name === "ask_memory"),
];

// --- The loop -----------------------------------------------------------------------------------

/** Memory lines attached before the wearer's turn (add-memory-engine 5.2): the developer item and what its ids point to. */
export interface AttachedMemory {
  text: string;
  citable: ReadonlyMap<string, VoiceSource>;
}

/** The ids cited as [[id]] (comma or space separated) in a text, in order, once each. */
export function citedIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]]*)\]\]/g)) for (const id of m[1]!.split(/[,\s]+/).filter(Boolean)) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export interface VoiceTurnOptions {
  model: VoiceModel;
  /** Memory lines for this turn, retrieved while the wearer spoke; the model can answer from them in its first step. */
  attached?: AttachedMemory;
  tools: Record<string, VoiceToolHandler>;
  /** Earlier messages of the session, oldest first. */
  history: VoiceItem[];
  utterance: string;
  signal: AbortSignal;
  emit(event: VoiceTurnEvent): void;
  now?: () => number;
  /** Ver (add-sight-mode): say the whole answer; its person cannot read the rest in a chat. */
  speakAll?: boolean;
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
  const input: VoiceItem[] = [...trimHistory(opts.history), ...(opts.attached ? [{ type: "message" as const, role: "developer" as const, text: opts.attached.text }] : []), { type: "message", role: "user", text: opts.utterance }];
  const citable = new Map(opts.attached?.citable ?? []);
  const usage = emptyUsage();
  const sources: VoiceSource[] = [];
  const tools: string[] = [];
  let finalText = "";
  /** What tools said themselves (the coach's phrases), kept in the chat before the answer. */
  const toolSaid: string[] = [];
  let finalSentences = 0;
  let truncated = false;
  let firstTextMs: number | undefined;
  let firstSentenceMs: number | undefined;
  const cancelled = () => opts.signal.aborted;
  // The chat keeps the answer without its citation markers; the chips carry them.
  const kept = () => [...toolSaid, finalText.replace(/\s*\[\[[^\]]*\]\]/g, "").replace(/[ \t]+([.,;:!?])/g, "$1").trim()].filter(Boolean).join(" ");
  const result = (stopped: VoiceStop, steps: number, error?: string): VoiceTurnResult => ({ stopped, text: kept(), sources, tools, steps, usage, firstTextMs, firstSentenceMs, ...(error ? { error } : {}) });

  const say = (text: string, commentary: boolean) => {
    if (cancelled()) return;
    if (!commentary) {
      if (!opts.speakAll && finalSentences >= MAX_SPOKEN_SENTENCES) return void (truncated = true);
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
      // The memory lines the answer cited become chips; ids it was never shown are dropped.
      const cited = citedIds(finalText).map((id) => citable.get(id)).filter((x): x is VoiceSource => Boolean(x)).filter((x, i, all) => all.findIndex((o) => o.label === x.label) === i);
      if (cited.length) {
        sources.push(...cited);
        opts.emit({ kind: "sources", sources: cited });
      }
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
      for (const [id, source] of outcome.citable ?? []) citable.set(id, source);
      opts.emit({ kind: "tool", name: call.name, label: outcome.label });
      if (outcome.sources?.length) {
        sources.push(...outcome.sources);
        opts.emit({ kind: "sources", sources: outcome.sources });
      }
      for (const line of outcome.say ?? []) {
        if (line.meaning) opts.emit({ kind: "pronounce", text: line.phrase ?? line.text, meaning: line.meaning, lang: line.lang });
        if (firstSentenceMs === undefined) firstSentenceMs = now() - started;
        toolSaid.push(line.text);
        opts.emit({ kind: "sentence", text: line.text, commentary: false, lang: line.lang });
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
