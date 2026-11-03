// "?": the keyboard shortcuts, from the same table the keys use.

import { dialog, h } from "../dom.js";
import { SHORTCUTS } from "../lib/shortcuts.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function openHelp() {
  if (document.querySelector("dialog[open]")) return;
  return dialog("Atajos de teclado", () =>
    h(
      "dl",
      { class: "shortcuts" },
      SHORTCUTS.flatMap((s) => [h("dt", {}, s.keys.map((k) => h("kbd", {}, k === "⌘" && !isMac ? "Ctrl" : k))), h("dd", {}, s.label)]),
    ),
  );
}
