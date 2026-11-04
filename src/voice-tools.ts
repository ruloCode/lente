// The voice agent's tools (add-voice-mode) over what the hub already keeps: the tiered memory,
// projects, tasks with owners and the record sheet. Pure apart from the injected backend. The model
// sees short ids (t1, p1) that map to real ids within one session, and only ids it was shown are
// accepted. Completing and deleting never act here: they leave one pending action that the next
// spoken "sí" runs (`confirmPending`), so a slip of the model cannot remove anything.

import { TASK_OWNERS, type Task, type TaskOwner, ownerOf } from "./agent-tools.ts";
import type { AskSource } from "./ask.ts";
import { type Band, type CoachLang, checkRepeat, coachLookPrompt, parseNames, seenLine } from "./coach.ts";
import type { ToolOutcome, VoiceSource, VoiceToolHandler } from "./voice-agent.ts";

/** Longest phrase `pronounce` says, and its meaning. */
const MAX_PHRASE_CHARS = 120;

/** What the coach's tools need from their session (add-language-coach). */
export interface CoachSession {
  lang: CoachLang;
  band: Band;
  /** What the wearer said in the turn being answered. */
  heard(): string;
  /** The phrase just said, so the wearer's repeat of it is not taken for Lente's echo. */
  pronounced(text: string): void;
  /** The placement (2.3): ends it, runs the estimate and returns the line to say; absent outside `mode: "placement"`. */
  finishPlacement?(): Promise<string>;
}

/** Longest task title kept, as on the phone. */
const MAX_TITLE_CHARS = 140;
/** Tasks listed to the model at once; the rest are counted. */
export const MAX_LISTED_TASKS = 15;

export interface VoiceProject {
  id: string;
  name: string;
  openTasks: number;
}

export interface VoiceTask extends Task {
  /** The task's project, from its own field or its meeting's. */
  projectIdResolved?: string;
}

export type VoiceAnswer = { ok: true; answer: string; found: boolean; sources: AskSource[] } | { ok: false; message: string };

/** What the tools need from the wearer's runtime. */
export interface VoiceBackend {
  ask(question: string, projectId: string | undefined): Promise<VoiceAnswer>;
  /**
   * Fast recall (add-memory-engine 5.3): the memory lines for a question, with optional time and person
   * filters, for the voice model to answer from. Without it, `ask_memory` returns a nested answer.
   */
  lines?(question: string, projectId: string | undefined, filters: { when?: string; person?: string }): Promise<{ lines: string[]; citable: Map<string, AskSource> }>;
  projects(): Promise<VoiceProject[]>;
  tasks(): Promise<VoiceTask[]>;
  addTask(task: { title: string; who: TaskOwner; otherName?: string; due?: string; projectId?: string; source: "manual" | "agent" }): Promise<Task>;
  setDone(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  reassign(id: string, who: TaskOwner, otherName?: string): Promise<boolean>;
  openRecordSheet(choice: { projectId?: string; projectName?: string; camera: boolean }): void;
  /** Ver (add-sight-mode): a fresh frame from the glasses or the phone, and the answer to the question about it. */
  look?(question: string, mode: "describe" | "read", coach?: { prompt: string }): Promise<{ ok: boolean; text: string }>;
  /** The coach's placement estimate (add-language-coach 2.3): one structured call, the raw JSON reply. */
  estimate?(system: string, user: string, schema: object): Promise<string>;
  /** Ver: what the person told Lente in the welcome (runtime memory only). */
  rememberPerson?(person: { name: string; age?: string; wants?: string }): void;
  /** Ver: the live narration on or off. */
  setNarration?(on: boolean): void;
  /** Ver: record quietly (audio and memories, no narration) until the person talks again. */
  setQuiet?(on: boolean): void;
  /** Ver: where the phone is, as an address, asked of the phone on demand; never stored. */
  locate?(): Promise<{ ok: true; address: string; place?: string; accuracy?: number } | { ok: false; reason: string }>;
}

export interface PendingAction {
  kind: "complete" | "delete";
  taskId: string;
  title: string;
}

const str = (v: unknown, max = 400): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const ownerOrUndefined = (v: unknown): TaskOwner | undefined => (TASK_OWNERS.includes(v as TaskOwner) ? (v as TaskOwner) : undefined);
const OWNER_WORDS: Record<TaskOwner, string> = { me: "tuya", lente: "de Lente", other: "de otra persona" };

/** Memory sources as chips: kinds and labels only, as the chat shows them. */
export function memorySources(sources: AskSource[]): VoiceSource[] {
  return sources.map((s) => ({ kind: s.kind, label: s.label, ...(s.meetingId ? { meetingId: s.meetingId } : {}), ...(s.turnId ? { turnId: s.turnId } : {}) }));
}

/** Short ids for one session: the same real id always gets the same short id. */
class Refs {
  private byShort = new Map<string, string>();
  private byReal = new Map<string, string>();
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  short(real: string): string {
    let s = this.byReal.get(real);
    if (!s) {
      s = `${this.prefix}${this.byReal.size + 1}`;
      this.byReal.set(real, s);
      this.byShort.set(s, real);
    }
    return s;
  }

