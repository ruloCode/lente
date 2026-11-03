// Proyectos: the active ones as cards and the archived ones folded; a project with its open tasks
// and meetings, renamed, merged into another, archived or restored.

import { getJson, post } from "../api.js";
import { app } from "../app.js";
import { button, confirm, dialog, empty, failed, h, icon, loading, prompt, sectionTitle, toast } from "../dom.js";
import { dayTime, timeRange } from "../lib/format.js";
import { meetingPath, pathFor } from "../lib/routes.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, refreshProjects, store } from "../store.js";
import { projectCard } from "./home.js";

export function projectsView() {
  const life = lifecycle();
  const list = reactive(["projects"], () => {
    if (!store.projectsLoaded) return loading("Cargando proyectos…");
    const active = store.projects.filter((p) => p.status === "active");
    const archived = store.projects.filter((p) => p.status !== "active");
    return [
      active.length ? h("ul", { class: "project-grid", role: "list" }, active.map((p) => h("li", {}, projectCard(p)))) : empty("folder", "Aún no hay proyectos", "Lente agrupa tus reuniones en proyectos después de cada una."),
      archived.length ? h("details", { class: "done-block" }, h("summary", {}, `Archivados (${archived.length})`), h("ul", { class: "plain-list card", role: "list" }, archived.map((p) => h("li", {}, h("a", { class: "row-link", href: pathFor("project", { id: p.id }) }, icon("folder"), h("span", { class: "grow" }, p.name), h("span", { class: "muted small" }, `${p.meetings} reuniones`), icon("chevron")))))) : null,
    ];
  });
  life.track(list.off);
  return { title: "Proyectos", el: h("div", { class: "page" }, h("header", { class: "page-head" }, h("h1", {}, "Proyectos")), list.el), destroy: life.teardown };
}

export function projectView(params) {
  const life = lifecycle();
  const data = { state: "loading", body: null };
  const load = async () => {
    try {
      data.body = await getJson(`/projects/get?id=${encodeURIComponent(params.id)}`);
      data.state = "ok";
    } catch (error) {
      data.state = error?.status === 404 ? "missing" : "error";
    }
    emit(["project-detail"]);
  };
  void load();
  const view = reactive(["project-detail", "projects"], () => {
    if (data.state === "loading") return loading();
    if (data.state === "missing") return empty("folder", "Ese proyecto no existe", "Quizá se juntó con otro.", h("a", { class: "btn", href: pathFor("projects") }, "Ver proyectos"));
    if (data.state === "error") return failed("No se pudo abrir el proyecto.", load);
    const { project, meetings, tasks } = data.body;
    const archived = project.status !== "active";
    return [
      h(
        "header",
        { class: "page-head" },
        h("div", {}, h("a", { class: "back", href: pathFor("projects") }, icon("back"), "Proyectos"), h("h1", {}, project.name, archived ? h("span", { class: "tag neutral" }, "Archivado") : null)),
        h(
          "div",
          { class: "row" },
          button("Renombrar", { onclick: () => rename(project, load) }, "edit"),
          archived ? null : button("Juntar con…", { onclick: () => merge(project) }, "folder"),
          button(archived ? "Reactivar" : "Archivar", { onclick: () => setArchived(project, !archived, load) }, archived ? "refresh" : "download"),
        ),
      ),
      h("div", { class: "two-col" }, h("section", {}, sectionTitle("Pendientes", tasks.length), tasks.length ? h("ul", { class: "plain-list card", role: "list" }, tasks.map((t) => h("li", {}, h("a", { class: "row-link", href: t.meetingId ? meetingPath(t.meetingId) : pathFor("tasks") }, icon("check"), h("span", { class: "grow" }, t.title), t.due ? h("span", { class: "muted small" }, t.due) : null)))) : h("p", { class: "muted" }, "Nada pendiente.")), h("section", {}, sectionTitle("Reuniones", meetings.length), meetings.length ? h("ul", { class: "plain-list card", role: "list" }, meetings.map((m) => h("li", {}, h("a", { class: "row-link", href: meetingPath(m.id) }, icon("calendar"), h("span", { class: "grow" }, m.title || "Reunión"), h("span", { class: "muted small num" }, dayTime(m.startedAt, Date.now()), m.endedAt ? ` · ${timeRange(m.startedAt, m.endedAt).split(" – ")[1]}` : ""))))) : h("p", { class: "muted" }, "Sin reuniones."))),
    ];
  });
  life.track(view.off);
  return { title: "Proyecto", el: h("div", { class: "page" }, view.el), destroy: life.teardown };
}

async function rename(project, reload) {
  const name = await prompt("Renombrar proyecto", { label: "Nombre", value: project.name, max: 40 });
  if (!name || name === project.name) return;
  const res = await post("/projects/rename", { id: project.id, name });
  if (!res.ok) return toast("No se pudo renombrar.", { tone: "warn" });
  await Promise.all([reload(), refreshProjects()]);
}

async function merge(project) {
  const others = store.projects.filter((p) => p.id !== project.id && p.status === "active");
  if (!others.length) return toast("No hay otro proyecto activo con cuál juntarlo.");
  const into = await dialog(`Juntar «${project.name}» con…`, (close) => {
    const select = h("select", { class: "field", "aria-label": "Proyecto de destino", autofocus: true }, others.map((p) => h("option", { value: p.id }, p.name)));
    return h("form", { class: "stack", onsubmit: (e) => (e.preventDefault(), close(select.value)) }, h("p", { class: "muted" }, "Sus reuniones pasan al otro proyecto y este queda archivado."), select, h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(undefined) }), h("button", { type: "submit", class: "btn primary" }, "Juntar")));
  });
  if (!into) return;
  const res = await post("/projects/merge", { id: project.id, into });
  if (!res.ok) return toast("No se pudo juntar.", { tone: "warn" });
  await refreshProjects();
  toast("Proyectos juntados");
  app.navigate(pathFor("project", { id: into }), { replace: true });
}

async function setArchived(project, archive, reload) {
  if (archive && !(await confirm("Archivar proyecto", `«${project.name}» deja de salir en Inicio. Puedes reactivarlo cuando quieras.`, { yes: "Archivar" }))) return;
  const res = await post(archive ? "/projects/archive" : "/projects/restore", { id: project.id });
  if (!res.ok) return toast("No se pudo cambiar el proyecto.", { tone: "warn" });
  await Promise.all([reload(), refreshProjects()]);
}
