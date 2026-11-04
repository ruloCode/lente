// Ajustes: your name, the mode, reading cards aloud, answering every question, the theme,
// notifications, and on a hub with accounts the account: email, this month's spend, export,
// removing the sample project, delete (typed confirmation) and sign out.

import { getJson, post } from "../api.js";
import { button, confirm, dialog, h, icon, sectionTitle, toast } from "../dom.js";
import { money } from "../lib/format.js";
import { sampleDeleteResult } from "../lib/terms.js";
import { namesLine } from "../lib/words.js";
import { lifecycle, reactive } from "../reactive.js";
import { applyTheme, emit, pref, refreshProjects, setPref, store } from "../store.js";

/** The word typed to delete the account. */
const DELETE_WORD = "BORRAR";

export function settingsView() {
  const life = lifecycle();
  const general = reactive(["status", "pref:theme", "pref:speak", "pref:notify"], () => {
    const s = store.state.status ?? {};
    const name = h("input", { class: "field", value: namesLine(s.names), maxlength: "120", placeholder: "Rulo, Raúl", "aria-label": "Cómo te llaman", "data-key": "names" });
    return h(
      "section",
      { class: "card pad settings" },
      row("Cómo te llaman", "Lente reconoce cuándo te hablan a ti. Separa los nombres con comas.", h("form", { class: "row", onsubmit: async (e) => (e.preventDefault(), (await post("/profile", { names: name.value })).ok ? toast("Guardado") : toast("No se pudo guardar.", { tone: "warn" })) }, name, h("button", { type: "submit", class: "btn" }, "Guardar"))),
      row("Modo", "Asistir te da tarjetas en el momento; Solo grabar guarda la reunión sin interrumpir.", segmented("mode", [["assist", "Asistir"], ["record", "Solo grabar"]], s.assistMode ?? "assist", (v) => post(`/assist-mode/${v}`))),
      row("Contestar todas las preguntas", "Para probar: una tarjeta para cada pregunta, no solo las que te hacen a ti.", toggle("every", Boolean(s.everyQuestion), (on) => post(on ? "/cues/all" : "/cues/addressed"))),
      row("Leer en voz alta", "La computadora lee cada tarjeta con su propia voz.", toggle("speak", pref("speak") === "on", (on) => setPref("speak", on ? "on" : "off"), !("speechSynthesis" in window))),
      row("Notificaciones", "Avisa de una tarjeta DILO o de algo por aprobar cuando Lente está en otra pestaña.", toggle("notify", pref("notify") === "on", async (on) => {
        if (on && "Notification" in window && Notification.permission !== "granted") {
          const got = await Notification.requestPermission();
          if (got !== "granted") {
            toast("El navegador no dio permiso para notificar.", { tone: "warn" });
            return setPref("notify", "off");
          }
        }
        setPref("notify", on ? "on" : "off");
      }, !("Notification" in window))),
      row("Tema", "", segmented("theme", [["system", "Sistema"], ["light", "Claro"], ["dark", "Oscuro"]], pref("theme"), (v) => (setPref("theme", v), applyTheme(v)))),
    );
  });
  life.track(general.off);
  const parts = [h("header", { class: "page-head" }, h("h1", {}, "Ajustes")), general.el];
  parts.push(store.session.mode === "accounts" ? account(life) : h("section", { class: "card pad" }, sectionTitle("Cuenta"), h("p", { class: "muted" }, "Este hub de la laptop no usa cuentas: todo se queda en esta computadora.")));
  return { title: "Ajustes", el: h("div", { class: "page narrow" }, parts), destroy: life.teardown };
}

const row = (title, hint, control) => h("div", { class: "setting" }, h("div", { class: "setting-text" }, h("h2", {}, title), hint ? h("p", { class: "muted small" }, hint) : null), h("div", { class: "setting-control" }, control));