  real(short: unknown): string | undefined {
    return typeof short === "string" ? this.byShort.get(short.trim().toLowerCase()) : undefined;
  }
}

export class VoiceTools {
  private backend: VoiceBackend;
  private tasks = new Refs("t");
  private projects = new Refs("p");
  /** The one action waiting for a spoken yes. */
  pending: PendingAction | undefined;

  constructor(backend: VoiceBackend) {
    this.backend = backend;
  }

  /** The active projects with their short ids, for the instructions. */
  async projectRefs(): Promise<{ id: string; name: string }[]> {
    return (await this.backend.projects()).map((p) => ({ id: this.projects.short(p.id), name: p.name }));
  }

  /** A project id from a short id, or from a name the model passed instead. */
  private async projectOf(v: unknown): Promise<VoiceProject | undefined> {
    if (v === undefined || v === null || v === "") return undefined;
    const list = await this.backend.projects();
    for (const p of list) this.projects.short(p.id);
    const real = this.projects.real(v);
    if (real) return list.find((p) => p.id === real);
    const name = str(v, 60).toLowerCase();
    return list.find((p) => p.name.toLowerCase() === name);
  }

  private async taskOf(v: unknown): Promise<VoiceTask | undefined> {
    const real = this.tasks.real(v);
    return real ? (await this.backend.tasks()).find((t) => t.id === real && !t.done) : undefined;
  }

  private unknownTask(v: unknown): ToolOutcome {
    return { result: { error: `no task ${str(v, 20) || "(empty)"} in this conversation; call list_tasks and use its ids` }, label: "Revisando tus tareas" };
  }

  /**
   * The language coach's tools (add-language-coach 2.1): `pronounce` and the look say their phrases in
   * the target language themselves; `check_repeat` compares the wearer's turn with the phrase.
   */
  coachHandlers(coach: CoachSession): Record<string, VoiceToolHandler> {
    const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const sentence = (s: string) => (/[.!?…]$/.test(s) ? capital(s) : `${capital(s)}.`);
    return {
      ask_memory: this.handlers().ask_memory!,
      pronounce: (args) => {
        const text = str(args.text, MAX_PHRASE_CHARS).replace(/^[«"“]|[»"”]$/g, "");
        const meaning = str(args.meaning, MAX_PHRASE_CHARS);
        if (!text) return { result: { error: "text is empty" }, label: "Pronunciando" };
        coach.pronounced(text);
        return {
          result: { ok: true, said: text, note: "ya se dijo en voz alta con la voz del idioma; no la repitas" },
          label: `«${text}»`,
          say: [{ text: sentence(text), phrase: text, lang: coach.lang, meaning: meaning || text }],
        };
      },
      look: async (args) => {
        const question = str(args.question, 300) || "¿Qué es esto?";
        if (!this.backend.look) return { result: { error: "no camera on this hub" }, label: "Mirando" };
        const seen = await this.backend.look(question, "describe", { prompt: coachLookPrompt(coach.lang, coach.band) });
        if (!seen.ok) return { result: { error: seen.text }, label: "Mirando por la cámara" };
        const names = parseNames(seen.text);
        if (!names.length) return { result: { ok: true, names: [], note: "no se ve nada claro; sugiere acercar la cámara o más luz" }, label: "Mirando por la cámara" };
        coach.pronounced(names[0]!.text);
        return {
          result: { ok: true, names: names.map((n) => `${n.text} = ${n.meaning}`), note: "los nombres ya se dijeron en voz alta; no los repitas" },
          label: names.map((n) => n.text).join(" · "),
          say: names.map((n, i) => ({ text: seenLine(n, coach.lang, i === 0), phrase: n.text, lang: coach.lang, meaning: n.meaning })),
        };
      },
      finish_placement: async () => {
        if (!coach.finishPlacement) return { result: { error: "no placement is running; this is the tutor" }, label: "Nivel" };
        const line = await coach.finishPlacement();
        return { result: { ok: true, said: line, note: "el estimado ya se dijo; despídete en una frase corta o no digas nada" }, label: "Tu nivel estimado", say: [{ text: line, lang: "es" }] };
      },
      check_repeat: (args) => {
        const expected = str(args.expected, MAX_PHRASE_CHARS);
        if (!expected) return { result: { error: "expected is empty" }, label: "Escuchando" };
        const verdict = checkRepeat(expected, coach.heard(), coach.lang);
        return { result: { ...verdict, note: "dilo como si lo entendiste o no, nunca como un puntaje" }, label: verdict.result === "understood" ? "Te entendí" : "No te alcancé a entender" };
      },
    };
  }

