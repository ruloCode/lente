// ⌘K: search meetings, tasks and projects from anywhere. Titles and notes are searched in the page;
// transcripts are searched on the hub (/meetings/search) and listed below.

import { getJson } from "../api.js";
import { app } from "../app.js";
import { dialog, h, icon } from "../dom.js";
import { dayLabel } from "../lib/format.js";
import { meetingPath } from "../lib/routes.js";
import { searchAll } from "../lib/search.js";
import { store } from "../store.js";

const KIND_ICON = { project: "folder", meeting: "calendar", task: "check", line: "wave" };

export function openSearch() {
  if (document.querySelector("dialog.palette-dialog")) return;
  return dialog("Buscar", (close) => {
    let results = [];
    let selected = 0;
    let timer;
    const input = h("input", { class: "field palette-input", type: "search", placeholder: "Reuniones, tareas, proyectos o algo que se dijo", "aria-label": "Buscar", role: "combobox", "aria-expanded": "true", "aria-controls": "palette-list", autofocus: true });
    const list = h("ul", { id: "palette-list", class: "palette-list", role: "listbox", "aria-label": "Resultados" });
    const open = (r) => {
      close(true);
      app.navigate(r.href);
    };
    const draw = () => {
      list.replaceChildren(
        ...results.map((r, i) =>
          h("li", { role: "option", id: `opt-${i}`, "aria-selected": String(i === selected), class: "palette-item", onclick: () => open(r), onmousemove: () => { if (selected !== i) { selected = i; draw(); } } }, icon(KIND_ICON[r.kind]), h("span", { class: "palette-title" }, r.title), h("span", { class: "palette-hint" }, r.hint)),
        ),
      );
      if (!results.length && input.value.trim()) list.append(h("li", { class: "palette-empty muted" }, "Nada con eso."));
      input.setAttribute("aria-activedescendant", results.length ? `opt-${selected}` : "");
    };
    input.addEventListener("input", () => {
      const q = input.value;
      results = searchAll(q, { meetings: store.state.meetings, tasks: store.state.tasks, projects: store.projects });
      selected = 0;
      draw();
      clearTimeout(timer);
      if (q.trim().length < 3) return;
      timer = setTimeout(async () => {
        try {
          const { results: found } = await getJson(`/meetings/search?q=${encodeURIComponent(q.trim())}`);
          if (input.value !== q) return;
          const seen = new Set(results.map((r) => r.href));
          for (const m of found ?? []) {
            const line = m.matches?.find((x) => x.where === "transcript" || x.where === "notes");
            if (!line) continue;
            const href = meetingPath(m.id, line.turnId);
            if (seen.has(href)) continue;
            results.push({ kind: "line", id: `${m.id}:${line.turnId}`, title: line.line, hint: `${m.title || "Reunión"} · ${dayLabel(m.startedAt, Date.now())}`, href });
          }
          draw();
        } catch {
          // The page's own results stay.
        }
      }, 250);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!results.length) return;
        selected = (selected + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
        draw();
        list.querySelector(`#opt-${selected}`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && results[selected]) {
        e.preventDefault();
        open(results[selected]);
      }
    });
    draw();
    return h("div", { class: "palette" }, input, list, h("p", { class: "fine" }, "↑ ↓ para moverte · Enter para abrir · Esc para cerrar"));
  }, { wide: true }).then(() => undefined);
}
