// Lente apps (add-lens-apps): the manifest format, its validator and the persona checks. Pure. An app is
// data the hub interprets, never code (design decision 1); this module says which manifests are well
// formed (decision 2) and which persona text imitates the hub's own prompt (decision 5). What a session
// may call is `app-grants.ts`' job; this module only knows what each tool needs.

/** The manifest format this validator reads. A later version is refused, never read half-understood. */
export const MANIFEST_FORMAT = 1;

/** Ids: a lowercase letter, then 2–31 lowercase letters, digits or dashes. */
export const APP_ID_PATTERN = /^[a-z][a-z0-9-]{2,31}$/;
/** Ids nobody but a built-in may take: the built-ins, Lente itself and the web app's own paths. */
export const RESERVED_IDS: ReadonlySet<string> = new Set(["dilo", "ver", "practicar", "idiomas", "lente", "apps", "app", "admin", "owner", "meta", "system", "publicar", "revision", "ajustes"]);

// The bounds (characters unless named otherwise). Chosen as policy, not measured.
export const APP_NAME_MIN = 2;
export const APP_NAME_MAX = 32;
export const DEVELOPER_MIN = 2;
export const DEVELOPER_MAX = 40;
export const APP_DESCRIPTION_MIN = 10;
export const APP_DESCRIPTION_MAX = 280;
export const LANGUAGES_MAX = 4;
export const PERSONA_MIN = 40;
export const PERSONA_MAX = 4_000;
export const LOOK_PROMPT_MAX = 600;
export const CONTENT_MAX_ITEMS = 50;
export const CONTENT_TITLE_MAX = 80;
export const CONTENT_TEXT_MAX = 1_000;
export const CONTENT_TOTAL_MAX = 30_000;
export const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const TRIAL_DAYS_MIN = 1;
export const TRIAL_DAYS_MAX = 30;
/** Consecutive lines in capitals a persona may hold before it reads as a fake section header. */
export const PERSONA_CAPS_RUN_MAX = 20;

/** Languages Lente supports today (`docs/kb/meta-api.md`). */
export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
/**
 * The coach's target languages (add-language-coach): only a built-in may list one. The catalog marks
 * those that have not passed their check «Pronto» (`COACH_LANGUAGES[…].verified`).
 */
export const BUILTIN_LANGUAGES = ["pt", "fr"] as const;
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = { es: "Español", en: "Inglés", pt: "Portugués", fr: "Francés" };

/**
 * Icons an app may use: names from Lente's own set (`web/app/icons.js`); a test keeps the two in step.
 * No uploaded images.
 */
export const APP_ICONS: ReadonlySet<string> = new Set([
  "home", "check", "folder", "calendar", "brain", "sun", "chat", "sparkle", "mic", "camera", "screen", "search", "bell", "task",
  "user", "people", "ear", "eye", "list", "edit", "keyboard", "wave", "info", "lock", "volume", "mail", "play",
]);