  handlers(): Record<string, VoiceToolHandler> {
    return {
      ask_memory: async (args) => {
        const question = str(args.question);
        if (!question) return { result: { error: "question is empty" }, label: "Buscando en tu memoria" };
        const project = await this.projectOf(args.project);
        const label = project ? `Buscando en ${project.name}` : "Buscando en tu memoria";
        if (this.backend.lines) {
          // Lines, not an answer: the model answers from them in its next step, citing [[id]].
          const found = await this.backend.lines(question, project?.id, { when: str(args.when, 80) || undefined, person: str(args.person, 80) || undefined });
          const citable = new Map([...found.citable].map(([id, s]) => [id, memorySources([s])[0]!] as const));
          return { result: found.lines.length ? { lines: found.lines, how: "Responde solo desde estas líneas y cita cada una así: [[id]]. Si no responden la pregunta, dilo." } : { lines: [], how: "La memoria no tiene nada sobre esto; dilo." }, label, citable };
        }
        const out = await this.backend.ask(question, project?.id);
        if (!out.ok) return { result: { error: out.message }, label: "Buscando en tu memoria" };
        const sources = memorySources(out.sources);
        return {
          result: { found: out.found, answer: out.answer, sources: sources.map((s) => s.label) },
          label,
          sources,
        };
      },
      list_projects: async () => {
        const list = await this.backend.projects();
        return { result: { projects: list.map((p) => ({ id: this.projects.short(p.id), name: p.name, openTasks: p.openTasks })) }, label: "Revisando tus proyectos" };
      },
      list_tasks: async (args) => {
        const who = ownerOrUndefined(args.who);
        const project = await this.projectOf(args.project);
        const names = new Map((await this.backend.projects()).map((p) => [p.id, p.name]));
        const open = (await this.backend.tasks()).filter((t) => !t.done && (!who || ownerOf(t) === who) && (!project || t.projectIdResolved === project.id));
        const shown = open.slice(0, MAX_LISTED_TASKS);
        return {
          result: {
            total: open.length,
            tasks: shown.map((t) => ({ id: this.tasks.short(t.id), title: t.title, who: ownerOf(t), ...(t.otherName ? { other: t.otherName } : {}), ...(t.due ? { due: t.due } : {}), ...(t.projectIdResolved && names.get(t.projectIdResolved) ? { project: names.get(t.projectIdResolved) } : {}) })),
          },
          label: project ? `Tareas de ${project.name}` : "Revisando tus tareas",
        };
      },
      add_task: async (args) => {
        const title = str(args.title, MAX_TITLE_CHARS);
        if (!title) return { result: { error: "title is empty" }, label: "Agregando una tarea" };
        const who = ownerOrUndefined(args.who) ?? "me";
        const project = await this.projectOf(args.project);
        const otherName = who === "other" ? str(args.other, 60) || undefined : undefined;
        const due = str(args.due, 40) || undefined;
        const task = await this.backend.addTask({ title, who, ...(otherName ? { otherName } : {}), ...(due ? { due } : {}), ...(project ? { projectId: project.id } : {}), source: "manual" });
        return { result: { ok: true, id: this.tasks.short(task.id), title, who, ...(due ? { due } : {}), ...(project ? { project: project.name } : {}) }, label: `Tarea agregada: ${title}` };
      },
      complete_task: async (args) => {
        const task = await this.taskOf(args.id);
        if (!task) return this.unknownTask(args.id);
        this.pending = { kind: "complete", taskId: task.id, title: task.title };
        return { result: { needsConfirmation: true, ask: `¿Marco como hecha «${task.title}»?` }, label: "Esperando tu confirmación" };
      },
      delete_task: async (args) => {
        const task = await this.taskOf(args.id);
        if (!task) return this.unknownTask(args.id);
        this.pending = { kind: "delete", taskId: task.id, title: task.title };
        return { result: { needsConfirmation: true, ask: `¿Borro «${task.title}»?` }, label: "Esperando tu confirmación" };
      },
      reassign_task: async (args) => {
        const task = await this.taskOf(args.id);
        if (!task) return this.unknownTask(args.id);
        const who = ownerOrUndefined(args.who);
        if (!who) return { result: { error: "who must be me, lente or other" }, label: "Cambiando una tarea" };
        const ok = await this.backend.reassign(task.id, who, who === "other" ? str(args.other, 60) || undefined : undefined);
        return { result: ok ? { ok: true, title: task.title, who } : { error: "the task could not be changed" }, label: ok ? `Ahora es ${OWNER_WORDS[who]}: ${task.title}` : "Cambiando una tarea" };
      },
      start_recording: async (args) => {
        const project = await this.projectOf(args.project);
        const camera = args.camera === true;
        this.backend.openRecordSheet({ ...(project ? { projectId: project.id, projectName: project.name } : {}), camera });
        return { result: { ok: true, opened: "record sheet", recording: false, project: project?.name ?? null, camera, note: "nothing records until the wearer taps Grabar" }, label: "Hoja de grabación abierta" };
      },
      look: async (args) => {
        const question = str(args.question, 300) || "¿Qué hay frente a mí?";
        const mode = args.mode === "read" ? "read" : "describe";
        if (!this.backend.look) return { result: { error: "no camera on this hub" }, label: "Mirando" };
        const seen = await this.backend.look(question, mode);
        return { result: seen.ok ? { ok: true, seen: seen.text } : { error: seen.text }, label: mode === "read" ? "Leyendo lo que ves" : "Mirando por la cámara" };
      },
      remember_person: async (args) => {
        const name = str(args.name, 60);
        if (!name) return { result: { error: "name is empty" }, label: "Recordando" };
        const age = str(args.age, 20) || undefined;
        const wants = str(args.wants, 160) || undefined;
        this.backend.rememberPerson?.({ name, ...(age ? { age } : {}), ...(wants ? { wants } : {}) });
        return { result: { ok: true, name, kept: "while Lente is on; not in the database" }, label: `Ya te conozco, ${name}` };
      },
      narrate: async (args) => {
        const on = args.on === true;
        if (!this.backend.setNarration) return { result: { error: "no narration on this hub" }, label: "Narración" };
        this.backend.setNarration(on);
        return { result: { ok: true, narrating: on }, label: on ? "Narración encendida" : "Narración apagada" };
      },
      quiet_mode: async (args) => {
        const on = args.on !== false;
        if (!this.backend.setQuiet) return { result: { error: "no quiet mode on this hub" }, label: "Silencio" };
        this.backend.setQuiet(on);
        return { result: { ok: true, quiet: on, note: on ? "after this reply the conversation closes; Lente keeps recording audio and memories without speaking; a long press on the screen talks again" : "back to conversation" }, label: on ? "Grabando en silencio" : "Conversando" };
      },
      where_am_i: async () => {
        if (!this.backend.locate) return { result: { error: "this phone cannot share its location" }, label: "Buscando dónde estás" };
        const at = await this.backend.locate();
        return at.ok
          ? { result: { ok: true, address: at.address, ...(at.place ? { place: at.place } : {}), ...(at.accuracy !== undefined ? { accuracy_m: Math.round(at.accuracy) } : {}) }, label: "Buscando dónde estás" }
          : { result: { error: at.reason }, label: "Buscando dónde estás" };
      },
      delegate: async (args) => {
        const instruction = str(args.instruction, MAX_TITLE_CHARS - 20);
        if (!instruction) return { result: { error: "instruction is empty" }, label: "Delegando" };
        const agent = str(args.agent, 30);
        const task = await this.backend.addTask({ title: agent ? `${instruction} (para ${agent})` : instruction, who: "lente", source: "agent" });
        return {
          result: { ok: true, id: this.tasks.short(task.id), status: "waiting for the wearer's approval in Tareas, under «Lente puede hacerlo»; nothing has run" },
          label: "Pendiente de tu aprobación",
        };
      },
    };
  }

  /** Runs the pending action after a spoken yes; returns what Lente says. */
  async confirmPending(): Promise<string> {
    const p = this.pending;
    this.pending = undefined;
    if (!p) return "No tenía nada pendiente.";
    const ok = p.kind === "complete" ? await this.backend.setDone(p.taskId) : await this.backend.remove(p.taskId);
    if (!ok) return `No encontré «${p.title}»; puede que ya no esté.`;
    return p.kind === "complete" ? `Listo, marqué «${p.title}» como hecha.` : `Listo, borré «${p.title}».`;
  }

  /** Drops the pending action after a spoken no. */
  cancelPending(): string {
    const p = this.pending;
    this.pending = undefined;
    return p ? `De acuerdo, dejo «${p.title}» como está.` : "De acuerdo.";
  }
}
