// Lente on the desktop: asks the hub who this browser is, then shows sign-in, the preview terms
// (until this account accepts them), the introduction (once per browser) or the app.

import { getJson, onTermsNeeded } from "./api.js";
import { mountApp } from "./layout.js";
import { INTRO_PREF, needsIntro } from "./lib/intro.js";
import { sessionNeedsTerms, termsGate } from "./lib/terms.js";
import { applyTheme, connect, pref, refreshProjects, setPref, store } from "./store.js";
import { introScreen } from "./views/intro.js";
import { signinScreen } from "./views/signin.js";
import { termsScreen } from "./views/terms.js";

const root = document.getElementById("app");
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());

function show(screen) {
  root.replaceChildren(screen);
  root.classList.remove("booting");
  root.removeAttribute("aria-busy");
}

let showingTerms = false;
/** The terms screen in place of everything; after «Acepto» the app starts from the top. */
function showTerms(gate) {
  if (showingTerms) return;
  showingTerms = true;
  show(termsScreen(gate, () => location.reload()));
}

/** Asks one data route whether the hub wants the terms first (428 `needsTerms`); null when not. */
async function pendingTerms() {
  if (sessionNeedsTerms(store.session)) return { version: typeof store.session.termsVersion === "string" ? store.session.termsVersion : null };
  try {
    const res = await fetch("/projects", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.status !== 428) return null;
    return termsGate(res.status, await res.json().catch(() => null));
  } catch {
    return null;
  }
}

try {
  store.session = await getJson("/app/session");
} catch {
  store.session = { mode: "open", signedIn: false, email: null, unreachable: true };
}
if (!store.session.signedIn) {
  show(signinScreen(store.session));
} else {
  const gate = store.session.mode === "accounts" ? await pendingTerms() : null;
  if (gate) showTerms(gate);
  else {
    onTermsNeeded(showTerms);
    connect();
    void refreshProjects();
    if (needsIntro(pref(INTRO_PREF))) show(introScreen(() => (setPref(INTRO_PREF, "yes"), mountApp(root))));
    else mountApp(root);
  }
}
