// @ts-check
// The app's client routes (history API) and the sidebar's navigation.

/** @typedef {{ name: string, params: Record<string, string> }} Route */

/** Path patterns in order; `:id` captures one segment. */
const TABLE = [
  ["home", "/app"],
  ["tasks", "/app/tareas"],
  ["projects", "/app/proyectos"],
  ["project", "/app/proyectos/:id"],
  ["meetings", "/app/reuniones"],
  ["meeting", "/app/reuniones/:id"],
  ["memory", "/app/memoria"],
  ["today", "/app/hoy"],
  ["devices", "/app/dispositivos"],
  ["settings", "/app/ajustes"],
];

/** The route for a path; an unknown path under /app is Inicio. */
export function matchRoute(/** @type {string} */ path) {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/app";
  for (const [name, pattern] of TABLE) {
    const parts = pattern.split("/");
    const got = clean.split("/");
    if (parts.length !== got.length) continue;
    /** @type {Record<string, string>} */
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) {
        if (!got[i]) ok = false;
        else params[parts[i].slice(1)] = decodeURIComponent(got[i]);
      } else if (parts[i] !== got[i]) ok = false;
    }
    if (ok) return /** @type {Route} */ ({ name, params });
  }
  return /** @type {Route} */ ({ name: "home", params: {} });
}

/** The path of a route. */
export function pathFor(/** @type {string} */ name, /** @type {Record<string, string>} */ params = {}) {
  const row = TABLE.find(([n]) => n === name);
  if (!row) return "/app";
  return row[1].replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key] ?? ""));
}

/** A meeting opened at one of its turns: `/app/reuniones/<id>?turno=<turn>`. */
export function meetingPath(/** @type {string} */ id, /** @type {string | undefined} */ turn) {
  return pathFor("meeting", { id }) + (turn ? `?turno=${encodeURIComponent(turn)}` : "");
}

/** The sidebar: label, route and icon, in order; a detail route lights its list's entry. */
export const NAV = [
  { name: "home", label: "Inicio", icon: "home" },
  { name: "tasks", label: "Tareas", icon: "check" },
  { name: "projects", label: "Proyectos", icon: "folder", also: ["project"] },
  { name: "meetings", label: "Reuniones", icon: "calendar", also: ["meeting"] },
  { name: "memory", label: "Memoria", icon: "brain" },
  { name: "today", label: "Hoy", icon: "sun" },
  { name: "devices", label: "Dispositivos", icon: "devices" },
  { name: "settings", label: "Ajustes", icon: "gear" },
];

/** The sidebar entry a route belongs to. */
export function navFor(/** @type {string} */ routeName) {
  return NAV.find((n) => n.name === routeName || (n.also ?? []).includes(routeName))?.name ?? "home";
}
