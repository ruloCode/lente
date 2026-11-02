// Grabar (button and the R key): the project, an optional title and the source. The clip records
// when it is connected; otherwise this computer does, and the dialog says so. Then the meeting
// opens in that project and Lente starts listening.

import { post } from "../api.js";
import { app } from "../app.js";
import { SOURCES, captureSupport } from "../capture.js";
import { button, dialog, h, icon, toast } from "../dom.js";
import { store, waitFor } from "../store.js";

export async function openRecord() {
  const s = store.state.status;
  if (s?.listening || app.capture?.active) {
    toast("Ya estás grabando: usa la barra roja para pausar o terminar.");
    return;
  }
  await dialog("Grabar", (close) => form(close), { wide: true });
}

function form(close) {
  const clip = Boolean(store.state.status?.clip) && !app.capture?.active;
  const support = captureSupport();
  const state = { device: clip ? "clip" : "computer", source: "mic", busy: false };

  const project = h("select", { class: "field", "aria-label": "Proyecto" }, h("option", { value: "" }, "Que Lente decida"), store.projects.filter((p) => p.status === "active").map((p) => h("option", { value: p.id }, p.name)));
  const title = h("input", { class: "field", maxlength: "80", placeholder: "Opcional: «Revisión con el cliente»", "aria-label": "Título" });
  const error = h("p", { class: "error-text", role: "alert" });

  const sources = h(
    "div",
    { class: "choices", role: "radiogroup", "aria-label": "Qué grabar" },
    SOURCES.map((src) => {
      const available = src.key === "tab" ? support.tab : support.mic;
      const input = h("input", { type: "radio", name: "source", value: src.key, checked: src.key === state.source, disabled: !available, onchange: () => (state.source = src.key) });
      return h("label", { class: `choice${available ? "" : " disabled"}` }, input, icon(src.icon, "choice-icon"), h("span", { class: "choice-title" }, src.label), h("span", { class: "choice-hint" }, available ? src.hint : "Este navegador no lo permite"));
    }),
  );
  const computerPart = h("div", { class: "stack" }, h("span", { class: "label" }, "Qué grabar"), sources, support.secure ? null : h("p", { class: "note warn" }, icon("lock"), "El navegador solo abre el micrófono por HTTPS o en localhost."), h("p", { class: "note" }, icon("lock"), "El navegador te pedirá permiso. Lente muestra siempre que está grabando y no guarda audio."));
  const devicePart = clip
    ? h(
        "div",
        { class: "segmented", role: "radiogroup", "aria-label": "Con qué grabar" },
        ["clip", "computer"].map((d) =>
          h("label", {}, h("input", { type: "radio", name: "device", value: d, checked: state.device === d, onchange: () => ((state.device = d), (computerPart.hidden = d === "clip")) }), h("span", {}, d === "clip" ? "Con el clip" : "Con esta computadora")),
        ),
      )
    : h("p", { class: "note" }, icon("info"), "El clip no está conectado: grabará esta computadora.");
  computerPart.hidden = state.device === "clip";

  const start = h("button", { type: "submit", class: "btn primary" }, icon("record"), h("span", {}, "Empezar a grabar"));
  return h(
    "form",
    {
      class: "stack record-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (state.busy) return;
        state.busy = true;
        start.disabled = true;
        error.textContent = "";
        try {
          if (state.device === "computer") {
            await app.capture.start(state.source);
            // The hub must see the device before listening starts.
            await waitFor("status", () => Boolean(store.state.status?.clip), 3000);
          }
          const begun = await post("/meeting/start", { title: title.value.trim(), ...(project.value ? { project: project.value } : {}) });
          if (!begun.ok) throw new Error(begun.status === 404 ? "Ese proyecto ya no está activo." : "No se pudo abrir la reunión.");
          const on = await post("/listen/on");
          if (!on.ok) throw new Error(on.body?.message ?? "Lente no pudo empezar a escuchar.");
          close(true);
          toast(state.device === "clip" ? "Grabando con el clip" : "Grabando con esta computadora");
        } catch (err) {
          if (state.device === "computer") app.capture.stop("");
          error.textContent = err?.message || "No se pudo empezar.";
          state.busy = false;
          start.disabled = false;
        }
      },
    },
    h("label", { class: "label" }, "Proyecto", project),
    h("label", { class: "label" }, "Título", title),
    devicePart,
    computerPart,
    error,
    h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(false) }), start),
  );
}
