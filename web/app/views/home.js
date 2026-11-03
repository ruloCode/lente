// Inicio: the greeting, the newest DILO card, the live transcript while recording, help on demand
// in Asistir, the projects first (up to three) and what waits for approval.

import { post } from "../api.js";
import { app } from "../app.js";
import { button, h, icon, sectionTitle, toast } from "../dom.js";
import { ago, hhmm } from "../lib/format.js";
import { pathFor } from "../lib/routes.js";
import { count, greeting } from "../lib/words.js";
import { lifecycle, reactive } from "../reactive.js";
import { store } from "../store.js";

/** How long the last card stays on Inicio once listening stopped. */
const CARD_FRESH_MS = 30 * 60_000;

const HELP = [
  { kind: "aportar", label: "Aportar", icon: "plus" },
  { kind: "pregunta", label: "Pregunta", icon: "sparkle" },
  { kind: "tema", label: "¿De qué hablan?", icon: "info" },
];

export function homeView() {
  const life = lifecycle();
  const head = reactive(["status"], () => {
    const now = Date.now();
    return h("header", { class: "page-head" }, h("div", {}, h("p", { class: "eyebrow" }, new Date(now).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })), h("h1", {}, greeting(store.state.status?.names, new Date().getHours()))), button("Grabar", { class: "btn primary", onclick: () => app.openRecord() }, "record"));
  });
  const live = reactive(["status", "transcript", "cue"], liveSection);
  const projects = reactive(["projects", "actions"], projectsSection);
  const approvals = reactive(["actions"], () => {
    const n = store.state.pending.length;
    if (!n) return null;
    return h("a", { class: "notice", href: pathFor("tasks") }, icon("bell"), h("span", {}, h("strong", {}, count(n, "acción", "acciones")), " de Lente esperan tu aprobación"), icon("chevron"));
  });
  [head, live, projects, approvals].forEach((r) => life.track(r.off));
  return { title: "Inicio", el: h("div", { class: "page home" }, head.el, approvals.el, live.el, projects.el), destroy: life.teardown };
}

function liveSection() {
  const s = store.state.status;
  const cue = store.state.cue;
  const listening = Boolean(s?.listening);
  const parts = [];
  // While listening, only this session's card; otherwise the last one for half an hour.
  const since = listening ? s.session?.startedAt ?? 0 : Date.now() - CARD_FRESH_MS;
  if (cue && (cue.at ?? 0) >= since) parts.push(diloCard(cue));
  if (listening) {
    if (s.assistMode !== "record") parts.push(h("div", { class: "help-row", role: "group", "aria-label": "Ayuda ahora" }, HELP.map((x) => button(x.label, { class: "btn soft", onclick: (e) => askHelp(x.kind, e.currentTarget) }, x.icon))));
    parts.push(transcriptCard());
  }
  return parts.length ? h("section", { class: "live-grid", "aria-label": "En vivo" }, parts) : null;
}

/** The newest card: DILO with its meaning, Lente's answer, or a help card. */
export function diloCard(cue) {
  const dilo = /dilo/i.test(cue.label);
  return h(
    "article",
    { class: "dilo", "aria-label": dilo ? "Dilo" : cue.label },
    h("div", { class: "dilo-top" }, h("span", { class: "tag" }, icon("sparkle"), dilo ? "DILO" : cue.label), cue.asker ? h("span", { class: "muted" }, `Te preguntó ${cue.asker}`) : null, h("span", { class: "grow" }), cue.at ? h("span", { class: "muted num" }, hhmm(cue.at)) : null),
    h("p", { class: "dilo-line", lang: dilo ? "" : "es" }, cue.text),
    cue.meaning ? h("p", { class: "dilo-meaning" }, h("strong", {}, "Significa: "), cue.meaning) : null,
    h(
      "div",
      { class: "row" },
      cue.ms ? h("span", { class: "muted num" }, `${(cue.ms / 1000).toFixed(1)} s`) : null,
      h("span", { class: "grow" }),
      button("Copiar", { class: "btn soft small", onclick: () => navigator.clipboard?.writeText(cue.text).then(() => toast("Copiado")) }, "copy"),
      "speechSynthesis" in window ? button("Leer", { class: "btn soft small", onclick: () => (speechSynthesis.cancel(), speechSynthesis.speak(new SpeechSynthesisUtterance(cue.text))) }, "volume") : null,
    ),
  );
}

