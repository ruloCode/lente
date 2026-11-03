// @ts-check
// What the closing agent proposes, as the wearer reads it before approving: a title, the fields
// of the preview and the editable parts.

const str = (/** @type {unknown} */ v) => (typeof v === "string" ? v : "");

/** «Correo: Launch date and next steps», «Tarea: Enviar la cotización», «Recordatorio: … · 2026-11-05». */
export function actionTitle(/** @type {{ tool?: string, args?: Record<string, unknown> }} */ a) {
  const args = a.args ?? {};
  if (a.tool === "draft_email") return `Correo: ${str(args.subject) || "seguimiento"}`;
  if (a.tool === "create_task") return `Tarea: ${str(args.title)}`;
  if (a.tool === "create_reminder") return `Recordatorio: ${str(args.title)}${args.date ? ` · ${str(args.date)}` : ""}`;
  return a.tool ?? "Acción";
}

/**
 * The preview: labelled fields, the body when there is one, and which args the wearer may edit.
 * @returns {{ kind: "email" | "task" | "reminder" | "other", fields: { label: string, value: string }[], body: string, editable: string[] }}
 */
export function actionPreview(/** @type {{ tool?: string, args?: Record<string, unknown> }} */ a) {
  const args = a.args ?? {};
  if (a.tool === "draft_email") {
    const to = Array.isArray(args.to) ? args.to.map(String).join(", ") : str(args.to);
    return { kind: "email", fields: [{ label: "Para", value: to || "—" }, { label: "Asunto", value: str(args.subject) }], body: str(args.body), editable: ["subject", "body"] };
  }
  if (a.tool === "create_task") return { kind: "task", fields: [{ label: "Tarea", value: str(args.title) }, ...(args.due ? [{ label: "Para cuándo", value: str(args.due) }] : [])], body: "", editable: ["title"] };
  if (a.tool === "create_reminder") return { kind: "reminder", fields: [{ label: "Recordatorio", value: str(args.title) }, { label: "Fecha", value: str(args.date) }], body: str(args.note), editable: ["title"] };
  return { kind: "other", fields: Object.entries(args).map(([label, value]) => ({ label, value: typeof value === "string" ? value : JSON.stringify(value) })), body: "", editable: [] };
}

/** The args to approve with: the proposal with the wearer's edits; empty edits keep the proposal. */
export function editedArgs(/** @type {Record<string, unknown>} */ args, /** @type {Record<string, string>} */ edits) {
  /** @type {Record<string, unknown>} */
  const out = { ...args };
  for (const [key, value] of Object.entries(edits)) if (typeof value === "string" && value.trim()) out[key] = value;
  return out;
}
