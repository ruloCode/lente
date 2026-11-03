// Dispositivos: the clip's state, this computer as the device, and on a hub with accounts the
// clip tokens (created once, shown once, revoked).

import { getJson, post } from "../api.js";
import { app } from "../app.js";
import { button, confirm, dialog, h, icon, loading, sectionTitle, toast } from "../dom.js";
import { ago } from "../lib/format.js";
import { deviceLabel, listeningLabel } from "../lib/words.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit, store } from "../store.js";

const KIND = { clip: "Clip", desktop: "Computadora", mcp: "Cliente MCP" };

export function devicesView() {
  const life = lifecycle();
  const status = reactive(["status", "capture"], () => {
    const s = store.state.status;
    const capturing = Boolean(app.capture?.active);
    return h(
      "section",
      { class: "card pad device-card" },
      h("div", { class: "row" }, icon(s?.clip ? "devices" : "info", "device-icon"), h("div", { class: "grow" }, h("h2", {}, capturing ? "Esta computadora" : deviceLabel(s)), h("p", { class: "muted" }, listeningLabel(s), s?.clip && s.mode ? ` · ${s.mode === "camera" ? "cámara y micrófono" : "solo micrófono"}` : "")), h("span", { class: `state-dot${s?.clip ? " ok" : ""}`, "aria-hidden": "true" })),
      s?.clipError ? h("p", { class: "note warn" }, icon("info"), `El último clip fue rechazado: ${s.clipError}`) : null,
      s?.audioLost ? h("p", { class: "muted small" }, `Audio perdido en esta conexión: ${s.audioLost} cuadros.`) : null,
      h("div", { class: "row" }, capturing ? button("Dejar de usar esta computadora", { onclick: () => app.capture.stop("") }, "stop") : button("Usar esta computadora", { class: "btn primary", onclick: () => app.openRecord() }, "screen"), s?.clip && !capturing ? button("Mirar ahora", { onclick: () => post("/look").then(() => toast("Lente está mirando…")) }, "eye") : null),
      h("p", { class: "fine" }, "Con esta computadora Lente escucha tu micrófono, tu cámara o una pestaña de Meet, Zoom o Teams. No guarda audio."),
    );
  });
  life.track(status.off);
  const parts = [h("header", { class: "page-head" }, h("h1", {}, "Dispositivos")), status.el];
  if (store.session.mode === "accounts") parts.push(tokens(life));
  else parts.push(h("section", { class: "card pad" }, sectionTitle("Clips"), h("p", { class: "muted" }, "En el hub de la laptop el clip se conecta por la red local, sin token.")));
  return { title: "Dispositivos", el: h("div", { class: "page narrow" }, parts), destroy: life.teardown };
}

function tokens(life) {
  const d = { state: "loading", devices: [] };
  const load = async () => {
    try {
      d.devices = (await getJson("/devices")).devices ?? [];
      d.state = "ok";
    } catch {
      d.state = "error";
    }
    emit(["devices"]);
  };
  void load();
  const view = reactive(["devices"], () => {
    const live = d.devices.filter((x) => !x.revoked);
    return h(
      "section",
      { class: "card pad" },
      sectionTitle("Tus clips y conexiones", live.length, button("Nuevo token", { class: "btn small", onclick: () => create(load) }, "plus")),
      d.state === "loading" ? loading() : d.state === "error" ? h("p", { class: "error-text" }, "No se pudo leer la lista.") : live.length ? h("ul", { role: "list", class: "plain-list" }, live.map((x) => h("li", { class: "row-link" }, icon(x.kind === "clip" ? "devices" : x.kind === "desktop" ? "screen" : "sparkle"), h("div", { class: "grow" }, h("strong", {}, x.label), h("p", { class: "muted small" }, `${KIND[x.kind] ?? x.kind} · ${x.lastSeenAt ? `visto ${ago(x.lastSeenAt, Date.now())}` : "nunca conectado"}`)), button("Revocar", { class: "btn small danger-text", onclick: () => revoke(x, load) })))) : h("p", { class: "muted" }, "Crea un token para conectar tu clip a esta cuenta."),
    );
  });
  life.track(view.off);
  return view.el;
}

async function create(reload) {
  const made = await dialog("Nuevo token", (close) => {
    const label = h("input", { class: "field", maxlength: "40", placeholder: "Clip de Rulo", "aria-label": "Nombre", required: true, autofocus: true });
    const kind = h("select", { class: "field", "aria-label": "Tipo" }, Object.entries(KIND).map(([k, l]) => h("option", { value: k }, l)));
    const err = h("p", { class: "error-text", role: "alert" });
    return h("form", { class: "stack", onsubmit: async (e) => {
      e.preventDefault();
      const res = await post("/devices", { label: label.value.trim(), kind: kind.value });
      if (!res.ok) return (err.textContent = res.body?.error ?? "No se pudo crear.");
      close(res.body);
    } }, h("label", { class: "label" }, "Nombre", label), h("label", { class: "label" }, "Tipo", kind), err, h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(undefined) }), h("button", { type: "submit", class: "btn primary" }, "Crear")));
  });
  if (!made?.token) return;
  await reload();
  // Shown once: the hub keeps only its hash.
  await dialog("Copia el token ahora", () => {
    const code = h("code", { class: "token" }, made.token);
    return h("div", { class: "stack" }, h("p", { class: "muted" }, "Es la única vez que lo verás. Ponlo en el clip al grabarle el firmware (cloud.h)."), code, button("Copiar", { class: "btn primary", onclick: () => navigator.clipboard?.writeText(made.token).then(() => toast("Token copiado")) }, "copy"));
  });
}

async function revoke(device, reload) {
  if (!(await confirm("Revocar", `«${device.label}» ya no podrá conectarse.`, { yes: "Revocar", danger: true }))) return;
  const res = await post("/devices/revoke", { id: device.id });
  if (!res.ok) return toast("No se pudo revocar.", { tone: "warn" });
  await reload();
}
