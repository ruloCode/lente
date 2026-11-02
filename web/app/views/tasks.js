// Tareas: what the closing agent proposes (approve or reject, with a preview), then the open tasks
// grouped by who does them or by project, with filters; add, reassign, done and delete with undo;
// the done ones folded at the end.

import { post } from "../api.js";
import { button, dialog, empty, h, icon, iconButton, loading, sectionTitle, toast } from "../dom.js";
import { actionPreview, actionTitle, editedArgs } from "../lib/actions.js";
import { dayLabel, hhmm } from "../lib/format.js";
import { meetingPath } from "../lib/routes.js";
import { doneTasks, filterTasks, groupByOwner, groupByProject, nextOwner, projectNames } from "../lib/tasks.js";
import { OWNERS, OWNER_TAG, TOOL_LABEL, ownerTag } from "../lib/words.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, store } from "../store.js";

const TOOL_ICON = { draft_email: "mail", create_task: "task", create_reminder: "bell" };

export function tasksView() {
  const life = lifecycle();
  const ui = { by: "owner", project: "", owner: "", hiding: new Set(), open: "" };
  const redraw = () => emit(["tasks-ui"]);

  const approvals = reactive(["actions", "tasks-ui"], () => {
    const pending = store.state.pending;
    if (!pending.length) return null;
    return h("section", { class: "approvals", "aria-labelledby": "approvals-title" }, sectionTitle("Por aprobar", pending.length), h("ul", { role: "list", class: "approval-list" }, pending.map((a) => h("li", {}, approvalCard(a, ui, redraw)))), h("p", { class: "fine" }, icon("info"), "Lente no hace nada sin tu aprobación."));
  });

  const list = reactive(["actions", "tasks-ui"], () => {
    if (!store.state.loaded.actions) return loading("Cargando tareas…");
    const visible = store.state.tasks.filter((t) => !ui.hiding.has(t.id));
    const filtered = filterTasks(visible, { project: ui.project, owner: ui.owner });
    const groups = ui.by === "owner" ? groupByOwner(filtered) : groupByProject(filtered);
    const done = doneTasks(filtered);
    const names = projectNames(visible);
    const controls = h(
      "div",
      { class: "toolbar" },
      h("div", { class: "segmented", role: "radiogroup", "aria-label": "Agrupar" }, [["owner", "Por quién"], ["project", "Por proyecto"]].map(([v, l]) => h("label", {}, h("input", { type: "radio", name: "by", value: v, checked: ui.by === v, onchange: () => ((ui.by = v), redraw()) }), h("span", {}, l)))),
      h("span", { class: "grow" }),
      h("label", { class: "filter" }, h("span", { class: "sr-only" }, "Proyecto"), h("select", { "data-key": "f-project", onchange: (e) => ((ui.project = e.target.value), redraw()) }, h("option", { value: "" }, "Todos los proyectos"), names.map((n) => h("option", { value: n, selected: ui.project === n }, n)))),
      h("label", { class: "filter" }, h("span", { class: "sr-only" }, "Quién"), h("select", { "data-key": "f-owner", onchange: (e) => ((ui.owner = e.target.value), redraw()) }, h("option", { value: "" }, "Todos"), OWNERS.map((o) => h("option", { value: o, selected: ui.owner === o }, OWNER_TAG[o])))),
    );
    const body = groups.length
      ? groups.map((g) => h("section", { class: "task-group", "aria-label": g.label }, sectionTitle(g.label, g.tasks.length), h("ul", { role: "list", class: "task-list card" }, g.tasks.map((t) => h("li", {}, taskRow(t, ui, redraw))))))
      : [empty("check", ui.project || ui.owner ? "Nada con estos filtros" : "No tienes tareas abiertas", "Lente saca las tareas de cada reunión. También puedes agregar una aquí arriba.")];
    const doneBlock = done.length ? h("details", { class: "done-block" }, h("summary", {}, `Hechas (${done.length})`), h("ul", { role: "list", class: "task-list card" }, done.map((t) => h("li", {}, taskRow(t, ui, redraw))))) : null;
    return [controls, ...body, doneBlock];
  });

  [approvals, list].forEach((r) => life.track(r.off));
  return { title: "Tareas", el: h("div", { class: "page tasks" }, h("header", { class: "page-head" }, h("h1", {}, "Tareas")), addForm(), approvals.el, list.el), destroy: life.teardown };
}

