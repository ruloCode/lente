// Reuniones: the library by day with a search on the left, the open meeting on the right: notes
// (summary, decisions, commitments, open questions, glossary), the transcript with speakers, the
// project, share and delete. Imported meetings carry «Importada».

import { getJson, post } from "../api.js";
import { app } from "../app.js";
import { button, confirm, empty, failed, h, icon, iconButton, loading, toast } from "../dom.js";
import { dayLabel, duration, hhmm, timeRange } from "../lib/format.js";
import { groupByDay, isImported, meetingTitle, topicTone, topicsIn } from "../lib/meetings.js";
import { meetingPath, pathFor } from "../lib/routes.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, refreshProjects, store } from "../store.js";

export function meetingsView(params, query) {
  const life = lifecycle();
  const ui = { q: "", topic: "", results: null, timer: 0 };
  const redraw = () => emit(["meetings-ui"]);
  const search = h("input", { class: "field search", type: "search", placeholder: "Buscar en títulos, notas y transcripciones", "aria-label": "Buscar reuniones", "data-key": "m-search" });
  search.addEventListener("input", () => {
    ui.q = search.value;
    clearTimeout(ui.timer);
    if (!ui.q.trim()) return ((ui.results = null), redraw());
    ui.timer = setTimeout(async () => {
      try {
        const { results } = await getJson(`/meetings/search?q=${encodeURIComponent(ui.q.trim())}`);
        ui.results = results ?? [];
      } catch {
        ui.results = [];
      }
      redraw();
    }, 220);
  });
  const list = reactive(["meetings", "meetings-ui"], () => {
    if (!store.state.loaded.meetings) return loading("Cargando reuniones…");
    if (ui.results) return searchResults(ui.results, params.id);
    const all = store.state.meetings.filter((m) => !ui.topic || m.topic === ui.topic);
    const topics = topicsIn(store.state.meetings);
    return [
      topics.length ? h("div", { class: "chips", role: "group", "aria-label": "Tema" }, [["", "Todas"], ...topics.map((t) => [t, t])].map(([v, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(ui.topic === v), onclick: () => ((ui.topic = v), redraw()) }, l))) : null,
      all.length ? groupByDay(all, Date.now()).map((g) => h("section", { class: "day-group" }, h("h2", { class: "cap" }, g.label), h("ul", { role: "list", class: "meeting-list" }, g.items.map((m) => h("li", {}, meetingRow(m, params.id)))))) : empty("calendar", "Aún no hay reuniones", "Graba una con el clip o con esta computadora.", button("Grabar", { class: "btn primary", onclick: () => app.openRecord() }, "record")),
    ];
  }, { cls: "list-scroll" });
  life.track(list.off);
  const detail = params.id ? meetingDetail(params.id, query?.get("turno") ?? "", life) : h("div", { class: "detail-empty" }, empty("calendar", "Elige una reunión", "Sus notas y su transcripción se abren aquí."));
  return { title: "Reuniones", el: h("div", { class: `page split${params.id ? " has-detail" : ""}` }, h("section", { class: "split-list", "aria-label": "Reuniones" }, h("header", { class: "page-head compact" }, h("h1", {}, "Reuniones")), search, list.el), h("section", { class: "split-detail", "aria-label": "Detalle de la reunión" }, detail)), destroy: life.teardown };
}

function meetingRow(m, openId) {
  const running = m.status === "running" || m.status === "extracting";
  return h(
    "a",
    { class: `meeting-row${m.id === openId ? " selected" : ""}`, href: meetingPath(m.id), "aria-current": m.id === openId ? "page" : null },
    h("div", { class: "meeting-top" }, h("strong", {}, meetingTitle(m)), m.topic ? h("span", { class: `topic ${topicTone(m.topic)}` }, m.topic) : null, isImported(m) ? h("span", { class: "tag neutral" }, "Importada") : null, running ? h("span", { class: "tag live" }, m.status === "running" ? "En curso" : "Escribiendo notas") : null),
    h("p", { class: "muted small num" }, icon("calendar"), timeRange(m.startedAt, m.endedAt), m.endedAt ? ` · ${duration(m.endedAt - m.startedAt)}` : ""),
    m.notes?.summary ? h("p", { class: "summary-line" }, m.notes.summary) : null,
  );
}

