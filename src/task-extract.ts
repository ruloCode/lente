// Tasks from a meeting (add-task-owners, design decision 2): one structured Muse Spark call reads the
// meeting's notes and returns up to eight concrete tasks, each with who does it: the wearer, Lente's
// agent (only what its tools can do), or someone else the wearer follows up with.
// Pure apart from the model call, which the caller passes in.

import type { ChatMessage } from "./chat.ts";
import { TASK_OWNERS, type TaskOwner } from "./agent-tools.ts";
import type { Meeting } from "./meetings.ts";

export const MAX_TASKS_PER_MEETING = 8;
export const MAX_TASK_CHARS = 140;
const MAX_INPUT_CHARS = 6000;

export interface ExtractedTask {
  title: string;
  who: TaskOwner;
  otherName?: string;
  due?: string;
}

export const tasksSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "who", "other", "due"],
        properties: {
          title: { type: "string" },
          who: { type: "string", enum: [...TASK_OWNERS] },
          other: { type: "string" },
          due: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "Sacas las tareas concretas de una reunión del usuario de Lente. Máximo ocho; solo cosas accionables con un resultado claro, no temas ni ideas sueltas. Si no hay ninguna, devuelve una lista vacía.",
  "Escribe cada `title` en español, empezando con un verbo («Enviar la cotización a Ana»).",
  "`who` dice quién la hace:",
  "- `me`: el usuario tiene que hacerla él mismo.",
  "- `lente`: el agente de Lente puede hacerla solo, porque es redactar un correo, poner un recordatorio o preparar un resumen o una minuta a partir de lo que Lente recuerda. Nada más cuenta como `lente`.",
  "- `other`: otra persona se comprometió a hacerla; pon su nombre en `other`.",
  "`due` es la fecha o el plazo tal como se dijo («viernes», «2026-11-07»), o vacío.",
  "Deja `other` vacío cuando `who` no es `other`.",
].join("\n");

/** The meeting's notes as the call's input: title, summary, decisions and commitments with their owners. */
export function tasksMessages(meeting: Pick<Meeting, "title" | "notes">): ChatMessage[] {
  const n = meeting.notes;
  const lines = [
    `Reunión: «${meeting.title || "sin título"}»`,
    `Resumen: ${n?.summary?.replace(/\s+/g, " ") || "(sin resumen)"}`,
    ...(n?.decisions ?? []).map((d) => `Decisión: ${d.text}`),
    ...(n?.commitments ?? []).map((c) => `Compromiso de ${c.owner === "you" ? "el usuario" : c.owner}: ${c.what}${c.due ? ` (para ${c.due})` : ""}`),
  ];
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: lines.join("\n").slice(0, MAX_INPUT_CHARS) },
  ];
}

const key = (title: string) => title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The model's JSON as tasks: trimmed, at most eight, no empty or repeated titles (also against `existing`), unknown owners as `me`. */
export function parseTasks(raw: string, existing: readonly { title: string }[] = []): ExtractedTask[] {
  let out: { tasks?: unknown };
  try {
    out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const seen = new Set(existing.map((t) => key(t.title)));
  const tasks: ExtractedTask[] = [];
  for (const item of Array.isArray(out.tasks) ? out.tasks : []) {
    if (tasks.length >= MAX_TASKS_PER_MEETING) break;
    const o = (item ?? {}) as { title?: unknown; who?: unknown; other?: unknown; due?: unknown };
    let title = typeof o.title === "string" ? o.title.replace(/\s+/g, " ").trim() : "";
    if (title.length > MAX_TASK_CHARS) title = `${title.slice(0, MAX_TASK_CHARS - 1).trim()}…`;
    if (!title || seen.has(key(title))) continue;
    seen.add(key(title));
    const who: TaskOwner = TASK_OWNERS.includes(o.who as TaskOwner) ? (o.who as TaskOwner) : "me";
    const other = typeof o.other === "string" ? o.other.trim().slice(0, 60) : "";
    const due = typeof o.due === "string" ? o.due.trim().slice(0, 40) : "";
    tasks.push({ title, who: who === "other" && !other ? "other" : who, ...(who === "other" && other ? { otherName: other } : {}), ...(due ? { due } : {}) });
  }
  return tasks;
}
