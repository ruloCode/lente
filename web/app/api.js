// The hub's JSON routes, same origin: the browser sends the HttpOnly session cookie by itself, so
// the app never holds a token.

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
export async function post(path, body = {}) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let parsed = null;
  if ((res.headers.get("Content-Type") ?? "").includes("application/json")) parsed = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: parsed };
}
