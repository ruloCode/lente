// @ts-check
// The keyboard: one table for what each key does and for the "?" panel that lists them.

export const SHORTCUTS = [
  { action: "search", keys: ["⌘", "K"], label: "Buscar reuniones, tareas y proyectos" },
  { action: "chat", keys: ["⌘", "J"], label: "Abrir el chat con Lente" },
  { action: "record", keys: ["R"], label: "Grabar" },
  { action: "close", keys: ["Esc"], label: "Cerrar" },
  { action: "help", keys: ["?"], label: "Ver los atajos" },
];

/**
 * The action for a key press, or null. ⌘ is Ctrl outside the Mac. Single keys do nothing while the
 * user types in a field, so «R» in a text box is just an R.
 * @param {{ key: string, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, inField?: boolean }} e
 */
export function shortcutFor(e) {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = Boolean(e.metaKey || e.ctrlKey);
  if (mod && !e.altKey && key === "k") return "search";
  if (mod && !e.altKey && key === "j") return "chat";
  if (key === "Escape") return "close";
  if (mod || e.altKey || e.inField) return null;
  if (key === "r") return "record";
  if (key === "?") return "help";
  return null;
}
