// The app's state: one /events stream reduced by lib/events.js, the live transcript through the
// hub's own reducer, the projects list fetched when meetings or tasks change, and the user's local
// choices. Views subscribe to the keys they read.

import { getJson } from "./api.js";
import { backoffDelay } from "./lib/backoff.js";
import { initialState, notificationsFor, parseEvent, reduce } from "./lib/events.js";
import { emptyTranscript, reduceTranscript } from "./lib/transcript-view.js";

const TRANSCRIPT_KINDS = new Set(["status", "history", "partial", "turn", "speaker"]);

export const store = {
  state: initialState(),
  transcript: emptyTranscript(),
  /** "connecting" | "open" | "reconnecting" */
  connection: "connecting",
  /** When the last status arrived, to run the session clock between status events. */
  statusAt: 0,
  projects: [],
  projectsLoaded: false,
  session: { mode: "open", signedIn: true, email: null },
};

const listeners = new Map();

/** Calls `fn` whenever one of `keys` changes; returns the unsubscribe. */
export function subscribe(keys, fn) {
  for (const key of keys) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  }
  return () => keys.forEach((key) => listeners.get(key)?.delete(fn));
}

export function emit(keys) {
  const fns = new Set();
  for (const key of keys) for (const fn of listeners.get(key) ?? []) fns.add(fn);
  for (const fn of fns) {
    try {
      fn(keys);
    } catch (error) {
      console.error("[lente] a view failed to update", error);
    }
  }
}

/** Resolves once `key` changes and `test()` holds, or after `ms` (the action may still land later). */
export function waitFor(key, test = () => true, ms = 4000) {
  return new Promise((resolve) => {
    if (test()) return resolve(true);
    const timer = setTimeout(() => (off(), resolve(false)), ms);
    const off = subscribe([key], () => {
      if (!test()) return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
  });
}

// --- The stream -------------------------------------------------------------------------------

let source;
let attempt = 0;
let retryTimer;
let onCard = () => {};

/** Hook for the newest DILO card (read aloud, notify). */
export function onNotify(fn) {
  onCard = fn;
}

export function connect() {
  clearTimeout(retryTimer);
  source?.close();
  source = new EventSource("/events");
  source.onopen = () => {
    attempt = 0;
    setConnection("open");
  };
  source.onmessage = (msg) => {
    const event = parseEvent(msg.data);
    if (!event) return;
    const before = store.state;
    const { state, changed } = reduce(before, event);
    store.state = state;
    if (event.kind === "status") store.statusAt = Date.now();
    if (TRANSCRIPT_KINDS.has(event.kind)) {
      store.transcript = reduceTranscript(store.transcript, event);
      changed.push("transcript");
    }
    if (changed.length) emit(changed);
    for (const n of notificationsFor(before, event)) onCard(n, event);
    if (event.kind === "meetings" || event.kind === "actions") refreshProjectsSoon();
  };
  source.onerror = () => {
    source.close();
    setConnection("reconnecting");
    // A stream that keeps failing may be a session that ended: then sign in again.
    void getJson("/app/session").then(
      (s) => (s.signedIn ? undefined : location.reload()),
      () => undefined,
    );
    retryTimer = setTimeout(connect, backoffDelay(attempt++));
  };
}

function setConnection(value) {
  if (store.connection === value) return;
  store.connection = value;
  emit(["connection"]);
}

// --- Projects (not on the stream) --------------------------------------------------------------

let projectsTimer;
function refreshProjectsSoon() {
  clearTimeout(projectsTimer);
  projectsTimer = setTimeout(refreshProjects, 400);
}

export async function refreshProjects() {
  try {
    const { projects } = await getJson("/projects");
    store.projects = Array.isArray(projects) ? projects : [];
    store.projectsLoaded = true;
    emit(["projects"]);
  } catch {
    // The next meetings or actions event tries again.
  }
}

// --- Local choices (no content) ------------------------------------------------------------------

const PREFS = { theme: "system", chat: "open", notify: "off", speak: "off" };

export function pref(key) {
  try {
    return localStorage.getItem(`lente.${key}`) ?? PREFS[key];
  } catch {
    return PREFS[key];
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(`lente.${key}`, value);
  } catch {
    // Storage blocked: the choice lasts this page only.
  }
  emit([`pref:${key}`]);
}

/** Applies the theme choice: system, light or dark. */
export function applyTheme(choice = pref("theme")) {
  if (choice === "light" || choice === "dark") document.documentElement.dataset.theme = choice;
  else delete document.documentElement.dataset.theme;
}

/** Milliseconds listened in this session, running between status events. */
export function sessionMs() {
  const s = store.state.status?.session;
  if (!s) return 0;
  return s.listenedMs + (s.running ? Math.max(0, Date.now() - store.statusAt) : 0);
}
