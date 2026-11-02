// @ts-check
// The chat with Lente: what goes to POST /ask with each question, and the suggestions.

/** Messages of the conversation sent with each question, newest last (the hub trims again). */
export const CHAT_HISTORY = 8;

export const SUGGESTIONS = [
  { label: "Resumen de hoy", question: "¿Qué pasó hoy? Dame un resumen corto." },
  { label: "¿Qué me falta?", question: "¿Qué tengo pendiente y qué prometí hacer?" },
];

/**
 * The `history` for /ask: the last answered messages as `{ role, text }`, without the one waiting
 * for its answer and without errors.
 * @param {{ role: "user" | "lente", text: string, error?: boolean, pending?: boolean }[]} messages
 */
export function askHistory(messages) {
  return messages.filter((m) => !m.error && !m.pending && m.text).slice(-CHAT_HISTORY).map(({ role, text }) => ({ role, text }));
}

/** The body of POST /ask; a project scope only when one is chosen. */
export function askBody(/** @type {string} */ question, /** @type {any[]} */ messages, /** @type {string | null | undefined} */ project) {
  return { question: question.trim(), history: askHistory(messages), ...(project ? { project } : {}) };
}
