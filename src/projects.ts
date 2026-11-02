// Projects (add-projects, design decisions 2 and 3): after a meeting's notes, one structured Muse
// Spark call puts the meeting in one of the user's projects, opens a new one, or leaves it out; the
// summary each project shows on the phone is computed from its meetings and their tasks.
// Pure apart from the model call, which the hub passes in.

import type { ChatMessage } from "./chat.ts";
import type { Meeting } from "./meetings.ts";

export const MAX_PROJECT_NAME_CHARS = 40;
const MAX_SUMMARY_CHARS = 1200;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface Project {
  id: string;
  name: string;
  status: "active" | "archived";
  createdAt: number;
}

export type Assignment = { kind: "existing"; projectId: string } | { kind: "new"; name: string } | { kind: "none" };

/** Lowercased, without accents or repeated spaces: "Lente " and "lénte" are the same project. */
export const sameName = (name: string): string => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

export function cleanName(name: string): string {
  const one = name.replace(/\s+/g, " ").trim().replace(/^["'«]+|["'»]+$/g, "");
  return one.length > MAX_PROJECT_NAME_CHARS ? one.slice(0, MAX_PROJECT_NAME_CHARS).trim() : one;
}

export const assignSchema = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "project", "name"],
  properties: {
    choice: { type: "string", enum: ["existing", "new", "none"] },
    project: { type: "string" },
    name: { type: "string" },
  },
} as const;

const SYSTEM = [
  "Organizas las reuniones del usuario de Lente por proyecto.",
  "Un proyecto es un trabajo que dura semanas o meses: un producto, un cliente, una iniciativa del equipo. No es un tema suelto de una sola reunión.",
  "Si la reunión es de uno de los proyectos de la lista, responde `choice: existing` con su id en `project`.",
  "Si es claramente de un proyecto que no está en la lista, responde `choice: new` y un nombre corto en `name` (el nombre propio del producto, cliente o iniciativa, sin palabras como «proyecto»).",
  "Si no es de ningún proyecto (algo personal, una charla suelta) o no estás seguro, responde `choice: none`.",
  "Deja vacíos los campos que no uses.",
].join("\n");

/** The call's input: the active projects as `P1`…, and the meeting's title, topic and summary. */
export function assignMessages(projects: readonly Project[], meeting: Pick<Meeting, "title" | "topic" | "notes">): ChatMessage[] {
  const active = projects.filter((p) => p.status === "active");
  const list = active.length ? active.map((p, i) => `P${i + 1}: ${p.name}`).join("\n") : "(ninguno todavía)";
  const summary = (meeting.notes?.summary ?? "").replace(/\s+/g, " ").slice(0, MAX_SUMMARY_CHARS);
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Proyectos del usuario:\n${list}\n\nReunión: «${meeting.title || "sin título"}»${meeting.topic ? ` (tema: ${meeting.topic})` : ""}\nResumen: ${summary || "(sin resumen)"}` },
  ];
}

/** The model's JSON as an assignment: an unknown id is none, and a "new" name that already exists is that project. */
export function parseAssignment(raw: string, projects: readonly Project[]): Assignment {
  let out: { choice?: unknown; project?: unknown; name?: unknown };
  try {
    out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return { kind: "none" };
  }
  const active = projects.filter((p) => p.status === "active");
  if (out.choice === "existing" && typeof out.project === "string") {
    const n = Number(/^P(\d+)$/i.exec(out.project.trim())?.[1]);
    const hit = Number.isInteger(n) ? active[n - 1] : undefined;
    return hit ? { kind: "existing", projectId: hit.id } : { kind: "none" };
  }
  if (out.choice === "new" && typeof out.name === "string") {
    const name = cleanName(out.name);
    if (!name) return { kind: "none" };
    const same = projects.find((p) => sameName(p.name) === sameName(name));
    if (same) return { kind: "existing", projectId: same.id };
    return { kind: "new", name };
  }
  return { kind: "none" };
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: Project["status"];
  lastActivityAt: number | null;
  meetings: number;
  meetingsThisWeek: number;
  openTasks: number;
  /** The oldest open task, the one to do next. */
  next: string | null;
}

interface TaskLike {
  title: string;
  meetingId: string;
  done: boolean;
  createdAt: number;
}

/** Each project with what the phone shows; active first, by last activity, newest first. */
export function summarize(
  projects: readonly Project[],
  assignments: ReadonlyMap<string, string>,
  meetings: readonly Pick<Meeting, "id" | "startedAt">[],
  tasks: readonly TaskLike[],
  now: number,
): ProjectSummary[] {
  const out = projects.map((p): ProjectSummary => {
    const own = meetings.filter((m) => assignments.get(m.id) === p.id);
    const ids = new Set(own.map((m) => m.id));
    const open = tasks.filter((t) => !t.done && ids.has(t.meetingId)).sort((a, b) => a.createdAt - b.createdAt);
    const last = own.reduce<number | null>((max, m) => (max === null || m.startedAt > max ? m.startedAt : max), null);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      lastActivityAt: last ?? (p.createdAt || null),
      meetings: own.length,
      meetingsThisWeek: own.filter((m) => m.startedAt >= now - WEEK_MS).length,
      openTasks: open.length,
      next: open[0]?.title ?? null,
    };
  });
  return out.sort((a, b) => (a.status === b.status ? (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) : a.status === "active" ? -1 : 1));
}
