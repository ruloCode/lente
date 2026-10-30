/** Who may reach the hub (pure): `/health` is always open, a cloud hub (auth on) needs TLS and a pairing or token. */

/** What the web handler does with a request. */
export type WebDecision = "health" | "pass" | "redirect-https" | "pair" | "pair-page" | "deny";

export interface WebRequest {
  method?: string;
  /** URL path without the query string. */
  path?: string;
  /** Behind the platform's TLS proxy: the request arrived as plain HTTP. */
  plainHttp: boolean;
  /** The request carries a valid pairing session cookie. */
  paired: boolean;
}

export function decideWeb(req: WebRequest, authOn: boolean): WebDecision {
  if (req.path === "/health" && req.method === "GET") return "health";
  if (!authOn) return "pass";
  if (req.plainHttp) return "redirect-https";
  if (req.paired) return "pass";
  if (req.method === "POST" && req.path === "/pair") return "pair";
  if (req.method === "GET" && req.path === "/") return "pair-page";
  return "deny";
}

/** What the `/device` WebSocket upgrade gets: the HTTP status to refuse with, or `accept`. */
export type UpgradeDecision = 200 | 401 | 404 | 426;

export interface UpgradeRequest {
  path?: string;
  plainHttp: boolean;
  /** A valid device token. */
  deviceKnown: boolean;
  /** A valid pairing session cookie. */
  paired: boolean;
}

export function decideUpgrade(req: UpgradeRequest, devicePath: string, authOn: boolean): UpgradeDecision {
  if (req.path !== devicePath) return 404;
  if (!authOn) return 200;
  if (req.plainHttp) return 426;
  return req.deviceKnown || req.paired ? 200 : 401;
}
