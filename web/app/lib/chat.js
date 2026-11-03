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

/**
 * A streamed answer (add-memory-engine 4.2): one of the hub's `delta`, `source`, `searching`,
 * `replace` and `done` events applied to the waiting message, in place. `done` carries the whole
 * answer and wins. Returns the message.
 * @param {{ text: string, pending?: boolean, streaming?: boolean, searching?: boolean, sources?: any[], found?: boolean, ms?: number, error?: boolean }} m
 * @param {string} event
 * @param {any} data
 */
export function applyAskEvent(m, event, data) {
  switch (event) {
    case "delta":
      Object.assign(m, { text: m.text + (data?.text ?? ""), pending: false, streaming: true, searching: false });
      break;
    case "source":
      if (data?.label && !(m.sources ?? []).some((s) => s.label === data.label)) m.sources = [...(m.sources ?? []), data];
      break;
    case "searching":
      m.searching = true;
      break;
    case "replace":
      // Made-up citations: the streamed text is not trusted.
      Object.assign(m, { text: data?.text ?? "", sources: [], found: false });
      break;
    case "done":
      Object.assign(m, data?.ok ? { text: data.answer, sources: data.sources ?? [], found: data.found, ms: data.ms } : { text: data?.message ?? "No pude responder ahora; prueba otra vez.", error: true }, { pending: false, streaming: false, searching: false });
      break;
  }
  return m;
}

/**
 * Server-sent events as `{ event, data }` from text that arrives in pieces: `push` returns the events
 * completed so far and keeps the rest.
 */
export function sseReader() {
  let buffer = "";
  return {
    /** @param {string} chunk */
    push(chunk) {
      buffer += chunk.replace(/\r\n/g, "\n");
      /** @type {{ event: string, data: any }[]} */
      const out = [];
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = block.split("\n");
        const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
        const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        try {
          out.push({ event, data: JSON.parse(data) });
        } catch {
          // not JSON: skipped
        }
      }
      return out;
    },
  };
}
