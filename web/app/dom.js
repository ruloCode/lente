// A small element helper and the app's shared pieces of UI: toasts with undo, dialogs, the live
// region. Views build DOM with `h`; text always goes in as text, never as HTML.

import { iconSvg } from "./icons.js";

/**
 * `h("button", { class: "btn", onclick, "aria-label": "…" }, "text", child)`. Props starting with
 * `on` are listeners; `class`, `hidden`, `disabled`, `value`, `checked` are properties; the rest are
 * attributes (false or null leaves them out). Children may be strings, nodes, arrays or falsy.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (key === "value" || key === "checked" || key === "selected" || key === "indeterminate") el[key] = value;
    else if (key === "html") throw new Error("h() takes no HTML");
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** An icon as an element (its SVG is ours, not user text). */
export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = `i ${cls}`.trim();
  span.innerHTML = iconSvg(name);
  return span;
}

/** A button with an icon and a label (the label is also the accessible name). */
export function button(label, props = {}, iconName) {
  return h("button", { type: "button", class: "btn", ...props }, iconName ? icon(iconName) : null, label ? h("span", {}, label) : null);
}

/** An icon-only button; `label` is its accessible name and tooltip. */
export function iconButton(name, label, props = {}) {
  return h("button", { type: "button", class: "icon-btn", "aria-label": label, title: label, ...props }, icon(name));
}

export function replace(target, ...children) {
  target.replaceChildren();
  append(target, children);
}

/** Says something to screen readers (polite) without moving focus. */
export function announce(text) {
  const region = document.getElementById("announcer");
  if (!region) return;
  region.textContent = "";
  setTimeout(() => (region.textContent = text), 30);
}

/**
 * A toast at the bottom; with `action` it offers a button (Deshacer) and `onAction` runs if pressed
 * before it hides. Resolves to true when the action was taken.
 */
export function toast(text, { action, ms = 6000, tone = "" } = {}) {
  const host = document.getElementById("toasts");
  return new Promise((resolve) => {
    let done = false;
    const finish = (taken) => {
      if (done) return;
      done = true;
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 200);
      resolve(taken);
    };
    const el = h("div", { class: `toast ${tone}`, role: "status" }, h("span", {}, text), action ? h("button", { type: "button", class: "toast-action", onclick: () => finish(true) }, action) : null);
    host?.append(el);
    setTimeout(() => finish(false), ms);
  });
}

/**
 * A modal dialog (native <dialog>: focus stays inside, Esc closes). `build(close)` returns the body;
 * resolves with what `close(value)` was called with, or undefined when dismissed.
 */
export function dialog(title, build, { wide = false, labelledBy } = {}) {
  return new Promise((resolve) => {
    const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const el = h("dialog", { class: `dialog${wide ? " wide" : ""}`, "aria-labelledby": labelledBy ?? id });
    let value;
    const close = (v) => {
      value = v;
      el.close();
    };
    const head = h("header", { class: "dialog-head" }, h("h2", { id }, title), iconButton("close", "Cerrar", { onclick: () => close(undefined) }));
    el.append(head, h("div", { class: "dialog-body" }, build(close)));
    el.addEventListener("close", () => {
      el.remove();
      resolve(value);
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) close(undefined);
    });
    document.body.append(el);
    el.showModal();
    const first = el.querySelector("[autofocus]") ?? el.querySelector(".dialog-body input, .dialog-body select, .dialog-body textarea, .dialog-body button");
    first?.focus();
  });
}

/** Yes or no, with the destructive button in red. */
export function confirm(title, message, { yes = "Confirmar", danger = false } = {}) {
  return dialog(title, (close) =>
    h("div", { class: "stack" }, h("p", { class: "muted" }, message), h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(false) }), button(yes, { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => close(true), autofocus: true }))),
  ).then(Boolean);
}

/** One line of text from the user, or undefined when cancelled. */
export function prompt(title, { label, value = "", placeholder = "", yes = "Guardar", max = 80 } = {}) {
  return dialog(title, (close) => {
    const input = h("input", { class: "field", value, placeholder, maxlength: max, "aria-label": label ?? title, autofocus: true });
    const form = h("form", { class: "stack", onsubmit: (e) => (e.preventDefault(), input.value.trim() && close(input.value.trim())) }, label ? h("label", { class: "label" }, label, input) : input, h("div", { class: "row end" }, button("Cancelar", { onclick: () => close(undefined) }), h("button", { type: "submit", class: "btn primary" }, yes)));
    return form;
  });
}

/** A section heading with an optional count badge. */
export function sectionTitle(text, count, ...extra) {
  return h("div", { class: "section-head" }, h("h2", { class: "cap" }, text, count ? h("span", { class: "count" }, String(count)) : null), ...extra);
}

/** An empty state: an icon, a title and one sentence. */
export function empty(iconName, title, text, ...actions) {
  return h("div", { class: "empty" }, icon(iconName, "empty-icon"), h("p", { class: "empty-title" }, title), text ? h("p", { class: "muted" }, text) : null, actions.length ? h("div", { class: "row center" }, ...actions) : null);
}

/** A loading placeholder for a region that fetches. */
export const loading = (text = "Cargando…") => h("p", { class: "loading muted", role: "status" }, text);

/** An error with a retry. */
export const failed = (text, retry) => h("div", { class: "error-box", role: "alert" }, h("p", {}, text), retry ? button("Reintentar", { onclick: retry }, "refresh") : null);