function searchResults(results, openId) {
  if (!results.length) return empty("search", "Nada con eso", "Prueba otra palabra.");
  return h("ul", { role: "list", class: "meeting-list" }, results.map((r) => h("li", {}, h("a", { class: `meeting-row${r.id === openId ? " selected" : ""}`, href: meetingPath(r.id, r.matches?.find((x) => x.turnId)?.turnId) }, h("div", { class: "meeting-top" }, h("strong", {}, r.title || "Reunión"), h("span", { class: "muted small" }, dayLabel(r.startedAt, Date.now()))), (r.matches ?? []).slice(0, 2).map((x) => h("p", { class: "summary-line" }, `«${x.line}»`))))));
}

function meetingDetail(id, turn, life) {
  const d = { state: "loading", m: null, tab: turn ? "transcript" : "notes", highlight: turn, confirmDelete: 0 };
  const redraw = () => emit(["meeting-detail"]);
  const load = async () => {
    try {
      d.m = await getJson(`/meetings/get?id=${encodeURIComponent(id)}`);
      d.state = "ok";
    } catch (error) {
      d.state = error?.status === 404 ? "missing" : "error";
    }
    redraw();
    if (d.highlight) requestAnimationFrame(() => document.getElementById(`turn-${d.highlight}`)?.scrollIntoView({ block: "center" }));
  };
  void load();
  const view = reactive(["meeting-detail", "projects"], () => {
    if (d.state === "loading") return loading();
    if (d.state === "missing") return empty("calendar", "Esa reunión ya no está", "Quizá la borraste.", h("a", { class: "btn", href: pathFor("meetings") }, "Ver reuniones"));
    if (d.state === "error") return failed("No se pudo abrir la reunión.", load);
    const m = d.m;
    const n = m.notes;
    const openTurn = (tid) => {
      if (!tid) return;
      d.tab = "transcript";
      d.highlight = tid;
      redraw();
      requestAnimationFrame(() => document.getElementById(`turn-${tid}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    };
    const item = (text, evidence, extra) => h("li", {}, evidence?.[0] ? h("button", { type: "button", class: "evidence", onclick: () => openTurn(evidence[0]), title: "Ver en la transcripción" }, extra ? h("strong", {}, extra) : null, text, icon("chevron")) : [extra ? h("strong", {}, extra) : null, text]);
    const section = (title, ic, items) => (items?.length ? h("section", { class: "note-block card" }, h("h3", { class: "cap" }, icon(ic), title), h("ul", { role: "list" }, items)) : null);
    const notes = n
      ? [
          n.summary ? h("section", { class: "note-block card" }, h("h3", { class: "cap" }, icon("list"), "Resumen"), h("p", {}, n.summary)) : null,
          section("Decisiones", "check", n.decisions?.map((x) => item(x.text, x.evidence))),
          section("Compromisos", "people", n.commitments?.map((c) => item(`${c.what}${c.due ? ` (${c.due})` : ""}`, c.evidence, c.owner === "you" ? "Tú: " : c.owner ? `${c.owner}: ` : ""))),
          section("Preguntas abiertas", "info", n.openQuestions?.map((x) => item(x.text, x.evidence))),
          n.glossary?.length ? h("section", { class: "note-block card" }, h("h3", { class: "cap" }, icon("brain"), "Glosario"), h("dl", { class: "glossary" }, n.glossary.flatMap((g) => [h("dt", {}, g.term), h("dd", {}, g.meaning)]))) : null,
        ]
      : [h("p", { class: "muted" }, m.status === "running" ? "La reunión sigue en curso: las notas llegan al terminar." : m.status === "extracting" ? "Lente está escribiendo las notas…" : "Esta reunión no tiene notas.")];
    const turns = h("ol", { class: "turns full", "aria-label": "Transcripción" }, (m.turnList ?? []).map((t) => h("li", { id: `turn-${t.id}`, class: `turn${t.id === d.highlight ? " highlight" : ""}` }, h("span", { class: "turn-time num muted" }, hhmm(t.at)), h("div", {}, h("p", { class: "turn-who" }, t.wearer ? "Tú" : t.speaker || "Alguien"), h("p", { class: "turn-text" }, t.text)))));
    const active = store.projects.filter((p) => p.status === "active");
    return [
      h(
        "header",
        { class: "detail-head" },
        h("a", { class: "back", href: pathFor("meetings") }, icon("back"), "Reuniones"),
        h("div", { class: "row" }, h("h2", { class: "detail-title grow" }, m.title || m.topic || "Reunión"), iconButton("share", "Compartir las notas", { onclick: () => share(m) }), iconButton("trash", d.confirmDelete > Date.now() ? "Toca otra vez para borrar" : "Borrar la reunión", { class: `icon-btn${d.confirmDelete > Date.now() ? " danger" : ""}`, onclick: () => remove(m, d, redraw) })),
        h("div", { class: "chips meta" }, h("span", { class: "chip static" }, icon("calendar"), dayLabel(m.startedAt, Date.now())), h("span", { class: "chip static num" }, icon("wave"), timeRange(m.startedAt, m.endedAt)), m.endedAt ? h("span", { class: "chip static" }, duration(m.endedAt - m.startedAt)) : null, m.topic ? h("span", { class: `topic ${topicTone(m.topic)}` }, m.topic) : null, isImported(m) ? h("span", { class: "tag neutral" }, "Importada") : null),
        projectPicker(m, active),
      ),
      h("div", { class: "segmented tabs", role: "tablist", "aria-label": "Vista" }, [["notes", "Notas"], ["transcript", `Transcripción (${m.turnList?.length ?? 0})`]].map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": String(d.tab === k), class: d.tab === k ? "on" : "", onclick: () => ((d.tab = k), redraw()) }, l))),
      h("div", { role: "tabpanel", class: "tabpanel" }, d.tab === "notes" ? notes : turns.childElementCount ? turns : h("p", { class: "muted" }, "Sin transcripción.")),
    ];
  });
  life.track(view.off);
  return view.el;
}

/** The project of a meeting: shown and changed in place (POST /meetings/project). */
function projectPicker(m, active) {
  const label = h("label", { class: "project-pick" }, icon("folder"), h("span", { class: "sr-only" }, "Proyecto"));
  const select = h("select", { "data-key": `proj-${m.id}`, "aria-label": "Proyecto de la reunión" }, h("option", { value: "" }, "Sin proyecto"), active.map((p) => h("option", { value: p.id }, p.name)));
  label.append(select);
  // The meeting's project is not in its record: find it from the project details (cached per page).
  void projectOf(m.id).then((pid) => (select.value = pid ?? ""));
  select.addEventListener("change", async () => {
    const res = await post("/meetings/project", { id: m.id, project: select.value || null });
    if (!res.ok) return toast("No se pudo cambiar el proyecto.", { tone: "warn" });
    toast(select.value ? "Proyecto cambiado" : "Sin proyecto");
    void refreshProjects();
  });
  return label;
}

/** Which project each meeting is in, from one read-only route; refreshed after every change. */
const owners = new Map();
async function projectOf(meetingId) {
  try {
    const { assignments } = await getJson("/projects/assignments");
    owners.clear();
    for (const [mid, pid] of Object.entries(assignments ?? {})) owners.set(mid, pid);
  } catch {
    // Keep what was known.
  }
  return owners.get(meetingId) ?? null;
}

async function share(m) {
  const text = m.share || `${m.title}\n\n${m.notes?.summary ?? ""}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: m.title || "Reunión", text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await navigator.clipboard?.writeText(text);
  toast("Notas copiadas");
}

async function remove(m, d, redraw) {
  if (d.confirmDelete < Date.now()) {
    d.confirmDelete = Date.now() + 4000;
    redraw();
    toast("Toca el bote otra vez para borrar la reunión.", { ms: 4000 });
    setTimeout(redraw, 4100);
    return;
  }
  if (!(await confirm("Borrar reunión", `Se borran «${m.title || "la reunión"}», sus notas, sus tareas propuestas y lo que Lente aprendió de ella. No se puede deshacer.`, { yes: "Borrar", danger: true }))) return;
  const res = await post("/meetings/delete", { id: m.id });
  if (!res.ok) return toast(res.status === 404 ? "No se puede borrar una reunión en curso." : "No se pudo borrar.", { tone: "warn" });
  toast("Reunión borrada");
  app.navigate(pathFor("meetings"), { replace: true });
}
