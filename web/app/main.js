// Lente on the desktop: asks the hub who this browser is, then shows sign-in or the app.

import { getJson } from "./api.js";
import { mountApp } from "./layout.js";
import { applyTheme, connect, refreshProjects, store } from "./store.js";
import { signinScreen } from "./views/signin.js";

const root = document.getElementById("app");
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());

try {
  store.session = await getJson("/app/session");
} catch {
  store.session = { mode: "open", signedIn: false, email: null, unreachable: true };
}
if (!store.session.signedIn) {
  root.replaceChildren(signinScreen(store.session));
  root.classList.remove("booting");
  root.removeAttribute("aria-busy");
} else {
  connect();
  void refreshProjects();
  mountApp(root);
}
