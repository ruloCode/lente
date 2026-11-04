// The preview terms screen (ship-hackathon 3.2): shown instead of the app while the hub answers 428
// `needsTerms`. A summary, the two full texts on the hub, «Acepto» and a way out (sign out).

import { post } from "../api.js";
import { h } from "../dom.js";
import { MARK_SVG } from "../lib/brand.js";
import { TERMS_LINKS, TERMS_SUMMARY, acceptBody } from "../lib/terms.js";

/** `onAccepted` runs once the hub took the acceptance. */
export function termsScreen(gate, onAccepted) {
  const mark = h("div", { class: "signin-mark" });
  mark.innerHTML = MARK_SVG;
  const error = h("p", { class: "error-text", role: "alert" });
  const accept = h("button", { type: "button", class: "btn primary wide" }, "Acepto");
  accept.addEventListener("click", async () => {
    accept.disabled = true;
    error.textContent = "";
    const res = await post("/terms/accept", acceptBody(gate)).catch(() => ({ ok: false, status: 0, body: null }));
    if (res.ok) return onAccepted();
    accept.disabled = false;
    error.textContent = res.status === 0 ? "No se pudo hablar con Lente. Revisa tu conexión y prueba otra vez." : "No se pudo guardar tu respuesta. Prueba otra vez.";
  });
  const title = h("h1", { id: "terms-title", tabindex: "-1" }, "Antes de empezar");
  const screen = h(
    "div",
    { class: "signin" },
    h(
      "main",
      { class: "signin-card terms-card", "aria-labelledby": "terms-title" },
      mark,
      title,
      h("p", { class: "signin-lead" }, "Lente es una vista previa para el hackathon. Esto es lo importante:"),
      h("ul", { class: "terms-list" }, TERMS_SUMMARY.map((line) => h("li", {}, line))),
      h(
        "p",
        { class: "terms-links" },
        "Léelos completos: ",
        h("a", { href: TERMS_LINKS.terms, target: "_blank", rel: "noopener" }, "Términos"),
        " · ",
        h("a", { href: TERMS_LINKS.privacy, target: "_blank", rel: "noopener" }, "Privacidad"),
      ),
      accept,
      error,
      h("button", { type: "button", class: "btn ghost", onclick: async () => (await post("/auth/signout").catch(() => null), location.assign("/app")) }, "Cerrar sesión"),
      gate?.version ? h("p", { class: "fine" }, `Versión ${gate.version}`) : null,
    ),
  );
  queueMicrotask(() => title.focus());
  return screen;
}