async function askHelp(kind, btn) {
  btn.disabled = true;
  const res = await post("/help", { kind }).catch(() => null);
  btn.disabled = false;
  if (!res?.ok) toast(res?.body?.message ?? "No se pudo pedir la ayuda.", { tone: "warn" });
}

/** The live transcript: the session's last turns and the sentence in progress. */
function transcriptCard() {
  const t = store.transcript;
  const rows = t.rows.slice(-8);
  return h(
    "article",
    { class: "card transcript-card", "aria-label": "Transcripción en vivo" },
    h("header", { class: "card-head" }, icon("wave"), h("h2", {}, "Transcripción en vivo")),
    rows.length || t.live
      ? h("ol", { class: "turns", "aria-live": "polite" }, rows.map(turnRow), t.live ? h("li", { class: "turn live" }, h("span", { class: "avatar", "aria-hidden": "true" }, "…"), h("div", {}, h("p", { class: "turn-text" }, t.live))) : null)
      : h("p", { class: "muted" }, "Esperando a que alguien hable…"),
  );
}

export function turnRow(r) {
  const who = r.speaker ? speakerName(r.speaker) : "Alguien";
  return h("li", { class: "turn" }, h("span", { class: "avatar", "aria-hidden": "true" }, who.slice(0, 1).toUpperCase()), h("div", {}, h("p", { class: "turn-who" }, who, h("span", { class: "muted num" }, hhmm(r.at))), h("p", { class: "turn-text" }, r.text)));
}

/** The wearer's label reads «Tú»; others keep their label. */
export function speakerName(label) {
  const wearer = store.state.status?.wearer;
  return wearer && label === wearer ? "Tú" : label;
}

function projectsSection() {
  const active = store.projects.filter((p) => p.status === "active");
  if (!store.projectsLoaded) return h("section", { class: "projects-block" }, sectionTitle("Tus proyectos"), h("p", { class: "loading muted" }, "Cargando proyectos…"));
  if (!active.length) {
    return h("section", { class: "projects-block" }, sectionTitle("Tus proyectos"), h("div", { class: "card soft-empty" }, icon("folder", "empty-icon"), h("p", {}, "Lente arma tus proyectos solo, a partir de tus reuniones."), button("Grabar una reunión", { class: "btn primary", onclick: () => app.openRecord() }, "record")));
  }
  return h(
    "section",
    { class: "projects-block", "aria-labelledby": "home-projects" },
    h("div", { class: "section-head" }, h("h2", { class: "cap", id: "home-projects" }, "Tus proyectos"), active.length > 3 ? h("a", { class: "link", href: pathFor("projects") }, `Ver los ${active.length} proyectos`) : null),
    h("ul", { class: "project-grid", role: "list" }, active.slice(0, 3).map((p) => h("li", {}, projectCard(p)))),
  );
}

export function projectCard(p) {
  const now = Date.now();
  return h(
    "a",
    { class: "card project-card", href: pathFor("project", { id: p.id }) },
    h("div", { class: "project-top" }, icon("folder", "project-icon"), h("h3", {}, p.name)),
    h("p", { class: "muted small" }, p.lastActivityAt ? `Última actividad ${ago(p.lastActivityAt, now)}` : "Sin actividad aún"),
    h("div", { class: "stats" }, stat(p.openTasks, "pendiente", "pendientes"), stat(p.meetingsThisWeek, "reunión esta semana", "reuniones esta semana")),
    p.next ? h("p", { class: "next" }, h("span", { class: "cap" }, "Próximo"), h("span", {}, p.next)) : h("p", { class: "next muted" }, "Nada pendiente"),
  );
}

const stat = (n, one, many) => h("span", { class: "stat" }, h("strong", { class: "num" }, String(n ?? 0)), " ", n === 1 ? one : many);
