// Before the app: sign in with Google on a hub with accounts (add-accounts 8.1), pair this browser
// on a cloud hub without accounts, or say the hub cannot be reached.

import { h } from "../dom.js";
import { MARK_SVG } from "../lib/brand.js";

export function signinScreen(session) {
  const mark = h("div", { class: "signin-mark" });
  mark.innerHTML = MARK_SVG;
  const params = new URLSearchParams(location.search);
  const next = location.pathname.startsWith("/app") ? location.pathname : "/app";
  let body;
  if (session.unreachable) {
    body = [h("p", { class: "muted" }, "No se pudo hablar con el hub de Lente. Revisa que esté encendido y vuelve a cargar."), h("button", { type: "button", class: "btn primary wide", onclick: () => location.reload() }, "Volver a intentar")];
  } else if (session.mode === "pairing") {
    body = [h("p", { class: "muted" }, "Este hub se empareja con un código. Empareja este navegador y vuelve aquí."), h("a", { class: "btn primary wide", href: "/" }, "Emparejar este navegador")];
  } else {
    const google = h("a", { class: "btn google wide", href: `/auth/google?next=${encodeURIComponent(next)}` }, googleMark(), h("span", {}, "Entrar con Google"));
    body = [h("p", { class: "muted" }, "Entra con tu cuenta de Google para ver tus reuniones, tus tareas y tu memoria."), google, params.get("error") ? h("p", { class: "error-text", role: "alert" }, "No se pudo entrar. Prueba otra vez.") : null];
  }
  return h(
    "div",
    { class: "signin" },
    h(
      "main",
      { class: "signin-card", "aria-labelledby": "signin-title" },
      mark,
      h("h1", { id: "signin-title" }, "Lente"),
      h("p", { class: "signin-lead" }, "Tu memoria de reuniones, en tu computadora."),
      ...body,
      h("p", { class: "fine" }, "Lente guarda tu memoria cifrada con una llave solo tuya. Nunca guarda audio."),
    ),
  );
}

/** Google's "G" in its four colors, drawn here as plain shapes. */
function googleMark() {
  const span = h("span", { class: "g-mark", "aria-hidden": "true" });
  span.innerHTML =
    '<svg viewBox="0 0 48 48" width="20" height="20" focusable="false"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
  return span;
}
