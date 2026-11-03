// The desktop frame: the sidebar (brand, device pill, navigation, Grabar, recent meetings), the main
// area with the recording bar and the connection banner, and the chat with Lente on the right.
// Also the keyboard, notifications and reading cards aloud.

import { post } from "./api.js";
import { app } from "./app.js";
import { ComputerCapture } from "./capture.js";
import { button, h, icon, iconButton, replace, toast, announce } from "./dom.js";
import { MARK_SVG } from "./lib/brand.js";
import { clock, dayTime } from "./lib/format.js";
import { meetingTitle } from "./lib/meetings.js";
import { NAV, navFor, pathFor } from "./lib/routes.js";
import { shortcutFor } from "./lib/shortcuts.js";
import { deviceLabel, listeningLabel } from "./lib/words.js";
import { reactive } from "./reactive.js";
import { navigate, startRouter } from "./router.js";
import { emit, onNotify, pref, sessionMs, setPref, store, subscribe } from "./store.js";
import { chatPanel } from "./views/chat.js";
import { openHelp } from "./views/help.js";
import { openSearch } from "./views/palette.js";
import { openRecord } from "./views/record.js";
import { VIEWS } from "./views/index.js";

export function mountApp(root) {
  app.navigate = navigate;
  app.openRecord = openRecord;
  app.openSearch = openSearch;
  app.openHelp = openHelp;
  app.capture = new ComputerCapture((state, note) => {
    if (note) toast(note, { tone: state === "stopped" ? "warn" : "" });
    if (state === "stopped") void post("/listen/off");
    emit(["capture"]);
  });

  const main = h("main", { id: "main", class: "main", tabindex: "-1" });
  const chat = chatPanel();
  // A narrow window starts with the chat folded: there it is a sheet over the screen.
  const shell = h("div", { class: "shell", "data-chat": window.innerWidth < 1024 ? "closed" : pref("chat") }, sidebar(), h("div", { class: "center" }, banner(), recordingBar(), main), chat.el);
  app.toggleChat = (force) => {
    const open = force ?? shell.dataset.chat !== "open";
    shell.dataset.chat = open ? "open" : "closed";
    setPref("chat", shell.dataset.chat);
    if (open) chat.focus();
  };
  app.openChat = (question) => {
    app.toggleChat(true);
    if (question) chat.ask(question);
  };
  replace(root, shell, h("div", { id: "toasts", class: "toasts", "aria-live": "polite" }), h("div", { id: "announcer", class: "sr-only", "aria-live": "polite" }));
  root.classList.remove("booting");
  root.removeAttribute("aria-busy");

  let current;
  startRouter((route) => {
    current?.destroy?.();
    const make = VIEWS[route.name] ?? VIEWS.home;
    current = make(route.params, route.query);
    replace(main, current.el);
    document.title = current.title ? `${current.title} · Lente` : "Lente";
    for (const a of shell.querySelectorAll(".nav a")) a.toggleAttribute("aria-current", a.dataset.name === navFor(route.name));
    if (a11yMoved) main.focus({ preventScroll: true });
    a11yMoved = true;
    main.scrollTop = 0;
  });

  document.addEventListener("keydown", onKey);
  onNotify(notify);
}

let a11yMoved = false;

function sidebar() {
  const brand = h("a", { class: "brand", href: "/app", "aria-label": "Lente, inicio" });
  brand.innerHTML = MARK_SVG; // the hub's own mark, no user text
  brand.append(h("span", {}, "Lente"));
  const pill = reactive(["status"], () => {
    const s = store.state.status;
    const on = Boolean(s?.listening);
    return h("a", { class: `pill${on ? " on" : ""}`, href: pathFor("devices"), "aria-label": `${listeningLabel(s)} · ${deviceLabel(s)}. Abrir Dispositivos` }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "pill-text" }, listeningLabel(s)), h("span", { class: "pill-sub" }, deviceLabel(s)));
  });
  const nav = h("nav", { class: "nav", "aria-label": "Secciones" }, h("ul", { role: "list" }, NAV.map((n) => h("li", {}, navLink(n)))));
  const recents = reactive(["meetings"], () => {
    const items = [...store.state.meetings].sort((a, b) => b.startedAt - a.startedAt).slice(0, 3);
    if (!items.length) return null;
    return [h("h2", { class: "cap side-cap" }, "Recientes"), h("ul", { role: "list", class: "recents" }, items.map((m) => h("li", {}, h("a", { href: `/app/reuniones/${encodeURIComponent(m.id)}` }, icon("calendar"), h("span", {}, h("span", { class: "recent-title" }, meetingTitle(m)), h("span", { class: "recent-when" }, dayTime(m.startedAt, Date.now())))))))];
  });
  const tools = h("div", { class: "side-tools" }, button("Buscar", { class: "btn ghost wide", onclick: () => app.openSearch(), "aria-keyshortcuts": "Meta+K" }, "search"), h("kbd", { class: "kbd-hint", "aria-hidden": "true" }, "⌘K"));
  return h(
    "aside",
    { class: "sidebar", "aria-label": "Lente" },
    brand,
    pill.el,
    button("Grabar", { class: "btn record-btn", onclick: () => app.openRecord(), "aria-keyshortcuts": "R" }, "record"),
    nav,
    recents.el,
    h("div", { class: "grow" }),
    tools,
    iconButton("keyboard", "Atajos de teclado", { class: "icon-btn side-help", onclick: () => app.openHelp() }),
  );
}

