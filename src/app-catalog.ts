// The read-only apps catalog (add-lens-apps P0, design decision 10): what `GET /apps` and `GET /apps/:id`
// answer, from validated manifests. Pure: the hub reads the files (`app-builtins.ts`) and owns the socket.
// Only built-ins exist so far; nothing third-party is served whatever `LENTE_APPS` says.

import { APP_ID_PATTERN, type AppManifest, LANGUAGE_NAMES, PERMISSION_TEXT } from "./app-manifest.ts";
import { COACH_LANGUAGES } from "./coach.ts";

/** `LENTE_APPS`: `builtin` (the default) serves the built-ins; `open` (P1) will add listed apps. */
export type AppsMode = "builtin" | "open";
export const parseAppsMode = (raw: string | undefined): AppsMode => (raw?.trim() === "open" ? "open" : "builtin");

/** Engines the hub runs today; a built-in bound to another one is listed with «Pronto». */
export const ENGINES_READY: readonly string[] = ["dilo", "ver", "practicar", "coach"];

/** A coach target language that has not passed its check (add-language-coach 1.1) is listed with «Pronto». */
const languagePending = (code: string): boolean => Object.hasOwn(COACH_LANGUAGES, code) && !COACH_LANGUAGES[code as keyof typeof COACH_LANGUAGES].verified;

export interface AppListing {
  id: string;
  name: string;
  icon: string;
  developer: string;
  description: string;
  builtIn: boolean;
  /** Listed, but its engine is not built yet: the catalog shows «Pronto». */
  soon: boolean;
  languages: { code: string; name: string; soon: boolean }[];
  permissions: { id: string; label: string; sentence: string }[];
  price: AppManifest["price"];
}

export interface AppPage extends AppListing {
  version: number;
  persona: string;
  inputs: string[];
  tools: string[];
  lookPrompt?: string;
  /** Titles only; the text reaches a session through `app_content`. */
  content: { id: string; title: string }[];
  /** What the page may do today: everything is «Pronto» until installs and trials land (P1). */
  actions: { try: "soon"; install: "soon"; publish: "soon" };
}

/** One app as the grid shows it. */
export function appListing(m: AppManifest, builtIn: boolean): AppListing {
  return {
    id: m.id,
    name: m.name,
    icon: m.icon,
    developer: m.developer,
    description: m.description,
    builtIn,
    soon: m.engine !== undefined && !ENGINES_READY.includes(m.engine),
    languages: m.languages.map((code) => ({ code, name: LANGUAGE_NAMES[code] ?? code, soon: languagePending(code) })),
    permissions: m.permissions.map((id) => ({ id, ...PERMISSION_TEXT[id] })),
    price: m.price,
  };
}

/** One app as its page shows it: the listing plus the persona in full, so a person can read what the app is told. */
export function appPage(m: AppManifest, builtIn: boolean): AppPage {
  return {
    ...appListing(m, builtIn),
    version: m.version,
    persona: m.persona,
    inputs: m.inputs,
    tools: m.tools,
    ...(m.lookPrompt ? { lookPrompt: m.lookPrompt } : {}),
    content: m.content.map(({ id, title }) => ({ id, title })),
    actions: { try: "soon", install: "soon", publish: "soon" },
  };
}

export const APP_NOT_FOUND = { error: "not_found", message: "No hay ninguna app con ese nombre." };

/**
 * The answer to a catalog request, or undefined when the request is not one (other `/apps/…` routes
 * belong to P1). `builtins` are the validated files in catalog order.
 */
export function appsAnswer(req: { method?: string; url?: string }, builtins: readonly AppManifest[], mode: AppsMode): { status: number; body: unknown } | undefined {
  if (req.method !== "GET" || !req.url) return undefined;
  const path = req.url.split("?")[0]!.replace(/\/+$/, "");
  if (path === "/apps") return { status: 200, body: { mode, apps: builtins.map((m) => appListing(m, true)) } };
  const match = /^\/apps\/([^/]+)$/.exec(path);
  if (!match) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    return { status: 404, body: APP_NOT_FOUND };
  }
  const found = APP_ID_PATTERN.test(id) ? builtins.find((m) => m.id === id) : undefined;
  return found ? { status: 200, body: { mode, app: appPage(found, true) } } : { status: 404, body: APP_NOT_FOUND };
}