function toggle(key, on, change, disabled = false) {
  return h("button", { type: "button", role: "switch", class: "switch", "aria-checked": String(on), "data-key": `sw-${key}`, disabled, "aria-label": disabled ? "No disponible en este navegador" : null, onclick: async (e) => {
    const next = e.currentTarget.getAttribute("aria-checked") !== "true";
    e.currentTarget.setAttribute("aria-checked", String(next));
    await change(next);
  } }, h("span", { class: "knob" }));
}

function segmented(name, options, value, change) {
  return h("div", { class: "segmented", role: "radiogroup", "aria-label": name }, options.map(([v, l]) => h("label", {}, h("input", { type: "radio", name, value: v, checked: v === value, onchange: () => change(v) }), h("span", {}, l))));
}

function account(life) {
  const d = { state: "loading", body: null };
  void getJson("/account").then(
    (body) => ((d.body = body), (d.state = "ok"), emit(["account"])),
    () => ((d.state = "error"), emit(["account"])),
  );
  const view = reactive(["account"], () => {
    const spend = d.body?.spend;
    return h(
      "section",
      { class: "card pad settings" },
      sectionTitle("Cuenta"),
      row("Correo", "", h("span", {}, store.session.email ?? d.body?.email ?? "—")),
      row("Gasto del mes", spend?.capUsd ? `Tope: ${money(spend.capUsd)} al mes` : "Lo que costó este mes escuchar y responderte.", h("strong", { class: "num" }, d.state === "loading" ? "…" : spend ? money(spend.usd) : "—")),
      row("Exportar mis datos", "Todo lo que Lente guarda de ti, legible, en un archivo JSON.", h("a", { class: "btn", href: "/account/export", download: "lente-export.json" }, icon("download"), h("span", {}, "Exportar"))),
      row("Borrar ejemplo", "Quita el proyecto «PROBE · Proyecto de ejemplo» con sus reuniones, tareas y recuerdos. Lo tuyo se queda.", button("Borrar ejemplo", { onclick: deleteSample, "data-key": "sample-delete" }, "trash")),
      row("Cerrar sesión", "En este navegador. El teléfono sigue conectado.", button("Cerrar sesión", { onclick: signOut }, "logout")),
      row("Borrar mi cuenta", "Borra tu llave, tu memoria, tus dispositivos y tu acceso. No se puede deshacer.", button("Borrar mi cuenta", { class: "btn danger", onclick: deleteAccount }, "trash")),
    );
  });
  life.track(view.off);
  return view.el;
}

async function deleteSample() {
  const yes = await confirm("Borrar ejemplo", "Se borran el proyecto de ejemplo, sus dos reuniones, sus tareas y sus recuerdos. Tus propias reuniones y tareas no se tocan.", { yes: "Borrar ejemplo", danger: true });
  if (!yes) return;
  const result = sampleDeleteResult(await post("/sample/delete").catch(() => ({ ok: false, status: 0, body: null })));
  toast(result.text, { tone: result.ok ? "" : "warn" });
  if (result.ok) void refreshProjects();
}

async function signOut() {
  await post("/auth/signout");
  location.assign("/app");
}

async function deleteAccount() {
  const yes = await dialog("Borrar mi cuenta", (close) => {
    const word = h("input", { class: "field", autocomplete: "off", "aria-label": `Escribe ${DELETE_WORD} para confirmar`, autofocus: true });
    const go = h("button", { type: "submit", class: "btn danger", disabled: true }, "Borrar para siempre");
    word.addEventListener("input", () => (go.disabled = word.value.trim() !== DELETE_WORD));
    return h("form", { class: "stack", onsubmit: (e) => (e.preventDefault(), word.value.trim() === DELETE_WORD && close(true)) }, h("p", {}, "Se borran tu llave de cifrado primero y luego tus reuniones, tareas, memoria, dispositivos y tu acceso con Google. Exporta antes si quieres guardar algo."), h("label", { class: "label" }, `Escribe ${DELETE_WORD} para confirmar`, word), h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(false) }), go));
  });
  if (!yes) return;
  const res = await post("/account/delete", { confirm: true });
  if (!res.ok) return toast("No se pudo borrar la cuenta.", { tone: "warn" });
  location.assign("/app");
}

