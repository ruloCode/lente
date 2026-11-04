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

// --- Who may open an account (ship-hackathon decision 1) -------------------------------------------

/** `allowlist` (the default): only invited emails get an account. `open`: any verified Google email, until an end date. */
export type SignupMode = "allowlist" | "open";

/** What a new Google account sees after open sign-up ended. */
export const SIGNUP_CLOSED_MESSAGE = "Las inscripciones están cerradas por ahora. Gracias por tu interés en Lente.";

/** Bogotá has no daylight saving time: a plain date ends at its midnight, UTC−5. */
const BOGOTA_OFFSET = "-05:00";

export interface SignupPolicy {
  mode: SignupMode;
  /** The first instant sign-up is closed again, ms since the epoch; open mode needs one. */
  until?: number;
}

/**
 * `LENTE_SIGNUP` and `LENTE_SIGNUP_UNTIL`. A plain date (`2026-11-17`) closes at its start in Bogotá;
 * a full ISO time is taken as written. Anything unknown or unparseable falls back to the allow list,
 * the safe failure, with a warning to log.
 */
export function parseSignup(mode: string | undefined, until: string | undefined): SignupPolicy & { warning?: string } {
  const m = (mode ?? "").trim().toLowerCase();
  if (m === "" || m === "allowlist") return { mode: "allowlist" };
  if (m !== "open") return { mode: "allowlist", warning: `LENTE_SIGNUP=${m.slice(0, 20)} is not allowlist or open: using the allow list.` };
  const raw = (until ?? "").trim();
  const at = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00${BOGOTA_OFFSET}`) : Date.parse(raw);
  if (!raw || !Number.isFinite(at)) return { mode: "allowlist", warning: "LENTE_SIGNUP=open needs a valid LENTE_SIGNUP_UNTIL (an ISO date): using the allow list." };
  return { mode: "open", until: at };
}

export type SignupAnswer = { ok: true } | { ok: false; reason: "closed_test" | "signup_closed" };

/**
 * May this email get a new account now? The allow list always may. In open mode anyone may until the
 * end date; after it, newcomers hear that sign-up is closed. An empty allow list in allowlist mode
 * lets nobody in. Existing accounts are not asked: they keep signing in (`Accounts.admit`).
 */
export function mayCreateAccount(input: { mode: SignupMode; until?: number; now: number; email: string; allowList: ReadonlySet<string> }): SignupAnswer {
  if (input.allowList.has(input.email.trim().toLowerCase())) return { ok: true };
  if (input.mode !== "open") return { ok: false, reason: "closed_test" };
  return input.until !== undefined && input.now < input.until ? { ok: true } : { ok: false, reason: "signup_closed" };
}
