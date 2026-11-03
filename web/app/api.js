// The hub's JSON routes, same origin: the browser sends the HttpOnly session cookie by itself, so
// the app never holds a token.

import { sseReader } from "./lib/chat.js";

export class HubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** GET a JSON route; 401/403 mean the session ended (the app shows sign-in again). */
export async function getJson(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new HubError(res.status, `${path} answered ${res.status}`);
  return res.json();
}

/** POST a JSON body; resolves with `{ ok, status, body }` (body parsed when the hub sent JSON). */
/**
 * POST that accepts an event stream (add-memory-engine 4.2): each event goes to `onEvent` as it
 * arrives. A hub that answers JSON (an older one) comes back as `post` would, with `streamed: false`.
 */
export async function postStream(path, body, onEvent) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body) });
  if (!(res.headers.get("Content-Type") ?? "").includes("text/event-stream") || !res.body) {
    let parsed = null;
    if ((res.headers.get("Content-Type") ?? "").includes("application/json")) parsed = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: parsed, streamed: false };
  }
  const reader = sseReader();
  const decoder = new TextDecoder();
  let done = null;
  for await (const chunk of res.body) {
    for (const e of reader.push(decoder.decode(chunk, { stream: true }))) {
      if (e.event === "done") done = e.data;
      onEvent(e.event, e.data);
    }
  }
  return { ok: res.ok && done !== null, status: res.status, body: done, streamed: true };
}

export async function post(path, body = {}) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let parsed = null;
  if ((res.headers.get("Content-Type") ?? "").includes("application/json")) parsed = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: parsed };
}