function addForm() {
  const title = h("input", { class: "field grow", placeholder: "Nueva tarea…", maxlength: "140", "aria-label": "Nueva tarea", required: true });
  const who = h("select", { class: "field auto", "aria-label": "Quién la hace" }, OWNERS.map((o) => h("option", { value: o }, OWNER_TAG[o])));
  const other = h("input", { class: "field auto", placeholder: "¿Quién?", maxlength: "60", "aria-label": "Nombre de la otra persona", hidden: true });
  const due = h("input", { class: "field auto", placeholder: "Para cuándo (opcional)", maxlength: "40", "aria-label": "Para cuándo" });
  who.addEventListener("change", () => (other.hidden = who.value !== "other"));
  return h(
    "form",
    {
      class: "card add-task",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!title.value.trim()) return;
        const res = await post("/tasks/add", { title: title.value.trim(), who: who.value, ...(who.value === "other" && other.value.trim() ? { otherName: other.value.trim() } : {}), ...(due.value.trim() ? { due: due.value.trim() } : {}) });
        if (!res.ok) return toast("No se pudo agregar la tarea.", { tone: "warn" });
        title.value = due.value = other.value = "";
        toast("Tarea agregada");
        title.focus();
      },
    },
    icon("plus", "add-icon"),
    title,
    who,
    other,
    due,
    h("button", { type: "submit", class: "btn primary" }, "Agregar"),
  );
}

function taskRow(t, ui, redraw) {
  const meta = [t.projectName || null, t.meetingTitle ? h("a", { href: meetingPath(t.meetingId) }, t.meetingTitle) : null, t.due ? `Para: ${t.due}` : null].filter(Boolean);
  return h(
    "div",
    { class: `task${t.done ? " done" : ""}` },
    h("input", { type: "checkbox", class: "check", checked: t.done, "aria-label": t.done ? `Marcar «${t.title}» como pendiente` : `Marcar «${t.title}» como hecha`, onchange: (e) => setDone(t, e.target.checked) }),
    h("div", { class: "task-main" }, h("p", { class: "task-title" }, t.title), meta.length ? h("p", { class: "task-meta muted" }, meta.flatMap((m, i) => (i ? [" · ", m] : [m]))) : null),
    t.done ? null : h("button", { type: "button", class: `owner-tag ${t.who ?? "me"}`, title: "Cambiar quién la hace", "aria-label": `La hace: ${ownerTag(t)}. Cambiar`, onclick: () => reassign(t) }, ownerTag(t)),
    iconButton("trash", `Borrar «${t.title}»`, { onclick: () => remove(t, ui, redraw) }),
  );
}

async function setDone(t, done) {
  const res = await post("/tasks/done", { id: t.id, done });
  if (!res.ok) return toast("No se pudo cambiar la tarea.", { tone: "warn" });
  if (done && (await toast(`Hecha: ${t.title}`, { action: "Deshacer" }))) await post("/tasks/done", { id: t.id, done: false });
}

async function reassign(t) {
  const who = nextOwner(t.who);
  if (who === "other") {
    const name = await dialog("¿Quién la hace?", (close) => {
      const input = h("input", { class: "field", maxlength: "60", placeholder: "Nombre", "aria-label": "Nombre", value: t.otherName ?? "", autofocus: true });
      return h("form", { class: "stack", onsubmit: (e) => (e.preventDefault(), close(input.value.trim() || "")) }, input, h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(undefined) }), h("button", { type: "submit", class: "btn primary" }, "Guardar")));
    });
    if (name === undefined) return;
    await post("/tasks/update", { id: t.id, who, otherName: name });
  } else await post("/tasks/update", { id: t.id, who });
}

