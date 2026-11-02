// @ts-check
// The app's Spanish words in one place: plurals, the greeting, who does a task, what an agent
// action is called. Code and docs stay in English; the wearer reads Spanish.

/** «1 tarea», «3 tareas», «0 tareas». */
export function count(/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The first of the names the wearer set (the hub sends a list; «Rulo, Raúl» also works), or "". */
export function firstName(/** @type {string | string[] | undefined} */ names) {
  const list = Array.isArray(names) ? names : (names ?? "").split(/[,;]/);
  return list.map((n) => String(n).trim()).find(Boolean) ?? "";
}

/** The names as one editable line: «Rulo, Raúl». */
export const namesLine = (/** @type {string | string[] | undefined} */ names) => (Array.isArray(names) ? names.join(", ") : names ?? "");

/** «Buenos días, Rulo» by the hour of the day; without a name, just the greeting. */
export function greeting(/** @type {string | string[] | undefined} */ names, /** @type {number} */ hour) {
  const base = hour < 5 ? "Buenas noches" : hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const name = firstName(names);
  return name ? `${base}, ${name}` : base;
}

/** Who does a task, as the group title and as a short tag. */
export const OWNERS = /** @type {const} */ (["me", "lente", "other"]);
/** @typedef {typeof OWNERS[number]} Owner */
/** @type {Record<Owner, string>} */
export const OWNER_GROUP = { me: "Te toca", lente: "Lente puede hacerlo", other: "Esperando a otros" };
/** @type {Record<Owner, string>} */
export const OWNER_TAG = { me: "Tú", lente: "Lente", other: "Otra persona" };

/** The tag for a task's owner: someone else's shows their name when the notes gave one. */
export function ownerTag(/** @type {{ who?: string, otherName?: string }} */ task) {
  if (task.who === "other" && task.otherName) return task.otherName;
  return OWNER_TAG[/** @type {Owner} */ (task.who)] ?? OWNER_TAG.me;
}

/** The closing agent's tools as the wearer reads them. */
/** @type {Record<string, string>} */
export const TOOL_LABEL = { draft_email: "Correo", create_task: "Tarea", create_reminder: "Recordatorio" };

/** The listening state in the pill. */
export function listeningLabel(/** @type {{ listening?: boolean, assistMode?: string, pause?: { reason?: string } | null } | null | undefined} */ status) {
  if (!status) return "Conectando…";
  if (status.listening) return status.assistMode === "record" ? "Grabando" : "Escuchando";
  if (status.pause?.reason === "idle") return "En pausa (sin voz)";
  return "En pausa";
}

/** Which device the hub hears from. */
export function deviceLabel(/** @type {{ clip?: boolean, device?: string } | null | undefined} */ status) {
  if (!status?.clip) return "Sin dispositivo";
  return status.device === "phone" ? "Teléfono" : "Clip conectado";
}
