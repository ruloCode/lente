// @ts-check
// The hub's event stream (/events) reduced into the app's state. Pure: the store calls `reduce`
// with each parsed event and re-renders the views that read the keys it says changed.

import { actionTitle } from "./actions.js";

/** Day entries kept for Hoy and the live view; the hub sends the last 80 on connect. */
export const MAX_ENTRIES = 400;
/** Cue labels that are pictures or what the camera read, not a card to say. */
const NOT_A_CARD = new Set(["PHOTO", "ON SCREEN"]);

/**
 * @typedef {{
 *   status: any, entries: any[], partial: string, meetings: any[], glossary: any[], asked: number, answered: number,
 *   pending: any[], decided: any[], tasks: any[], cue: any, spend: any, recorded: number, level: number, frame: string,
 *   loaded: { meetings: boolean, actions: boolean }
 * }} State
 */

/** @returns {State} */
export function initialState() {
  return { status: null, entries: [], partial: "", meetings: [], glossary: [], asked: 0, answered: 0, pending: [], decided: [], tasks: [], cue: null, spend: null, recorded: 0, level: 0, frame: "", loaded: { meetings: false, actions: false } };
}

/** One SSE `data:` payload as an object, or null when it is not JSON with a kind. */
export function parseEvent(/** @type {string} */ data) {
  try {
    const event = JSON.parse(data);
    return event && typeof event === "object" && typeof event.kind === "string" ? event : null;
  } catch {
    return null;
  }
}

/** Whether a cue is a card the wearer reads (DILO, Lente, a help card). */
export const isCard = (/** @type {any} */ e) => e?.kind === "cue" && !e.photo && !NOT_A_CARD.has(e.label);

/**
 * Applies one event; returns the new state and the keys that changed. Unknown kinds change nothing.
 * @param {State} state
 * @param {any} event
 * @returns {{ state: State, changed: string[] }}
 */
export function reduce(state, event) {
  switch (event?.kind) {
    case "status": {
      const { kind: _k, ...status } = event;
      const partial = status.listening ? state.partial : "";
      return { state: { ...state, status, partial }, changed: partial !== state.partial ? ["status", "partial"] : ["status"] };
    }
    case "history": {
      const items = Array.isArray(event.items) ? event.items : [];
      const lastCard = [...items].reverse().find((e) => e.kind === "cue" && !NOT_A_CARD.has(e.label));
      return { state: { ...state, entries: items.slice(-MAX_ENTRIES), cue: state.cue ?? lastCard ?? null }, changed: ["entries", "cue"] };
    }
    case "turn":
    case "live":
    case "summary":
    case "cue": {
      if (event.kind === "cue" && event.photo) return { state: { ...state, frame: event.photo }, changed: ["frame"] };
      const entries = state.entries.concat([event]).slice(-MAX_ENTRIES);
      const changed = ["entries"];
      let { cue, partial } = state;
      if (isCard(event)) {
        cue = event;
        changed.push("cue");
      }
      if (event.kind === "turn" && partial) {
        partial = "";
        changed.push("partial");
      }
      return { state: { ...state, entries, cue, partial }, changed };
    }
    case "partial":
      return { state: { ...state, partial: String(event.text ?? "") }, changed: ["partial"] };
    case "speaker": {
      const entries = state.entries.map((e) => (e.kind === "turn" && e.turnId !== undefined && String(e.turnId) === String(event.turnId) ? { ...e, speaker: event.speaker } : e));
      return { state: { ...state, entries }, changed: ["entries"] };
    }
    case "meetings": {
      const lang = event.language ?? {};
      return {
        state: { ...state, meetings: Array.isArray(event.items) ? event.items : [], glossary: Array.isArray(lang.glossary) ? lang.glossary : [], asked: lang.asked ?? 0, answered: lang.answered ?? 0, loaded: { ...state.loaded, meetings: true } },
        changed: ["meetings", "glossary"],
      };
    }
    case "actions":
      return {
        state: { ...state, pending: event.pending ?? [], decided: event.decided ?? [], tasks: event.tasks ?? [], loaded: { ...state.loaded, actions: true } },
        changed: ["actions"],
      };
    case "spend": {
      const { kind: _k, ...spend } = event;
      return { state: { ...state, spend }, changed: ["spend"] };
    }
    case "recorded":
      return { state: { ...state, recorded: Number(event.ms) || 0 }, changed: ["recorded"] };
    case "level":
      return { state: { ...state, level: Number(event.rms) || 0 }, changed: ["level"] };
    case "frame":
      return { state: { ...state, frame: String(event.photo ?? "") }, changed: ["frame"] };
    default:
      return { state, changed: [] };
  }
}

/**
 * What deserves a system notification in this event: a DILO or Lente card, or an action that just
 * started waiting for approval. The store shows them only with the tab hidden and the user's opt-in.
 * @param {State} before
 * @param {any} event
 * @returns {{ tag: string, title: string, body: string }[]}
 */
export function notificationsFor(before, event) {
  if (isCard(event) && /^(dilo|lente)$/i.test(event.label)) {
    return [{ tag: `cue-${event.at ?? ""}`, title: /dilo/i.test(event.label) ? "Dilo" : "Lente", body: String(event.text ?? "") }];
  }
  if (event?.kind === "actions" && before.loaded.actions) {
    const known = new Set(before.pending.map((a) => a.id));
    return (event.pending ?? []).filter((/** @type {any} */ a) => !known.has(a.id)).map((/** @type {any} */ a) => ({ tag: `action-${a.id}`, title: "Por aprobar", body: actionTitle(a) }));
  }
  return [];
}