/** Deleting waits for the toast: «Deshacer» keeps the task, and only then is it deleted on the hub. */
async function remove(t, ui, redraw) {
  ui.hiding.add(t.id);
  redraw();
  const undone = await toast(`Borrada: ${t.title}`, { action: "Deshacer" });
  if (!undone) {
    const res = await post("/tasks/delete", { id: t.id });
    if (!res.ok && res.status !== 404) toast("No se pudo borrar la tarea.", { tone: "warn" });
  }
  ui.hiding.delete(t.id);
  redraw();
}

function approvalCard(a, ui, redraw) {
  const preview = actionPreview(a);
  const open = ui.open === a.id;
  const head = h(
    "button",
    { type: "button", class: "approval-head", "aria-expanded": String(open), onclick: () => ((ui.open = open ? "" : a.id), redraw()) },
    h("span", { class: "tool-icon" }, icon(TOOL_ICON[a.tool] ?? "sparkle")),
    h("span", { class: "approval-text" }, h("strong", {}, actionTitle(a)), h("span", { class: "muted small" }, `${TOOL_LABEL[a.tool] ?? "Acción"} propuesta${a.meetingTitle ? ` · ${a.meetingTitle}` : ""} · ${dayLabel(a.createdAt, Date.now())}`)),
    icon("chevron", open ? "rot" : ""),
  );
  if (!open) return h("article", { class: "card approval" }, head);
  const edits = {};
  const fields = h(
    "dl",
    { class: "preview-fields" },
    preview.fields.flatMap((f) => {
      const key = preview.kind === "email" && f.label === "Asunto" ? "subject" : preview.kind !== "email" && preview.editable.includes("title") && f.label !== "Fecha" && f.label !== "Para cuándo" ? "title" : null;
      return [h("dt", {}, f.label), h("dd", {}, key ? h("input", { class: "field", value: f.value, "aria-label": f.label, oninput: (e) => (edits[key] = e.target.value) }) : f.value)];
    }),
  );
  const body = preview.kind === "email" ? h("textarea", { class: "field mail-body", rows: "8", "aria-label": "Cuerpo del correo", oninput: (e) => (edits.body = e.target.value) }, preview.body) : preview.body ? h("p", { class: "muted" }, preview.body) : null;
  const quotes = (a.quotes ?? []).filter((q) => q.text);
  const decide = async (decision) => {
    const res = await post("/actions/decide", { id: a.id, decision, ...(decision === "approve" ? { args: editedArgs(a.args ?? {}, edits) } : {}) });
    if (!res.ok) return toast(res.body?.error ?? "No se pudo decidir.", { tone: "warn" });
    toast(decision === "approve" ? (res.body?.status === "failed" ? "Aprobada, pero falló al hacerse" : "Aprobada") : "Rechazada");
    if (decision === "approve" && a.tool === "draft_email") navigator.clipboard?.writeText(editedArgs(a.args ?? {}, edits).body ?? "").catch(() => {});
  };
  return h(
    "article",
    { class: "card approval open" },
    head,
    h("div", { class: "approval-body" }, fields, body, quotes.length ? h("div", { class: "why" }, h("h3", { class: "cap" }, "Por qué lo propongo"), h("ul", { role: "list" }, quotes.map((q) => h("li", {}, h("a", { class: "quote", href: meetingPath(a.meetingId, q.id) }, icon("wave"), h("span", {}, `«${q.text}»`), q.at ? h("span", { class: "muted num" }, hhmm(q.at)) : null))))) : null),
    h("div", { class: "row end" }, button("Rechazar", { onclick: () => decide("reject") }), button("Aprobar", { class: "btn primary", onclick: () => decide("approve") }, "check")),
    preview.kind === "email" ? h("p", { class: "fine" }, "Lente no envía correos: al aprobar, el borrador queda copiado para pegarlo en tu correo.") : null,
  );
}

