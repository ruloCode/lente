// Client routes with the history API: links under /app navigate in place, back and forward work,
// and a deep link opens the right screen.

import { matchRoute } from "./lib/routes.js";

let onChange = () => {};

export function currentRoute() {
  return { ...matchRoute(location.pathname), query: new URLSearchParams(location.search) };
}

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return onChange(currentRoute());
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  onChange(currentRoute());
}

export function startRouter(handler) {
  onChange = handler;
  window.addEventListener("popstate", () => onChange(currentRoute()));
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !(url.pathname === "/app" || url.pathname.startsWith("/app/"))) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  onChange(currentRoute());
}
