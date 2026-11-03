// The chat with Lente, on the right of every screen: the scope (all the memory or one project),
// suggestions, answers with their sources as chips that open the meeting at the cited turn, a new
// conversation, and dictation where the browser has speech recognition. The conversation stays in
// this page's memory only.

import { postStream } from "../api.js";
import { button, h, icon, iconButton } from "../dom.js";
import { SUGGESTIONS, applyAskEvent, askBody } from "../lib/chat.js";
import { hhmm } from "../lib/format.js";
import { meetingPath, pathFor } from "../lib/routes.js";
import { app } from "../app.js";
import { reactive } from "../reactive.js";
import { emit, store, subscribe } from "../store.js";

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

export function chatPanel() {
  const chat = { messages: [], scope: "", busy: false };
  const changed = () => emit(["chat"]);

  const field = h("textarea", { class: "composer-field", rows: "1", placeholder: "Pregunta sobre tus reuniones…", "aria-label": "Pregunta para Lente", "data-key": "chat-field", maxlength: "500" });
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send(field.value);
    }
  });
  field.addEventListener("input", () => {
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  });

  async function send(text) {
    const question = text.trim();
    if (!question || chat.busy) return;
    field.value = "";
    field.style.height = "auto";
    const body = askBody(question, chat.messages, chat.scope || null);
    chat.messages.push({ role: "user", text: question, at: Date.now() });
    const waiting = { role: "lente", text: "", pending: true, at: Date.now() };
    chat.messages.push(waiting);
    chat.busy = true;
    changed();
    try {
      // The answer streams in as the hub writes it (add-memory-engine 4.2); an older hub answers JSON at once.
      const res = await postStream("/ask", body, (event, data) => (applyAskEvent(waiting, event, data), changed()));
      const out = res.body ?? {};
      Object.assign(waiting, res.ok && out.ok ? { text: out.answer, sources: out.sources ?? [], found: out.found, ms: out.ms } : { text: out.message ?? (res.status === 404 ? "Ese proyecto ya no existe." : "No pude responder ahora; prueba otra vez."), error: true });
    } catch {
      Object.assign(waiting, { text: "No hay conexión con el hub.", error: true });
    }
    Object.assign(waiting, { pending: false, streaming: false, searching: false });
    chat.busy = false;
    changed();
  }

  const mic = Recognition ? dictation(field) : null;
  const scope = reactive(["projects", "chat"], () => {
    const active = store.projects.filter((p) => p.status === "active");
    if (chat.scope && !active.some((p) => p.id === chat.scope)) chat.scope = "";
    const select = h("select", { class: "scope", "aria-label": "Buscar en", "data-key": "chat-scope", onchange: (e) => ((chat.scope = e.target.value), changed()) }, h("option", { value: "", selected: !chat.scope }, "Toda mi memoria"), active.map((p) => h("option", { value: p.id, selected: chat.scope === p.id }, p.name)));
    return h("label", { class: "scope-chip" }, icon(chat.scope ? "folder" : "brain"), select);
  }, { tag: "div" });

  const list = reactive(["chat"], () => {
    if (!chat.messages.length) {
      return h(
        "div",
        { class: "chat-empty" },
        icon("sparkle", "chat-empty-icon"),
        h("p", { class: "chat-empty-title" }, "Pregúntale a Lente"),
        h("p", { class: "muted" }, "Responde solo con lo que viste y escuchaste, y te dice de dónde lo sacó."),
        h("div", { class: "chips" }, SUGGESTIONS.map((s) => button(s.label, { class: "chip", onclick: () => send(s.question) }))),
      );
    }
    return h("ol", { class: "messages", role: "log", "aria-live": "polite", "aria-label": "Conversación con Lente" }, chat.messages.map(message));
  }, { cls: "chat-scroll" });
  // Keep the newest message in view.
  subscribe(["chat"], () => requestAnimationFrame(() => (list.el.scrollTop = list.el.scrollHeight)));

  const el = h(
    "aside",
    { class: "chat", "aria-label": "Chat con Lente" },
    h("header", { class: "chat-head" }, h("h2", {}, icon("sparkle"), "Lente"), iconButton("edit", "Nueva conversación", { onclick: () => ((chat.messages = []), changed(), field.focus()) }), iconButton("close", "Cerrar el chat", { class: "icon-btn chat-close", onclick: () => app.toggleChat(false), "aria-keyshortcuts": "Meta+J" })),
    scope.el,
    list.el,
    h("form", { class: "composer", onsubmit: (e) => (e.preventDefault(), send(field.value)) }, field, mic, h("button", { type: "submit", class: "send", "aria-label": "Enviar" }, icon("send"))),
  );
  const opener = h("button", { type: "button", class: "chat-fab", "aria-label": "Abrir el chat con Lente", title: "Chat con Lente (⌘J)", onclick: () => app.toggleChat(true) }, icon("sparkle"), h("span", {}, "Lente"));
  const wrap = h("div", { class: "chat-wrap" }, el, opener);
  return { el: wrap, focus: () => field.focus(), ask: (q) => send(q) };
}

function message(m) {
  if (m.role === "user") return h("li", { class: "msg user" }, h("p", {}, m.text), h("span", { class: "msg-time" }, hhmm(m.at)));
  if (m.pending) return h("li", { class: "msg lente pending", "aria-busy": "true" }, h("span", { class: "who" }, icon("sparkle"), "Lente"), h("p", { class: "muted" }, m.searching ? "Buscando más…" : "Buscando en tus reuniones…"));
  return h(
    "li",
    { class: `msg lente${m.error ? " error" : ""}`, ...(m.streaming ? { "aria-busy": "true" } : {}) },
    h("span", { class: "who" }, icon("sparkle"), "Lente"),
    h("p", {}, m.text),
    m.sources?.length ? h("div", { class: "sources", "aria-label": "Fuentes" }, m.sources.map(sourceChip)) : null,
    m.ms ? h("span", { class: "msg-time num" }, `${(m.ms / 1000).toFixed(1)} s`) : null,
  );
}

function sourceChip(s) {
  const href = s.meetingId ? meetingPath(s.meetingId, s.turnId) : s.kind === "fact" ? pathFor("memory") : pathFor("today");
  return h("a", { class: "source", href }, icon(s.kind === "meeting" ? "calendar" : s.kind === "fact" ? "brain" : s.kind === "seen" ? "eye" : "ear"), h("span", {}, s.label));
}

/** The microphone button: the browser's speech recognition writes into the field (Spanish). */
function dictation(field) {
  let rec = null;
  const btn = h("button", { type: "button", class: "mic", "aria-label": "Dictar la pregunta", "aria-pressed": "false" }, icon("mic"));
  btn.addEventListener("click", () => {
    if (rec) return rec.stop();
    rec = new Recognition();
    rec.lang = "es-CO";
    rec.interimResults = true;
    const before = field.value ? `${field.value} ` : "";
    rec.onresult = (e) => (field.value = before + [...e.results].map((r) => r[0].transcript).join(""));
    rec.onend = rec.onerror = () => {
      rec = null;
      btn.setAttribute("aria-pressed", "false");
      field.focus();
    };
    btn.setAttribute("aria-pressed", "true");
    rec.start();
  });
  return btn;
}
