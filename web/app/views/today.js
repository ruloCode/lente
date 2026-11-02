// Hoy: the line of the day, what was heard, what the camera saw, the cards and the summaries,
// with today's listening time and spend.

import { getJson } from "../api.js";
import { empty, failed, h, icon, loading } from "../dom.js";
import { clock, hhmm, money, startOfDay } from "../lib/format.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, store } from "../store.js";
import { speakerName } from "./home.js";

const FILTERS = [
  ["", "Todo"],
  ["turn", "Escuchado"],
  ["seen", "Visto"],
  ["cue", "Tarjetas"],
  ["summary", "Resúmenes"],
];

const kindOf = (e) => (e.kind === "live" || (e.kind === "cue" && e.label === "ON SCREEN") ? "seen" : e.kind);

export function todayView() {
  const life = lifecycle();
  const d = { state: "loading", entries: [], filter: "" };
  const redraw = () => emit(["today"]);
  const load = async () => {
    try {
      d.entries = (await getJson("/day")).entries ?? [];
      d.state = "ok";
    } catch {
      d.state = "error";
    }
    redraw();
  };
  void load();
  const view = reactive(["today", "entries", "spend", "recorded"], () => {
    if (d.state === "loading") return loading();
    if (d.state === "error") return failed("No se pudo leer el día.", load);
    // Today's record from the hub, then what the stream brought since (same `at`, same kind: one row).
    const since = startOfDay(Date.now());
    const seen = new Set(d.entries.map((e) => `${e.kind}:${e.at}`));
    const all = d.entries.concat(store.state.entries.filter((e) => e.at >= since && !seen.has(`${e.kind}:${e.at}`))).filter((e) => e.at >= since);
    const shown = all.filter((e) => !d.filter || kindOf(e) === d.filter).sort((a, b) => b.at - a.at);
    const spend = store.state.spend;
    return [
      h("div", { class: "stats-row" }, statCard("wave", "Escuchado hoy", clock(store.state.recorded)), statCard("sparkle", "Tarjetas", String(all.filter((e) => e.kind === "cue" && e.label !== "ON SCREEN").length)), statCard("info", "Gasto de hoy", spend ? money(spend.usd) : "—")),
      h("div", { class: "chips", role: "group", "aria-label": "Mostrar" }, FILTERS.map(([v, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(d.filter === v), onclick: () => ((d.filter = v), redraw()) }, l))),
      shown.length ? h("ol", { class: "timeline", "aria-label": "El día" }, shown.slice(0, 300).map(entryRow)) : empty("sun", "Nada todavía hoy", "Cuando Lente escuche o vea algo, aparece aquí."),
    ];
  });
  life.track(view.off);
  return { title: "Hoy", el: h("div", { class: "page" }, h("header", { class: "page-head" }, h("h1", {}, "Hoy")), view.el), destroy: life.teardown };
}

const statCard = (ic, label, value) => h("div", { class: "card stat-card" }, icon(ic), h("span", { class: "muted small" }, label), h("strong", { class: "num" }, value));

function entryRow(e) {
  const kind = kindOf(e);
  const what = kind === "turn" ? speakerName(e.speaker) || "Alguien" : kind === "seen" ? "Visto" : kind === "summary" ? "Resumen" : /dilo/i.test(e.label ?? "") ? "DILO" : e.label;
  return h("li", { class: `tl ${kind}` }, h("span", { class: "tl-time num muted" }, hhmm(e.at)), h("span", { class: "tl-icon" }, icon(kind === "turn" ? "ear" : kind === "seen" ? "eye" : kind === "summary" ? "list" : "sparkle")), h("div", {}, h("p", { class: "tl-what" }, what), h("p", { class: "tl-text" }, e.text), e.meaning ? h("p", { class: "muted small" }, `Significa: ${e.meaning}`) : null));
}
