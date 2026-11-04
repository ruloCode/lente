// The voice agent's tools (add-voice-mode) over what the hub already keeps: the tiered memory,
// projects, tasks with owners and the record sheet. Pure apart from the injected backend. The model
// sees short ids (t1, p1) that map to real ids within one session, and only ids it was shown are
// accepted. Completing and deleting never act here: they leave one pending action that the next
// spoken "sí" runs (`confirmPending`), so a slip of the model cannot remove anything.

import { TASK_OWNERS, type Task, type TaskOwner, ownerOf } from "./agent-tools.ts";
import type { AskSource } from "./ask.ts";
import type { ToolOutcome, VoiceSource, VoiceToolHandler } from "./voice-agent.ts";

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
  look?(question: string, mode: "describe" | "read"): Promise<{ ok: boolean; text: string }>;
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
