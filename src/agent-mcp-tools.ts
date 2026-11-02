// Lente's tools for outside agents (add-agent-bridge, design decisions 3 to 5). Each tool names the
// scope it needs and calls an `AgentApi` that one wearer runtime implements, so an agent reads the
// same stores as the phone. Pure but for that API: the checks (rate, scope, pause, arguments) run
// here, in that order, and every call that runs is noted in the day with a fixed sentence and no
// content. Tool failures are results with `isError` and a code; an unknown tool is a protocol error.

import type { AgentIdentity, AgentScope } from "./user-devices.ts";
import { McpError, type McpServer, type McpToolDefinition, RPC, type ToolResult } from "./mcp.ts";

export const TASK_WHO = ["me", "lente", "other"] as const;
export type TaskWho = (typeof TASK_WHO)[number];

/** What an agent's failed call says, so a script can branch on it. */
export const TOOL_ERRORS = ["unauthorized", "not_found", "rate_limited", "paused_by_wearer", "invalid_arguments", "unavailable"] as const;
export type ToolErrorCode = (typeof TOOL_ERRORS)[number];

/** Calls one token may make in a burst, and how many it earns back per minute. */
export const AGENT_CALLS_BURST = 60;
export const AGENT_CALLS_PER_MIN = 60;
/** Default and bounds of `get_meeting`'s transcript, in characters. */
export const MEETING_CHARS_DEFAULT = 8000;
export const MEETING_CHARS_MIN = 200;
export const MEETING_CHARS_MAX = 50_000;
const QUESTION_MAX = 500;
const QUERY_MAX = 200;
const TITLE_MAX = 140;

export interface TaskView {
  id: string;
  title: string;
  who: TaskWho;
  otherName: string | null;
  due: string | null;
  done: boolean;
  project: string | null;
  meetingId: string | null;
  createdAt: number;
}

export interface TaskFilter {
  who?: TaskWho;
  /** A project id or name; unknown → `not_found`. */
  project?: string;
  open: boolean;
}

/** The runtime behind the tools: one user's stores. `undefined` means "no such thing for this user". */
export interface AgentApi {
  /** The wearer turned agents off (`POST /agents/pause`). */
  paused(): boolean;
  ask(question: string, project?: string): Promise<{ answer: string; found: boolean; sources: { label: string; meetingId?: string }[] } | "no_project" | "unavailable">;
  /** `from` and `to` are local days as `YYYY-MM-DD`, both inclusive. */
  searchMeetings(query: string, from?: string, to?: string): Promise<{ id: string; title: string; startedAt: number; matches: { where: string; line: string }[] }[]>;
  getMeeting(id: string, maxChars: number): Promise<Record<string, unknown> | undefined>;
  projects(): Promise<object[]>;
  tasks(filter: TaskFilter): Promise<TaskView[] | "no_project">;
  createTask(input: { title: string; who: TaskWho; otherName?: string; due?: string }): Promise<TaskView>;
  updateTask(id: string, patch: { title?: string; who?: TaskWho; otherName?: string }): Promise<TaskView | undefined>;
  completeTask(id: string): Promise<TaskView | undefined>;
  /** One line in the day: which tool, which token, a fixed sentence. Never arguments or results. */
  note(tool: string, client: string, sentence: string): void;
}

interface AgentTool extends McpToolDefinition {
  scope: AgentScope;
  /** What the day says, without content. */
  sentence: string;
  run(args: Record<string, unknown>, api: AgentApi): Promise<ToolResult>;
}

/** A failed call as the agent sees it: the code first, then why. */
export function toolError(code: ToolErrorCode, message: string): ToolResult {
  return { content: [{ type: "text", text: `${code}: ${message}` }], structuredContent: { error: code, message }, isError: true };
}

