// Agent jobs (add-agent-bridge, design decisions 7 to 9), pure. A job is an action with tool
// `run_agent`: it waits in "Por aprobar" like any proposal, and approving it never runs anything in
// the hub; it only marks the job queued for the bridge on the user's machine. The job's progress
// lives in the action's outcome: queued → running (the bridge claimed it) → done or failed.

import type { PendingAction } from "./action-store.ts";

export const TOOL_RUN_AGENT = "run_agent";
export const JOB_AGENTS = ["claude", "codex"] as const;
export type JobAgent = (typeof JOB_AGENTS)[number];
/** What the phone and the chat call each agent. */
export const AGENT_NAMES: Record<JobAgent, string> = { claude: "Claude Code", codex: "Codex" };
export const INSTRUCTION_MAX_CHARS = 2000;
export const SUMMARY_MAX_CHARS = 2000;
/** A folder is named by the bridge's config (a name or one of its paths); this only bounds the text. */
export const WORKDIR_MAX_CHARS = 200;

export interface JobArgs {
  agent: JobAgent;
  instruction: string;
  /** A folder name or path from the bridge's allow list; absent means the bridge's default. */
  workdir?: string;
  /** The task this job does; it is marked done when the agent exits with 0. */
  taskId?: string;
}

export type JobState = "queued" | "running" | "done" | "failed";

export interface JobOutcome {
  state: JobState;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number;
  summary?: string;
}

/** What the bridge gets for one queued job: nothing else of the user's. */
export interface JobView extends JobArgs {
  id: string;
}

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/**
 * The job arguments a request or an approval carries, or why they are refused. `taskTitle` finds
 * the user's task by id (undefined when there is none). A task's job uses its title when no
 * instruction is given.
 */
export function jobArgs(input: unknown, taskTitle: (id: string) => string | undefined): { ok: true; args: JobArgs } | { ok: false; status: number; error: string } {
  const b = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const agent = b.agent ?? "claude";
  if (!JOB_AGENTS.includes(agent as JobAgent)) return { ok: false, status: 400, error: `agent must be one of ${JOB_AGENTS.join(", ")}` };
  const taskId = typeof b.taskId === "string" && b.taskId ? b.taskId : undefined;
  const title = taskId === undefined ? undefined : taskTitle(taskId);
  if (taskId !== undefined && title === undefined) return { ok: false, status: 404, error: "no such task" };
  if (typeof b.instruction === "string" && b.instruction.length > INSTRUCTION_MAX_CHARS) return { ok: false, status: 400, error: `instruction is longer than ${INSTRUCTION_MAX_CHARS} characters` };
  const instruction = clean(b.instruction, INSTRUCTION_MAX_CHARS) || title || "";
  if (!instruction) return { ok: false, status: 400, error: "give an instruction or a taskId" };
  const workdir = clean(b.workdir, WORKDIR_MAX_CHARS);
  if (typeof b.workdir === "string" && b.workdir.length > WORKDIR_MAX_CHARS) return { ok: false, status: 400, error: `workdir is longer than ${WORKDIR_MAX_CHARS} characters` };
  return { ok: true, args: { agent: agent as JobAgent, instruction, ...(workdir ? { workdir } : {}), ...(taskId ? { taskId } : {}) } };
}

const isJob = (a: PendingAction): boolean => a.tool === TOOL_RUN_AGENT;
export const outcomeOf = (a: PendingAction): JobOutcome | undefined => (isJob(a) && typeof a.outcome === "object" && a.outcome !== null ? (a.outcome as JobOutcome) : undefined);

/** Approved jobs the bridge has not picked up yet, oldest first. Pending and rejected jobs never show. */
export function queuedJobs(actions: PendingAction[]): JobView[] {
  return actions
    .filter((a) => isJob(a) && a.status === "approved" && outcomeOf(a)?.state === "queued")
    .sort((a, b) => (a.decidedAt ?? a.createdAt) - (b.decidedAt ?? b.createdAt))
    .map((a) => ({ id: a.id, ...(a.args as unknown as JobArgs) }));
}

/** An approved job as it is saved: queued, nothing run. */
export const queued = (a: PendingAction): PendingAction => ({ ...a, outcome: { state: "queued" } satisfies JobOutcome });

export type JobStep = { ok: true; action: PendingAction } | { ok: false; status: number; error: string };

