// Memoria: the facts Lente proposes (to confirm or discard, also one by one), the ones kept, the
// glossary, and the profile Lente keeps of the wearer (read only).

import { getJson, post } from "../api.js";
import { button, dialog, empty, failed, h, icon, iconButton, loading, sectionTitle, toast } from "../dom.js";
import { shortDate } from "../lib/format.js";
import { meetingTitle } from "../lib/meetings.js";
import { meetingPath } from "../lib/routes.js";
import { matches } from "../lib/search.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, store } from "../store.js";

export function memoryView() {
  const life = lifecycle();
  const d = { state: "loading", facts: [], profile: undefined, q: "" };
  const redraw = () => emit(["memory"]);
  const load = async () => {
    try {
      const [{ facts }, profile] = await Promise.all([getJson("/facts"), getJson("/memory/profile").catch(() => ({ profile: null }))]);
      d.facts = facts ?? [];
      d.profile = profile.profile;
      d.state = "ok";
    } catch {
      d.state = "error";
    }
    redraw();
  };
  void load();
  const decide = async (fact, keep) => {
    const res = await post(keep ? "/facts/keep" : "/facts/discard", { id: fact.id });
    if (!res.ok) return toast("No se pudo guardar tu decisión.", { tone: "warn" });
    d.facts = keep ? d.facts.map((f) => (f.id === fact.id ? { ...f, status: "kept" } : f)) : d.facts.filter((f) => f.id !== fact.id);
    redraw();
  };
  const search = h("input", { class: "field search", type: "search", placeholder: "Buscar en lo que recuerdo", "aria-label": "Buscar en la memoria", oninput: (e) => ((d.q = e.target.value), redraw()) });

  const view = reactive(["memory", "meetings", "glossary"], () => {
    if (d.state === "loading") return loading();
    if (d.state === "error") return failed("No se pudo leer la memoria.", load);
    const titles = new Map(store.state.meetings.map((m) => [m.id, meetingTitle(m)]));
    const shown = d.facts.filter((f) => !d.q || matches(f.text, d.q));
    const proposed = shown.filter((f) => f.status !== "kept");
    const kept = shown.filter((f) => f.status === "kept").sort((a, b) => b.createdAt - a.createdAt);
    const source = (f) => (f.meetingId && titles.has(f.meetingId) ? h("a", { href: meetingPath(f.meetingId, f.evidence?.[0]) }, titles.get(f.meetingId)) : h("span", { class: "muted" }, "—"));
    return [
      h(
        "div",
        { class: "two-col memory-cols" },
        h(
          "section",
          { class: "card pad" },
          sectionTitle("Por revisar", proposed.length, proposed.length > 1 ? button("Revisar uno por uno", { class: "btn soft small", onclick: () => reviewOneByOne(proposed, decide) }) : null),
          proposed.length
            ? h("ul", { role: "list", class: "fact-cards" }, proposed.slice(0, 40).map((f) => h("li", { class: "fact-card" }, h("p", {}, f.text), h("p", { class: "muted small" }, "De: ", source(f), " · ", shortDate(f.createdAt)), h("div", { class: "row" }, button("Confirmar", { class: "btn primary small", onclick: () => decide(f, true) }, "check"), button("Descartar", { class: "btn small", onclick: () => decide(f, false) }, "trash")))))
            : h("p", { class: "muted" }, "Nada por revisar."),
          proposed.length > 40 ? h("p", { class: "fine" }, `Y ${proposed.length - 40} más: usa «Revisar uno por uno».`) : null,
        ),
        h(
          "section",
          { class: "card pad" },
          sectionTitle("Lo que sé", kept.length),
          kept.length
            ? h("table", { class: "facts-table" }, h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Dato"), h("th", { scope: "col" }, "Fuente"), h("th", { scope: "col" }, "Fecha"), h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Acciones")))), h("tbody", {}, kept.map((f) => h("tr", {}, h("td", {}, f.text), h("td", {}, source(f)), h("td", { class: "muted small num" }, shortDate(f.createdAt)), h("td", {}, iconButton("trash", `Olvidar «${f.text}»`, { onclick: () => decide(f, false) }))))))
            : h("p", { class: "muted" }, "Cuando confirmes un recuerdo, Lente lo usa para responderte."),
        ),
      ),
      h("section", { class: "card pad" }, sectionTitle("Mi glosario", store.state.glossary.length), store.state.glossary.length ? h("dl", { class: "glossary chips-gloss" }, store.state.glossary.slice(0, 60).flatMap((g) => [h("dt", { class: "chip static" }, g.term), h("dd", { class: "muted small" }, g.meaning)])) : h("p", { class: "muted" }, "Las palabras que Lente te explica en las reuniones aparecen aquí.")),
      h("section", { class: "card pad" }, sectionTitle("Lo que Lente sabe de ti"), d.profile ? [h("p", { class: "profile-text" }, d.profile.text), h("p", { class: "fine" }, `Actualizado ${shortDate(d.profile.at)}. Para corregirlo, confirma o descarta recuerdos.`)] : h("p", { class: "muted" }, store.session.mode === "accounts" ? "Lente escribe tu perfil después de tus reuniones." : "El perfil se escribe en el hub con cuentas; este hub de la laptop no lo usa.")),
    ];
  });
  life.track(view.off);
  return { title: "Memoria", el: h("div", { class: "page" }, h("header", { class: "page-head" }, h("h1", {}, icon("brain", "title-icon"), "Memoria")), search, view.el), destroy: life.teardown };
}

/** One fact at a time: Confirmar, Descartar or Saltar, until none is left or the dialog closes. */
function reviewOneByOne(facts, decide) {
  const queue = [...facts];
  let done = 0;
  return dialog("Revisar uno por uno", (close) => {
    const body = h("div", { class: "stack review" });
    const show = () => {
      const f = queue[0];
      if (!f) {
        body.replaceChildren(empty("check", "Listo", `Revisaste ${done}.`), h("div", { class: "row end" }, button("Cerrar", { class: "btn primary", onclick: () => close(true) })));
        return;
      }
      const next = async (keep) => {
        queue.shift();
        if (keep !== null) {
          await decide(f, keep);
          done++;
        }
        show();
      };
      body.replaceChildren(h("p", { class: "muted small" }, `${done + 1} de ${done + queue.length}`), h("p", { class: "review-fact" }, f.text), h("div", { class: "row end" }, button("Saltar", { onclick: () => next(null) }), button("Descartar", { onclick: () => next(false) }, "trash"), button("Confirmar", { class: "btn primary", onclick: () => next(true), autofocus: true }, "check")));
      body.querySelector(".btn.primary")?.focus();
    };
    show();
    return body;
  });
}
