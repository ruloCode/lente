// The first-run introduction (lib/intro.js has the steps): one step at a time on the sign-in
// ground, progress dots, Atrás / Siguiente / Omitir, the names saved to the hub on the way.

import { post } from "../api.js";
import { h, icon } from "../dom.js";
import { MARK_SVG } from "../lib/brand.js";
import { INTRO_STEPS, introButtons } from "../lib/intro.js";
import { namesLine } from "../lib/words.js";
import { store } from "../store.js";

/** `onDone` runs on «Empezar» or «Omitir». */
export function introScreen(onDone) {
  let step = 0;
  /** Typed so far; until then, the names the hub already knows (the event stream is connected). */
  let names = null;

  const card = h("main", { class: "signin-card intro-card", "aria-labelledby": "intro-title" });
  const screen = h("div", { class: "signin" }, card);

  async function saveNames(value) {
    names = value;
    if (value.trim()) await post("/profile", { names: value }).catch(() => null);
  }

  function render() {
    const s = INTRO_STEPS[step];
    const b = introButtons(step);
    const field = s.names ? h("input", { class: "field intro-field", value: names ?? namesLine(store.state.status?.names), maxlength: "120", placeholder: "Rulo, Raúl", "aria-label": "Cómo te llaman", onkeydown: (e) => e.key === "Enter" && go(1) }) : null;
    async function go(delta) {
      if (field) await saveNames(field.value);
      if (delta > 0 && b.done) return onDone();
      step = Math.max(0, Math.min(INTRO_STEPS.length - 1, step + delta));
      render();
    }
    const mark = h("div", { class: "signin-mark" });
    mark.innerHTML = MARK_SVG;
    const title = h("h1", { id: "intro-title", tabindex: "-1" }, s.title);
    // The DOM's own replaceChildren writes null as text: only the parts this step has.
    const parts = [
      h(
        "div",
        { class: "intro-top" },
        h("ol", { class: "intro-dots", "aria-label": `Paso ${step + 1} de ${INTRO_STEPS.length}` }, INTRO_STEPS.map((_, i) => h("li", { class: i === step ? "on" : i < step ? "done" : "" }))),
        b.skip ? h("button", { type: "button", class: "btn ghost small", onclick: () => onDone() }, "Omitir") : null,
      ),
      step === 0 ? mark : h("div", { class: "intro-icon" }, icon(s.icon)),
      title,
      h("p", { class: "signin-lead muted" }, s.body),
      field,
      s.points ? h("ul", { class: "intro-points", role: "list" }, s.points.map((p) => h("li", {}, h("span", { class: "intro-point-icon" }, icon(p.icon)), h("span", {}, h("strong", {}, p.title), h("span", { class: "muted small" }, p.text))))) : null,
      s.try ? h("p", { class: "intro-try" }, h("span", { class: "cap" }, "Prueba"), h("span", {}, `«${s.try}»`)) : null,
      h(
        "div",
        { class: "intro-actions" },
        b.back ? h("button", { type: "button", class: "btn", onclick: () => go(-1) }, "Atrás") : null,
        h("button", { type: "button", class: "btn primary grow", onclick: () => go(1) }, b.next),
      ),
    ];
    card.replaceChildren(...parts.filter(Boolean));
    queueMicrotask(() => (field ?? title).focus());
  }

  render();
  return screen;
}
