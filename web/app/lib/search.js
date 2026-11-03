// @ts-check
// ⌘K: one search over what the app already holds (meetings, tasks, projects). No model call and
// no round trip; the full-text search of transcripts stays on the hub (/meetings/search).

import { meetingPath, pathFor } from "./routes.js";

/** Lowercase, accents and extra spaces removed: «Reunión  QA» → «reunion qa». */
export function normalize(/** @type {string} */ text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Every word of the query appears in the text. */
export function matches(/** @type {string} */ text, /** @type {string} */ query) {
  const hay = normalize(text);
  return normalize(query).split(" ").filter(Boolean).every((w) => hay.includes(w));
}

/**
 * Results for a query, projects first, then meetings (newest first), then open tasks.
 * @param {string} query
 * @param {{ meetings?: any[], tasks?: any[], projects?: any[] }} data
 * @returns {{ kind: "project" | "meeting" | "task", id: string, title: string, hint: string, href: string }[]}
 */
export function searchAll(query, data, limit = 12) {
  if (!normalize(query)) return [];
  const projects = (data.projects ?? []).filter((p) => matches(p.name, query)).map((p) => ({ kind: /** @type {const} */ ("project"), id: p.id, title: p.name, hint: p.status === "archived" ? "Proyecto archivado" : "Proyecto", href: pathFor("project", { id: p.id }) }));
  const meetings = [...(data.meetings ?? [])]
    .sort((a, b) => b.startedAt - a.startedAt)
    .filter((m) => matches(`${m.title ?? ""} ${m.topic ?? ""} ${m.notes?.summary ?? ""}`, query))
    .map((m) => ({ kind: /** @type {const} */ ("meeting"), id: m.id, title: m.title || m.topic || "Reunión", hint: "Reunión", href: meetingPath(m.id, undefined) }));
  const tasks = (data.tasks ?? []).filter((t) => !t.done && matches(`${t.title} ${t.projectName ?? ""}`, query)).map((t) => ({ kind: /** @type {const} */ ("task"), id: t.id, title: t.title, hint: t.projectName ? `Tarea · ${t.projectName}` : "Tarea", href: pathFor("tasks") }));
  return [...projects, ...meetings, ...tasks].slice(0, limit);
}