const ok = (value: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

class BadArguments extends Error {}

const str = (args: Record<string, unknown>, key: string, max: number, required: boolean): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new BadArguments(`${key} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new BadArguments(`${key} must be a string`);
  const clean = v.replace(/\s+/g, " ").trim();
  if (!clean && required) throw new BadArguments(`${key} is required`);
  if (clean.length > max) throw new BadArguments(`${key} is longer than ${max} characters`);
  return clean || undefined;
};
const who = (args: Record<string, unknown>, key = "who"): TaskWho | undefined => {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!TASK_WHO.includes(v as TaskWho)) throw new BadArguments(`${key} must be one of ${TASK_WHO.join(", ")}`);
  return v as TaskWho;
};
/** A calendar day as `YYYY-MM-DD`; the hub reads it in the user's time zone. */
const day = (args: Record<string, unknown>, key: string): string | undefined => {
  const v = str(args, key, 10, false);
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new BadArguments(`${key} must be a date as YYYY-MM-DD`);
  return v;
};

const S = (properties: Record<string, object>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const ID = { type: "string", description: "The task id, from list_tasks or create_task" };
const WHO = { type: "string", enum: [...TASK_WHO], description: "me: the user does it; lente: an agent can do it; other: someone else committed to it" };
const READ = { readOnlyHint: true, openWorldHint: false };

export const AGENT_TOOLS: readonly AgentTool[] = [
  {
    name: "ask_lente",
    title: "Ask Lente",
    description: "Ask the user's Lente memory (their meetings, what was heard and seen, kept facts) a question. Answers in Spanish, only from the memory, with the meetings it comes from; found=false when the memory does not say.",
    inputSchema: S({ question: { type: "string", maxLength: QUESTION_MAX }, project: { type: "string", description: "Only this project's meetings: a project id or name from list_projects" } }, ["question"]),
    annotations: READ,
    scope: "read",
    sentence: "Un agente le preguntó algo a tu memoria",
    async run(args, api) {
      const out = await api.ask(str(args, "question", QUESTION_MAX, true)!, str(args, "project", 120, false));
      if (out === "no_project") return toolError("not_found", "no such project");
      if (out === "unavailable") return toolError("unavailable", "Lente has no model to answer with right now");
      return ok(out);
    },
  },
  {
    name: "search_meetings",
    title: "Search meetings",
    description: "Find the user's meetings whose title, notes or transcript contain the text (accents and case ignored). Newest first, with the matching lines.",
    inputSchema: S({ query: { type: "string", maxLength: QUERY_MAX }, from: { type: "string", description: "YYYY-MM-DD, inclusive" }, to: { type: "string", description: "YYYY-MM-DD, inclusive" } }, ["query"]),
    annotations: READ,
    scope: "read",
    sentence: "Un agente buscó en tus reuniones",
    async run(args, api) {
      const query = str(args, "query", QUERY_MAX, true)!;
      return ok({ meetings: await api.searchMeetings(query, day(args, "from"), day(args, "to")) });
    },
  },
  {
    name: "get_meeting",
    title: "Get a meeting",
    description: "One meeting of the user: title, dates, project, notes (summary, decisions, commitments, open questions) and the transcript as text, cut at max_chars.",
    inputSchema: S({ id: { type: "string", description: "A meeting id from search_meetings" }, max_chars: { type: "integer", minimum: MEETING_CHARS_MIN, maximum: MEETING_CHARS_MAX, description: `Transcript characters, ${MEETING_CHARS_DEFAULT} by default` } }, ["id"]),
    annotations: READ,
    scope: "read",
    sentence: "Un agente leyó una de tus reuniones",
    async run(args, api) {
      const id = str(args, "id", 80, true)!;
      const raw = args.max_chars;
      if (raw !== undefined && (!Number.isInteger(raw) || (raw as number) < MEETING_CHARS_MIN || (raw as number) > MEETING_CHARS_MAX)) throw new BadArguments(`max_chars must be an integer from ${MEETING_CHARS_MIN} to ${MEETING_CHARS_MAX}`);
      const meeting = await api.getMeeting(id, (raw as number | undefined) ?? MEETING_CHARS_DEFAULT);
      return meeting ? ok(meeting) : toolError("not_found", "no such meeting");
    },
  },
  {
    name: "list_projects",
    title: "List projects",
    description: "The user's projects with their meeting count, open tasks and the next task.",
    inputSchema: S({}),
    annotations: READ,
    scope: "read",
    sentence: "Un agente consultó tus proyectos",
    async run(_args, api) {
      return ok({ projects: await api.projects() });
    },
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "The user's tasks, each with who does it (me, lente, other), its project and meeting. Open tasks only unless open=false.",
    inputSchema: S({ who: WHO, project: { type: "string", description: "A project id or name" }, open: { type: "boolean", description: "true (default): only tasks not done" } }),
    annotations: READ,
    scope: "read",
    sentence: "Un agente consultó tus tareas",
    async run(args, api) {
      if (args.open !== undefined && typeof args.open !== "boolean") throw new BadArguments("open must be a boolean");
      const tasks = await api.tasks({ who: who(args), project: str(args, "project", 120, false), open: args.open !== false });
      return tasks === "no_project" ? toolError("not_found", "no such project") : ok({ tasks });
    },
  },
  {
    name: "create_task",
    title: "Create a task",
    description: "Add a task to the user's list. who defaults to me.",
    inputSchema: S({ title: { type: "string", maxLength: TITLE_MAX }, who: WHO, other_name: { type: "string", description: "Who committed to it, when who is other" }, due: { type: "string", description: "When it is due, as said (\"viernes\", \"2026-11-06\")" } }, ["title"]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    scope: "tasks.write",
    sentence: "Un agente creó una tarea",
    async run(args, api) {
      const w = who(args) ?? "me";
      const otherName = w === "other" ? str(args, "other_name", 60, false) : undefined;
      const due = str(args, "due", 40, false);
      return ok({ task: await api.createTask({ title: str(args, "title", TITLE_MAX, true)!, who: w, ...(otherName ? { otherName } : {}), ...(due ? { due } : {}) }) });
    },
  },
  {
    name: "update_task",
    title: "Update a task",
    description: "Change a task's title or who does it.",
    inputSchema: S({ id: ID, title: { type: "string", maxLength: TITLE_MAX }, who: WHO, other_name: { type: "string" } }, ["id"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    scope: "tasks.write",
    sentence: "Un agente cambió una tarea",
    async run(args, api) {
      const id = str(args, "id", 80, true)!;
      const title = str(args, "title", TITLE_MAX, false);
      const w = who(args);
      const otherName = str(args, "other_name", 60, false);
      if (!title && !w && !otherName) throw new BadArguments("give title, who or other_name to change");
      const task = await api.updateTask(id, { ...(title ? { title } : {}), ...(w ? { who: w } : {}), ...(otherName ? { otherName } : {}) });
      return task ? ok({ task }) : toolError("not_found", "no such task");
    },
  },
  {
    name: "complete_task",
    title: "Complete a task",
    description: "Mark one of the user's tasks done.",
    inputSchema: S({ id: ID }, ["id"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    scope: "tasks.write",
    sentence: "Un agente marcó una tarea como hecha",
    async run(args, api) {
      const task = await api.completeTask(str(args, "id", 80, true)!);
      return task ? ok({ task }) : toolError("not_found", "no such task");
    },
  },
];

/** A token bucket per agent token: `AGENT_CALLS_BURST` at once, refilled at `AGENT_CALLS_PER_MIN`. */
export class CallLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly burst: number;
  private readonly perMs: number;

  constructor(burst = AGENT_CALLS_BURST, perMinute = AGENT_CALLS_PER_MIN) {
    this.burst = burst;
    this.perMs = perMinute / 60_000;
  }

  /** True when the call may go ahead, and spends one call. */
  take(key: string, now: number): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + (now - b.at) * this.perMs);
    b.at = now;
    this.buckets.set(key, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

const SERVER_INFO = { name: "lente", version: "0.1.0" };
const INSTRUCTIONS =
  "Lente is the user's meeting memory: what was said in their meetings, their projects and their tasks. " +
  "Use ask_lente for questions about what was said or agreed, search_meetings and get_meeting to read the source, " +
  "and list_tasks for what is pending. Answers are in Spanish. Tasks with who=lente are ones an agent may do.";

/** The MCP server one agent token sees: its tools by scope, every call checked and noted. */
export function agentServer(agent: AgentIdentity, api: AgentApi, limiter: CallLimiter, now: () => number = Date.now): McpServer {
  const allowed = (t: AgentTool) => agent.scopes.includes(t.scope);
  return {
    info: SERVER_INFO,
    instructions: INSTRUCTIONS,
    tools: () => AGENT_TOOLS.filter(allowed).map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
    async call(name, args) {
      const tool = AGENT_TOOLS.find((t) => t.name === name);
      if (!tool) throw new McpError(RPC.invalidParams, `Unknown tool: ${name.slice(0, 80)}`);
      if (!limiter.take(agent.deviceId, now())) return toolError("rate_limited", `more than ${AGENT_CALLS_PER_MIN} calls a minute; wait and retry`);
      if (!allowed(tool)) return toolError("unauthorized", `this token lacks the ${tool.scope} scope; create one with it in Ajustes → Cuenta → Dispositivos`);
      if (api.paused()) return toolError("paused_by_wearer", "the user paused agent access in Lente");
      try {
        const out = await tool.run(args, api);
        api.note(tool.name, agent.label, tool.sentence);
        return out;
      } catch (error) {
        if (error instanceof BadArguments) return toolError("invalid_arguments", error.message);
        throw error;
      }
    },
  };
}
