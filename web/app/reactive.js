// A region that redraws when store keys change, keeping the focused field (and its caret) when it
// is redrawn: inputs carry a `data-key` so the same one can be found again. By default the region
// lays out as if its children were the parent's (`display: contents`).

import { h } from "./dom.js";
import { subscribe } from "./store.js";

export function reactive(keys, render, { tag = "div", cls = "region" } = {}) {
  const host = h(tag, { class: cls });
  const draw = () => {
    const active = document.activeElement;
    const key = active && host.contains(active) ? active.getAttribute("data-key") : null;
    const sel = key && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    host.replaceChildren(...[render()].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false && x !== ""));
    if (key) {
      const again = host.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (again) {
        again.focus();
        if (sel && "setSelectionRange" in again) try { again.setSelectionRange(sel[0], sel[1]); } catch {}
      }
    }
  };
  draw();
  const off = subscribe(keys, draw);
  return { el: host, draw, off };
}

/** A view's teardown list: `track(off)` and later `teardown()`. */
export function lifecycle() {
  const offs = [];
  return { track: (fn) => (offs.push(fn), fn), teardown: () => offs.splice(0).forEach((fn) => fn()) };
}