function navLink(n) {
  const badge = n.name === "tasks" ? reactive(["actions"], () => (store.state.pending.length ? h("span", { class: "badge", "aria-label": `${store.state.pending.length} por aprobar` }, String(store.state.pending.length)) : null), { tag: "span" }).el : null;
  return h("a", { href: pathFor(n.name), "data-name": n.name }, icon(n.icon), h("span", {}, n.label), badge);
}

function banner() {
  return reactive(["connection"], () =>
    store.connection === "reconnecting" ? h("div", { class: "banner", role: "status" }, icon("refresh"), "Reconectando…") : null,
  ).el;
}

/** The red bar while recording: time, what is recorded, Pausar or Reanudar, Terminar (two clicks). */
function recordingBar() {
  let confirmUntil = 0;
  const time = h("span", { class: "rec-time", "aria-hidden": "true" });
  const tick = () => (time.textContent = clock(sessionMs()));
  setInterval(tick, 1000);
  const view = reactive(["status", "capture"], () => {
    const s = store.state.status;
    const capturing = Boolean(app.capture?.active);
    const meeting = s?.meeting && !s.meeting.auto ? s.meeting : null;
    if (!s || (!s.listening && !meeting && !capturing)) return null;
    tick();
    const paused = !s.listening;
    const end = button(Date.now() < confirmUntil ? "¿Terminar?" : "Terminar", {
      class: "btn danger",
      onclick: async () => {
        if (Date.now() > confirmUntil) {
          confirmUntil = Date.now() + 3000;
          view.draw();
          setTimeout(() => view.draw(), 3100);
          return;
        }
        confirmUntil = 0;
        if (meeting) await post("/meeting/end");
        await post("/listen/off");
        app.capture?.stop("");
        announce("Grabación terminada");
      },
    }, "stop");
    return h(
      "div",
      { class: `recbar${paused ? " paused" : ""}`, role: "region", "aria-label": "Grabación en curso" },
      h("span", { class: "rec-dot", "aria-hidden": "true" }),
      h("strong", {}, paused ? "En pausa" : s.assistMode === "record" ? "Grabando" : "Escuchando"),
      time,
      h("span", { class: "rec-what" }, meeting ? meeting.title || "Reunión" : "", capturing ? " · esta computadora" : s.clip ? ` · ${deviceLabel(s)}` : ""),
      h("span", { class: "grow" }),
      button(paused ? "Reanudar" : "Pausar", { class: "btn", onclick: () => post(paused ? "/listen/on" : "/listen/off") }, paused ? "play" : "pause"),
      end,
    );
  });
  subscribe(["status"], tick);
  return view.el;
}

function inField(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function onKey(e) {
  const action = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, inField: inField(e.target) });
  if (!action) return;
  if (action === "close") {
    // Native dialogs close themselves on Esc; otherwise Esc folds the chat sheet on a narrow window.
    if (document.querySelector("dialog[open]")) return;
    if (window.innerWidth < 1024 && document.querySelector(".shell[data-chat='open']")) app.toggleChat(false);
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  e.preventDefault();
  if (action === "search") app.openSearch();
  else if (action === "chat") app.toggleChat();
  else if (action === "record") app.openRecord();
  else if (action === "help") app.openHelp();
}

/** A DILO or Lente card, or an action to approve: read aloud and notified, each only if the user chose it. */
function notify(n, event) {
  if (event.kind === "cue" && pref("speak") === "on" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(event.text));
  }
  if (event.kind === "cue") announce(`${n.title}: ${n.body}`);
  if (pref("notify") !== "on" || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  const note = new Notification(n.title, { body: n.body, tag: n.tag, icon: "/icon-192.png" });
  note.onclick = () => {
    window.focus();
    if (n.tag.startsWith("action-")) navigate(pathFor("tasks"));
    note.close();
  };
}