export const PERMISSIONS = ["camera", "microphone", "location", "memory.read", "memory.write"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Each permission as the app's page and the install sheet show it (Spanish, one sentence). */
export const PERMISSION_TEXT: Readonly<Record<Permission, { label: string; sentence: string }>> = {
  camera: { label: "Cámara", sentence: "Puede mirar por tus gafas cuando se lo pides." },
  microphone: { label: "Micrófono", sentence: "Puede oírte mientras hablas con ella." },
  location: { label: "Ubicación", sentence: "Puede saber la dirección aproximada donde estás." },
  "memory.read": { label: "Leer tu memoria", sentence: "Puede buscar en lo que Lente guardó de tus reuniones, tareas y proyectos." },
  "memory.write": { label: "Escribir en tu memoria", sentence: "Puede guardar tareas y recuerdos en tu memoria." },
};

/** What an app may ask for. `room` (the people around the wearer) only with an engine. */
export const APP_INPUTS = ["microphone", "camera", "location"] as const;
export const ENGINE_INPUTS = ["room"] as const;
export type AppInput = (typeof APP_INPUTS)[number] | (typeof ENGINE_INPUTS)[number];
const INPUT_NEEDS: Readonly<Record<AppInput, Permission>> = { microphone: "microphone", camera: "camera", location: "location", room: "microphone" };

/** The apps allow-list (decision 4): each tool and the permission it needs (none: `null`). */
export const APP_TOOLS: Readonly<Record<string, Permission | null>> = {
  look: "camera",
  narrate: "camera",
  where_am_i: "location",
  ask_memory: "memory.read",
  list_tasks: "memory.read",
  list_projects: "memory.read",
  add_task: "memory.write",
  app_note: null,
  app_notes: null,
  app_content: null,
  quiet_mode: null,
  web_search: null,
};

/** Tools an engine owns: only a built-in manifest may list them. */
export const ENGINE_TOOLS: Readonly<Record<string, Permission | null>> = {
  remember_person: "memory.write",
  start_lesson: null,
  last_attempt: "memory.read",
  pronounce: "memory.write",
  check_repeat: "microphone",
  finish_placement: "memory.write",
  language_progress: "memory.read",
  review_due: "memory.read",
  review_result: "memory.write",
};

/** The hub's engines a built-in binds to, and the permissions each needs beyond its inputs and tools. */
export const ENGINES = ["dilo", "ver", "practicar", "coach"] as const;
export type Engine = (typeof ENGINES)[number];
const ENGINE_NEEDS: Readonly<Record<Engine, readonly Permission[]>> = {
  dilo: ["memory.read", "memory.write"], // the meeting pipeline reads and keeps the day
  ver: [],
  practicar: ["memory.write"], // each attempt is kept as a practice line
  coach: [],
};

export interface ContentItem {
  id: string;
  title: string;
  text: string;
}
export type Price = { model: "free" } | { model: "trial"; days: number };

export interface AppManifest {
  manifest: typeof MANIFEST_FORMAT;
  id: string;
  version: number;
  name: string;
  icon: string;
  developer: string;
  description: string;
  languages: string[];
  inputs: AppInput[];
  permissions: Permission[];
  tools: string[];
  persona: string;
  lookPrompt?: string;
  content: ContentItem[];
  price: Price;
  engine?: Engine;
}

export interface ManifestError {
  field: string;
  /** Spanish, for the Publicar screen. */
  message: string;
}
export type ManifestResult = { ok: true; manifest: AppManifest } | { ok: false; errors: ManifestError[] };

const REQUIRED = ["manifest", "id", "version", "name", "icon", "developer", "description", "languages", "inputs", "permissions", "tools", "persona", "price"] as const;
const OPTIONAL = ["lookPrompt", "content", "engine"] as const;
const KNOWN: ReadonlySet<string> = new Set<string>([...REQUIRED, ...OPTIONAL]);

/** Where the persona sits inside Lente's instructions (decision 5); a persona may not contain them. */
export const PERSONA_OPEN = "<<<PERSONA DE LA APP>>>";
export const PERSONA_CLOSE = "<<<FIN DE LA PERSONA>>>";
/** The hub's own prompt markers a persona may not imitate. */
const PERSONA_MARKERS = [PERSONA_OPEN, PERSONA_CLOSE, "MEMORIA (", "[[", "Reglas que siempre se cumplen"];
const ROLE_LINE = /^\s*(system|developer|assistant)\s*:/i;

/**
 * What in a persona imitates the hub's own sections or markup, in Spanish; empty when nothing does.
 * Not the security boundary (that is the tool allow-list, in code): it keeps a persona from misleading
 * the model about who is speaking.
 */
export function personaProblems(text: string): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  for (const marker of PERSONA_MARKERS) if (lower.includes(marker.toLowerCase())) problems.push(`No puede contener «${marker}»: imita las instrucciones de Lente.`);
  const lines = text.split(/\r?\n/);
  const role = lines.find((l) => ROLE_LINE.test(l));
  if (role) problems.push(`Una línea no puede empezar con «${role.trim().split(":")[0]}:»: imita un mensaje del sistema.`);
  let run = 0;
  let longest = 0;
  for (const line of lines) {
    const letters = line.replace(/[^\p{L}]/gu, "");
    run = letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase() ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest > PERSONA_CAPS_RUN_MAX) problems.push(`Tiene ${longest} líneas seguidas en mayúsculas; el máximo es ${PERSONA_CAPS_RUN_MAX}.`);
  return problems;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const chars = (s: string): number => [...s].length;

/**
 * Checks a manifest (already parsed JSON) and returns the normalized manifest, or every problem at once
 * with its field. `builtIn` is true only for the files in `apps/builtin/`: they may bind an engine, use
 * its tools, take a reserved id and list a language still being checked.
 */
export function validateManifest(json: unknown, opts: { builtIn: boolean }): ManifestResult {
  const errors: ManifestError[] = [];
  const fail = (field: string, message: string) => void errors.push({ field, message });
  if (!isObject(json)) return { ok: false, errors: [{ field: "manifest", message: "El manifiesto debe ser un objeto JSON." }] };
  for (const key of Object.keys(json)) if (!KNOWN.has(key)) fail(key, `Campo desconocido: «${key}».`);
  for (const key of REQUIRED) if (json[key] === undefined) fail(key, `Falta el campo «${key}».`);

  const text = (field: string, min: number, max: number): string | undefined => {
    const v = json[field];
    if (v === undefined) return undefined;
    if (typeof v !== "string") return void fail(field, "Debe ser texto.");
    const t = v.trim();
    if (chars(t) < min || chars(t) > max) return void fail(field, `Debe tener entre ${min} y ${max} caracteres (tiene ${chars(t)}).`);
    return t;
  };
  const list = (field: string, allowed: ReadonlySet<string>, what: (item: string) => string, optional = false): string[] | undefined => {
    const v = json[field];
    if (v === undefined) return optional ? [] : undefined;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return void fail(field, "Debe ser una lista de textos.");
    const items = [...new Set(v as string[])];
    let good = true;
    for (const item of items) {
      if (!allowed.has(item)) {
        fail(field, what(item));
        good = false;
      }
    }
    return good ? items : undefined;
  };

  if (json.manifest !== undefined && json.manifest !== MANIFEST_FORMAT) fail("manifest", `La versión del formato debe ser ${MANIFEST_FORMAT}.`);

  let id: string | undefined;
  if (json.id !== undefined) {
    if (typeof json.id !== "string" || !APP_ID_PATTERN.test(json.id)) fail("id", "Debe empezar con una letra minúscula y tener de 3 a 32 letras minúsculas, números o guiones.");
    else if (RESERVED_IDS.has(json.id) && !opts.builtIn) fail("id", `«${json.id}» está reservado para Lente.`);
    else id = json.id;
  }
  let version: number | undefined;
  if (json.version !== undefined) {
    if (!Number.isInteger(json.version) || (json.version as number) < 1) fail("version", "Debe ser un número entero desde 1.");
    else version = json.version as number;
  }
  const name = text("name", APP_NAME_MIN, APP_NAME_MAX);
  let icon: string | undefined;
  if (json.icon !== undefined) {
    if (typeof json.icon !== "string" || !APP_ICONS.has(json.icon)) fail("icon", `Debe ser un ícono de Lente (${[...APP_ICONS].join(", ")}).`);
    else icon = json.icon;
  }
  const developer = text("developer", DEVELOPER_MIN, DEVELOPER_MAX);
  if (developer?.includes("@")) fail("developer", "Debe ser el nombre que se muestra, no un correo.");
  const description = text("description", APP_DESCRIPTION_MIN, APP_DESCRIPTION_MAX);

  const languageSet = new Set<string>([...SUPPORTED_LANGUAGES, ...(opts.builtIn ? BUILTIN_LANGUAGES : [])]);
  const languages = list("languages", languageSet, (l) => `«${l}» no es un idioma que Lente admita (${SUPPORTED_LANGUAGES.join(", ")}).`);
  if (languages && (languages.length < 1 || languages.length > LANGUAGES_MAX)) fail("languages", `Debe listar entre 1 y ${LANGUAGES_MAX} idiomas.`);

  let engine: Engine | undefined;
  if (json.engine !== undefined) {
    if (!opts.builtIn) fail("engine", "Solo las apps integradas de Lente se conectan a un motor.");
    else if (typeof json.engine !== "string" || !(ENGINES as readonly string[]).includes(json.engine)) fail("engine", `Debe ser uno de: ${ENGINES.join(", ")}.`);
    else engine = json.engine as Engine;
  }

  const inputSet = new Set<string>([...APP_INPUTS, ...ENGINE_INPUTS]);
  const inputs = list("inputs", inputSet, (i) => `«${i}» no es una entrada que una app pueda pedir (${APP_INPUTS.join(", ")}).`) as AppInput[] | undefined;
  if (inputs?.includes("room") && !engine) fail("inputs", "«room» (escuchar a quienes te rodean) solo lo usan las apps integradas con motor.");

  const toolSet = new Set<string>([...Object.keys(APP_TOOLS), ...Object.keys(ENGINE_TOOLS)]);
  const tools = list("tools", toolSet, (t) => `«${t}» no es una herramienta disponible para apps.`);
  if (tools && !opts.builtIn) for (const t of tools) if (t in ENGINE_TOOLS) fail("tools", `«${t}» solo la usan las apps integradas de Lente.`);

  const permissions = list("permissions", new Set<string>(PERMISSIONS), (p) => `«${p}» no es un permiso de Lente (${PERMISSIONS.join(", ")}).`) as Permission[] | undefined;
  if (permissions && inputs && tools) {
    /** Every permission something asks for, with who asks. */
    const needed = new Map<Permission, string>();
    for (const i of inputs) if (!needed.has(INPUT_NEEDS[i])) needed.set(INPUT_NEEDS[i], `la entrada «${i}»`);
    for (const t of tools) {
      const need = APP_TOOLS[t] ?? ENGINE_TOOLS[t];
      if (need && !needed.has(need)) needed.set(need, `la herramienta «${t}»`);
    }
    if (engine) for (const p of ENGINE_NEEDS[engine]) if (!needed.has(p)) needed.set(p, `el motor «${engine}»`);
    for (const [p, who] of needed) if (!permissions.includes(p)) fail("permissions", `Falta el permiso «${p}»: lo necesita ${who}.`);
    for (const p of permissions) if (!needed.has(p)) fail("permissions", `«${p}» no lo usa ninguna entrada ni herramienta; quítalo.`);
  }

  const persona = text("persona", PERSONA_MIN, PERSONA_MAX);
  if (persona) for (const problem of personaProblems(persona)) fail("persona", problem);

  let lookPrompt: string | undefined;
  if (json.lookPrompt !== undefined) {
    lookPrompt = text("lookPrompt", 1, LOOK_PROMPT_MAX);
    if (tools && !tools.includes("look")) fail("lookPrompt", "Solo sirve con la herramienta «look».");
  }

  const content: ContentItem[] = [];
  if (json.content !== undefined) {
    if (!Array.isArray(json.content)) fail("content", "Debe ser una lista.");
    else if (json.content.length > CONTENT_MAX_ITEMS) fail("content", `Puede tener hasta ${CONTENT_MAX_ITEMS} elementos (tiene ${json.content.length}).`);
    else {
      const seen = new Set<string>();
      let total = 0;
      json.content.forEach((item: unknown, n: number) => {
        const field = `content[${n}]`;
        if (!isObject(item) || Object.keys(item).some((k) => !["id", "title", "text"].includes(k))) return fail(field, "Debe tener solo «id», «title» y «text».");
        const { id: itemId, title, text: body } = item;
        if (typeof itemId !== "string" || !CONTENT_ID_PATTERN.test(itemId)) return fail(`${field}.id`, "Debe ser de 1 a 32 letras minúsculas, números o guiones.");
        if (seen.has(itemId)) return fail(`${field}.id`, `«${itemId}» está repetido.`);
        seen.add(itemId);
        if (typeof title !== "string" || !title.trim() || chars(title.trim()) > CONTENT_TITLE_MAX) return fail(`${field}.title`, `Debe tener entre 1 y ${CONTENT_TITLE_MAX} caracteres.`);
        if (typeof body !== "string" || !body.trim() || chars(body.trim()) > CONTENT_TEXT_MAX) return fail(`${field}.text`, `Debe tener entre 1 y ${CONTENT_TEXT_MAX} caracteres.`);
        total += chars(title.trim()) + chars(body.trim());
        content.push({ id: itemId, title: title.trim(), text: body.trim() });
      });
      if (total > CONTENT_TOTAL_MAX) fail("content", `Todo el contenido junto puede tener hasta ${CONTENT_TOTAL_MAX} caracteres (tiene ${total}).`);
    }
  }

  let price: Price | undefined;
  if (json.price !== undefined) {
    const p = json.price;
    if (isObject(p) && p.model === "free" && Object.keys(p).length === 1) price = { model: "free" };
    else if (isObject(p) && p.model === "trial" && Object.keys(p).length === 2 && Number.isInteger(p.days) && (p.days as number) >= TRIAL_DAYS_MIN && (p.days as number) <= TRIAL_DAYS_MAX) price = { model: "trial", days: p.days as number };
    else fail("price", `Debe ser { "model": "free" } o { "model": "trial", "days": ${TRIAL_DAYS_MIN}–${TRIAL_DAYS_MAX} }.`);
  }

  if (errors.length) return { ok: false, errors };
  const manifest: AppManifest = {
    manifest: MANIFEST_FORMAT,
    id: id!,
    version: version!,
    name: name!,
    icon: icon!,
    developer: developer!,
    description: description!,
    languages: languages!,
    inputs: inputs!,
    permissions: PERMISSIONS.filter((p) => permissions!.includes(p)),
    tools: tools!,
    persona: persona!,
    ...(lookPrompt ? { lookPrompt } : {}),
    content,
    price: price!,
    ...(engine ? { engine } : {}),
  };
  return { ok: true, manifest };
}