/** The bridge takes a queued job; a second claim (or a claim of anything else) is refused. */
export function claim(a: PendingAction | undefined, now: number): JobStep {
  if (!a || !isJob(a)) return { ok: false, status: 404, error: "no such job" };
  const state = outcomeOf(a)?.state;
  if (a.status !== "approved" || state !== "queued") return { ok: false, status: 409, error: a.status === "pending" ? "the job is not approved" : `the job is ${state ?? a.status}` };
  return { ok: true, action: { ...a, outcome: { state: "running", startedAt: now } satisfies JobOutcome } };
}

/** The result body the bridge posts. */
export function parseResult(body: unknown): { exitCode: number; summary: string } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (!Number.isInteger(b.exitCode)) return undefined;
  const summary = typeof b.summary === "string" ? b.summary : "";
  return { exitCode: b.exitCode as number, summary: summary.length > SUMMARY_MAX_CHARS ? summary.slice(-SUMMARY_MAX_CHARS) : summary };
}

/** A running job closes: exit 0 is done, anything else failed (and the action shows as failed). */
export function finish(a: PendingAction | undefined, result: { exitCode: number; summary: string }, now: number): JobStep {
  if (!a || !isJob(a)) return { ok: false, status: 404, error: "no such job" };
  const outcome = outcomeOf(a);
  if (a.status !== "approved" || outcome?.state !== "running") return { ok: false, status: 409, error: `the job is ${outcome?.state ?? a.status}, not running` };
  const done = result.exitCode === 0;
  return { ok: true, action: { ...a, status: done ? "approved" : "failed", outcome: { ...outcome, state: done ? "done" : "failed", finishedAt: now, exitCode: result.exitCode, summary: result.summary } satisfies JobOutcome } };
}

/**
 * A job still running after this long was lost: the bridge stops its agent at 15 minutes and
 * reports, so silence past that (and a margin for the report) means the bridge died or lost the hub.
 */
export const JOB_LOST_AFTER_MS = 20 * 60_000;
export const LOST_SUMMARY = "El puente no avisó cómo terminó: se cerró o perdió la conexión con Lente.";

/** The job as failed when it was lost; undefined when it is not a running job past the limit. */
export function expireLost(a: PendingAction, now: number): PendingAction | undefined {
  const outcome = outcomeOf(a);
  if (a.status !== "approved" || outcome?.state !== "running" || now - (outcome.startedAt ?? now) <= JOB_LOST_AFTER_MS) return undefined;
  return { ...a, status: "failed", outcome: { ...outcome, state: "failed", finishedAt: now, summary: LOST_SUMMARY } satisfies JobOutcome };
}

// --- The chat: telling a command from a question (decision 9) -----------------------------------

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The question asks for something to be done, not answered: an imperative verb at the start of a
 * clause, or a named agent asked to act. A plain question never passes, whatever the model says.
 */
export function asksForAction(question: string): boolean {
  const q = fold(question);
  if (/\b(que|dile a|pidele a|pide a|ask|tell|have)\s+(claude|codex)\b/.test(q)) return true;
  if (/\b(claude|codex)\s*[,:]/.test(q)) return true;
  const VERBS = "haz|hazme|hagan|haga|ejecuta|ejecutalo|corre|correr|crea|creame|escribe|escribeme|actualiza|arregla|corrige|implementa|redacta|genera|programa|agrega|anade|borra|elimina|refactoriza|run|do|make|fix|implement|write|update|create";
  return new RegExp(`(^|[.!¿?;,]\\s*|\\bpor favor\\s+|\\bplease\\s+)(${VERBS})\\b`).test(q.trim());
}

/** The job the chat proposes, when the model marked a command and the question asks for one. */
export function chatCommand(raw: { intent?: unknown; agent?: unknown; instruction?: unknown }, question: string): { agent: JobAgent; instruction: string } | undefined {
  if (raw.intent !== "command" || !asksForAction(question)) return undefined;
  const instruction = clean(raw.instruction, INSTRUCTION_MAX_CHARS) || clean(question, INSTRUCTION_MAX_CHARS);
  if (!instruction) return undefined;
  const named = /\bcodex\b/.test(fold(question)) ? "codex" : /\bclaude\b/.test(fold(question)) ? "claude" : undefined;
  const agent = named ?? (JOB_AGENTS.includes(raw.agent as JobAgent) ? (raw.agent as JobAgent) : "claude");
  return { agent, instruction };
}

/** What the chat answers once the job is queued. */
export const proposedAnswer = (agent: JobAgent, instruction: string): string =>
  `Lo dejé en «Por aprobar»: ${AGENT_NAMES[agent]} hará «${instruction.length > 160 ? `${instruction.slice(0, 157)}…` : instruction}». Nada corre hasta que lo apruebes.`;
