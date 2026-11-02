/**
 * Who may reach the hub (pure). `/health` is always open. Three modes:
 * - `open`: the laptop hub on the LAN, one owner, no checks.
 * - `pairing`: a cloud hub without accounts (`LENTE_CLOUD=1`): TLS, a pairing code or a device token, one owner.
 * - `accounts`: a cloud hub with Supabase (add-accounts): TLS, and every request resolves to a user from a
 *   bearer token, the web session cookie or (on `/device`) a device token, or it is refused.
 */

export type AuthMode = "open" | "pairing" | "accounts";

/** What the web handler does with a request. */
export type WebDecision = "health" | "app" | "pass" | "redirect-https" | "pair" | "pair-page" | "auth" | "signin-page" | "deny";

export interface WebRequest {
  method?: string;
  /** URL path without the query string. */
  path?: string;
  /** Behind the platform's TLS proxy: the request arrived as plain HTTP. */
  plainHttp: boolean;
  /** The request resolved to someone: a paired phone (pairing) or a signed-in user (accounts). */
  identified: boolean;
}

/** The web sign-in routes that must work before anyone is signed in (accounts mode). */
const AUTH_ROUTES = new Set(["/auth/google", "/auth/callback"]);

/** The desktop web app's shell and modules (add-web-desktop): code, not data, so open in every mode. */
const isApp = (req: WebRequest): boolean => req.method === "GET" && (req.path === "/app" || Boolean(req.path?.startsWith("/app/")));

export function decideWeb(req: WebRequest, mode: AuthMode): WebDecision {
  if (req.path === "/health" && req.method === "GET") return "health";
  if (mode === "open") return isApp(req) ? "app" : "pass";
  if (req.plainHttp) return "redirect-https";
  if (isApp(req)) return "app";
  if (req.identified) return "pass";
  if (mode === "pairing") {
    if (req.method === "POST" && req.path === "/pair") return "pair";
    if (req.method === "GET" && req.path === "/") return "pair-page";
    return "deny";
  }
  if (req.method === "GET" && req.path && AUTH_ROUTES.has(req.path)) return "auth";
  if (req.method === "GET" && req.path === "/") return "signin-page";
  return "deny";
}

/** What the `/device` WebSocket upgrade gets: the HTTP status to refuse with, or `accept`. */
export type UpgradeDecision = 200 | 401 | 404 | 426;

export interface UpgradeRequest {
  path?: string;
  plainHttp: boolean;
  /** Resolved to someone: a device token, a signed-in user's bearer token, or a paired phone's session. */
  identified: boolean;
}

export function decideUpgrade(req: UpgradeRequest, devicePath: string, mode: AuthMode): UpgradeDecision {
  if (req.path !== devicePath) return 404;
  if (mode === "open") return 200;
  if (req.plainHttp) return 426;
  return req.identified ? 200 : 401;
}
