// The phone screen for the pilot: what is happening, the one cue that matters, what the
// clip sees, and the day as a timeline. It can read everything out loud. Served by
// src/pilot.ts and fed by Server-Sent Events from /events.

import { logoSvg } from "./brand.ts";

export const PILOT_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b1013">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Lente">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<title>Lente</title>
<style>
  :root {
    --bg: #0b1013; --panel: #121a1f; --raised: #18222a; --ink: #e6edef; --muted: #8c9aa1; --line: #253139;
    --cyan: #4fd0d8; --amber: #e8a052; --live: #ff6262; --ok: #3ccf7a; color-scheme: dark;
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
    --body: "Atkinson Hyperlegible", -apple-system, system-ui, sans-serif;
  }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 16px/1.45 var(--body); -webkit-tap-highlight-color: transparent; }
  body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .wrap { width: 100%; max-width: 560px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }
  button { font: inherit; color: inherit; }
  button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .label { font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }

  header { border-bottom: 1px solid var(--line); border-top: 6px solid var(--line); padding-top: env(safe-area-inset-top); }
  body[data-state="listening"] header { border-top-color: var(--live); }
  header .row { display: flex; align-items: center; gap: 10px; padding-block: 10px; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 8px; font: 700 24px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  .brand svg { width: 26px; height: 26px; flex: none; }
  .clip { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); margin-left: auto; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
  .dot.on { background: var(--ok); }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; flex: none; }
  .bars i { width: 3px; border-radius: 2px; background: var(--line); height: 25%; transition: height .12s; }
  .listen { display: flex; align-items: center; gap: 7px; border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 7px 12px; font: 600 12px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; white-space: nowrap; }
  .listen .rec { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--muted); }
  body[data-state="listening"] .listen { background: var(--live); border-color: var(--live); color: #1c0606; }
  body[data-state="listening"] .listen .rec { background: #1c0606; border-color: #1c0606; animation: pulse 1.6s ease-in-out infinite; }
  body[data-state="paused"] .listen { border-style: dashed; color: var(--muted); }
  body[data-state="idle"] .listen { color: var(--ink); }
  @keyframes pulse { 50% { opacity: .35; } }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
  .modes button { border: 0; background: var(--panel); padding: 10px 6px; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 14px; font-weight: 600; color: var(--muted); }
  .modes button + button { border-left: 1px solid var(--line); }
  .modes button[aria-pressed="true"] { background: var(--raised); color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }
  .modes svg { width: 17px; height: 17px; }
  .note { font-size: 14px; color: var(--ink); background: var(--raised); border-left: 3px solid var(--muted); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; overflow-wrap: anywhere; }

  main { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  main .wrap { display: grid; gap: 12px; padding-block: 12px 20px; }

  .cue { border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: grid; gap: 6px; background: var(--raised); }
  .cue .label { color: var(--muted); font-size: 12px; letter-spacing: .2em; }
  .cue .text { font: 700 34px/1.05 var(--display); color: var(--cyan); text-wrap: balance; }
  .meta { font: 12px var(--mono); color: var(--amber); }

  .now { border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: grid; gap: 6px; background: var(--panel); }
  .now .label { color: var(--muted); display: flex; justify-content: space-between; gap: 8px; }
  .now p { margin: 0; font-size: 18px; line-height: 1.35; }
  .now p.idle { font-size: 15px; color: var(--muted); }

  .view { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .frame { position: relative; background: #000; display: grid; place-items: center; }
  .frame canvas { display: block; width: 100%; height: auto; max-height: 48dvh; object-fit: contain; }
  .rotate { position: absolute; right: 10px; top: 10px; width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(11,16,19,.75); display: grid; place-items: center; }
  .badge { position: absolute; left: 10px; top: 10px; padding: 7px 9px; border-radius: 999px; background: rgba(11,16,19,.75); color: var(--ink); }
  .badge.live { color: var(--live); }
  .caption { padding: 12px 16px 14px; display: grid; gap: 4px; }
  .caption p { margin: 0; font-size: 17px; line-height: 1.3; font-weight: 600; }
  .camoff { display: flex; align-items: center; gap: 10px; padding: 12px 16px; color: var(--muted); font-size: 14px; }
  .camoff svg { width: 18px; height: 18px; flex: none; }

  .tl-head { display: flex; justify-content: space-between; align-items: baseline; color: var(--muted); margin-top: 4px; }
  .timeline { display: grid; gap: 10px; }
  .item { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start; }
  .chip { width: 28px; height: 28px; border-radius: 50%; background: var(--raised); display: grid; place-items: center; font: 700 12px var(--mono); color: var(--ink); }
  .item .body { min-width: 0; }
  .item p { margin: 0; overflow-wrap: anywhere; }
  .item time { font: 11px var(--mono); color: var(--muted); }
  .item.q p { font-weight: 650; }
  .item.k-summary .chip { color: var(--ink); }
  .item.k-summary p { color: var(--ink); font-style: italic; }
  .item.k-cue .chip, .item.k-live .chip { font-size: 11px; }
  .me { margin-bottom: 10px; }
  .me summary { cursor: pointer; color: var(--muted); font-size: 14px; padding: 4px 0; }
  .me summary b { color: var(--ink); font-weight: 700; }
  .me form { display: flex; gap: 8px; padding-top: 6px; }
  .me input { flex: 1; min-width: 0; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 16px; }
  .me button { border: 1px solid var(--line); background: var(--panel); border-radius: 10px; padding: 0 14px; font-weight: 600; }
  .meet { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
  .meet input { flex: 1; min-width: 0; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 16px; }
  .meet button { border: 1px solid var(--line); background: var(--panel); border-radius: 10px; padding: 10px 14px; font-weight: 600; white-space: nowrap; }
  .meet[data-running="true"] button { background: var(--ink); border-color: var(--ink); color: var(--bg); }
  .meet .live-title { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .past { margin-bottom: 10px; }
  .past summary { cursor: pointer; color: var(--muted); font-size: 14px; padding: 4px 0; }
  .past .m { border-top: 1px solid var(--line); padding: 10px 0; display: grid; gap: 4px; font-size: 14px; }
  .past .m h3 { margin: 0; font: 700 16px/1.2 var(--body); }
  .past .m .when { color: var(--muted); font-size: 12px; font-family: var(--mono); }
  .past .m ul { margin: 0; padding-left: 18px; }
  .past .m .sec { font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
  .past .m button, .past .wipe { justify-self: start; border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 6px 10px; font-size: 13px; }
  .me label.sw { display: flex; align-items: center; gap: 8px; font-size: 14px; padding-top: 8px; }
  .me label.sw input { flex: none; width: 18px; height: 18px; padding: 0; accent-color: var(--ink); }
  .me p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
  .item.k-live p { color: var(--muted); font-size: 14px; }
  .item.k-cue p { color: var(--cyan); font-weight: 700; }
  .partial { color: var(--muted); font-style: italic; padding-left: 38px; overflow-wrap: anywhere; }
  .hint { color: var(--muted); font-size: 15px; margin: 0; }

  footer { border-top: 1px solid var(--line); padding-bottom: max(10px, env(safe-area-inset-bottom)); }
  footer .wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding-block: 10px 0; }
  .act { display: grid; justify-items: center; gap: 4px; padding: 10px 4px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); font-size: 12px; font-weight: 600; }
  .act svg { width: 22px; height: 22px; }
  .act.primary { background: var(--ink); border-color: var(--ink); color: var(--bg); }
  .act[aria-pressed="true"] { background: var(--raised); border-color: var(--ink); color: var(--ink); }
  #live-btn[aria-pressed="true"] { border-color: var(--live); color: var(--live); }
  .act:disabled { opacity: .4; }
  @media (prefers-reduced-motion: reduce) { .bars i { transition: none; } .listen .rec { animation: none !important; } }
</style>
</head>
<body data-state="idle">
  <header>
    <div class="wrap">
      <div class="row">
        <span class="brand">${logoSvg(false)}Lente</span>
        <button class="listen" id="listen" aria-pressed="true"><span class="rec"></span><span id="listen-text">Listening</span></button>
        <span class="clip"><span class="dot" id="dot"></span><span id="clip">Offline</span>
          <span class="bars" aria-hidden="true" id="bars"><i></i><i></i><i></i><i></i><i></i></span></span>
      </div>
      <div class="modes" role="group" aria-label="Clip mode">
        <button data-mode="mic" aria-pressed="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Mic only
        </button>
        <button data-mode="camera" aria-pressed="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Camera + mic
        </button>
      </div>
      <details class="me" id="me">
        <summary>Name people call you: <b id="me-names">not set</b></summary>
        <form id="me-form">
          <input id="me-input" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Rulo, Raúl" aria-label="Your name and nicknames, separated by commas">
          <button type="submit">Save</button>
        </form>
        <label class="sw"><input type="checkbox" id="me-all"> Contestar todas las preguntas (pruebas)</label>
        <p>Lente answers when someone says one of these names. Say “Lente, soy Rulo” to tell it which voice is yours.</p>
      </details>
      <div class="meet" id="meet" data-running="false">
        <input id="meet-title" autocomplete="off" placeholder="Título de la reunión (opcional)" aria-label="Título de la reunión">
        <span class="live-title" id="meet-live" hidden></span>
        <button id="meet-btn" type="button">Iniciar</button>
      </div>
      <details class="past" id="past" hidden>
        <summary>Reuniones anteriores (<span id="past-count">0</span>)</summary>
        <div id="past-list"></div>
        <button class="wipe" id="wipe" type="button">Borrar toda la memoria</button>
      </details>
      <div class="note" id="note" hidden></div>
    </div>
  </header>

  <main>
    <div class="wrap">
      <section class="cue" id="cue" aria-live="assertive" hidden>
        <span class="label" id="cue-label">DILO</span>
        <div class="text" id="cue-text"></div>
        <span class="meta" id="cue-meta"></span>
      </section>

      <section class="now" aria-live="polite">
        <span class="label"><span>What's happening</span><span id="now-time"></span></span>
        <p id="now-text" class="idle">A short summary appears here every few minutes of conversation, or when you tap Summary.</p>
      </section>

      <section class="view">
        <div class="frame" id="frame-box" hidden>
          <canvas id="frame"></canvas>
          <span class="badge label" id="badge">LOOK</span>
          <button class="rotate" id="rotate" aria-label="Rotate image">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>
          </button>
        </div>
        <div class="caption" id="caption" hidden>
          <p id="view-text"></p>
          <span class="meta" id="view-meta"></span>
        </div>
        <div class="camoff" id="camoff">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M9 5h6l2 3h3v9M4 8v11h13"/></svg>
          <span id="camoff-text">Camera off to save battery. Look still takes a single photo.</span>
        </div>
      </section>

      <div class="tl-head"><span class="label">Today</span><span class="label" id="tl-count"></span></div>
      <div class="timeline" id="timeline">
        <p class="hint" id="tl-hint">What is said around you shows up here, with a letter per speaker. It is kept as text only.</p>
        <div class="partial" id="partial"></div>
      </div>
    </div>
  </main>

  <footer>
    <div class="wrap">
      <button class="act primary" id="look" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Look
      </button>
      <button class="act" id="live-btn" aria-pressed="false" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>Live
      </button>
      <button class="act" id="voice" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>Voice
      </button>
      <button class="act" id="summary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>Summary
      </button>
    </div>
  </footer>

<script>
  const $ = (id) => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const post = (path) => fetch(path, { method: "POST" }).catch(() => {});
  const fmt = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  let status = {};
  const isDilo = (label) => label === "DILO" || label === "SAY THIS"; // older day records say SAY THIS

  // --- Voice: the phone reads cues and summaries out loud (ElevenLabs through the hub, or its own voice)
  let voiceOn = store.get("lente-voice") === "on";
  const player = new Audio();
  let speaking = false;
  let lastLiveSpoken = 0;
  const isSpanish = (t) => /[áéíóúñ¿¡]|\\b(el|la|que|de|los|las|una|está|hay|con|para)\\b/i.test(t);

  function stopVoice() {
    try { speechSynthesis.cancel(); } catch {}
    player.pause();
    speaking = false;
  }

  async function say(text, priority) {
    if (!voiceOn || !text) return;
    if (priority === "low" && (speaking || Date.now() - lastLiveSpoken < 7000)) return;
    if (priority === "high") stopVoice();
    else if (speaking) return;
    if (priority === "low") lastLiveSpoken = Date.now();
    speaking = true;
    const done = () => { speaking = false; };
    if (status.voice === "elevenlabs") {
      try {
        const r = await fetch("/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (!r.ok) throw new Error("tts " + r.status);
        player.src = URL.createObjectURL(await r.blob());
        player.onended = done;
        await player.play();
        return;
      } catch { /* fall back to the phone's own voice */ }
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = isSpanish(text) ? "es-ES" : "en-US";
      u.rate = 1.05;
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } catch { done(); }
  }

  function setVoice(on) {
    voiceOn = on;
    store.set("lente-voice", on ? "on" : "off");
    $("voice").setAttribute("aria-pressed", String(on));
    if (on) {
      // Phones only allow audio after a tap: this one unlocks both kinds of voice.
      player.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      player.play().catch(() => {});
      say(status.voice === "elevenlabs" ? "Voz activada." : "Voz activada.", "high");
    } else stopVoice();
  }

  // --- Camera frame, with a rotation the phone remembers
  let rotation = Number(store.get("lente-rotation")) || 0;
  let lastPhoto;
  function drawFrame(src) {
    lastPhoto = src;
    const img = new Image();
    img.onload = () => {
      const c = $("frame");
      const swap = rotation % 180 !== 0;
      c.width = swap ? img.height : img.width;
      c.height = swap ? img.width : img.height;
      const g = c.getContext("2d");
      g.translate(c.width / 2, c.height / 2);
      g.rotate((rotation * Math.PI) / 180);
      g.drawImage(img, -img.width / 2, -img.height / 2);
      $("frame-box").hidden = false;
    };
    img.src = src;
  }

  function showView(label, text, ms, photo) {
    if (photo) drawFrame(photo);
    $("badge").textContent = label;
    $("badge").classList.toggle("live", label === "LIVE");
    if (text) { $("view-text").textContent = text; $("caption").hidden = false; }
    $("view-meta").textContent = ms != null ? "described in " + ms + " ms" : "";
  }

  // --- Timeline of the day
  const timeline = $("timeline"), partial = $("partial");
  const rows = new Map();
  let count = 0;
  // Speaker labels (A, B…) belong to one transcription session; the hub says which one is the wearer.
  const speakerChip = (label) => (label && status && status.wearer === label ? "You" : label || "·");
  function relabelSpeakers() {
    for (const row of timeline.querySelectorAll(".item.k-turn")) row.querySelector(".chip").textContent = speakerChip(row.dataset.speaker);
  }
  const WHY = { name: "dijeron tu nombre", reply: "te respondían a ti", model: "parece dirigida a ti", testing: "modo todas las preguntas" };
  const whyLine = (e) => (e.why ? [e.asker ? "pregunta " + speakerChip(e.asker) : "", WHY[e.why] || e.why].filter(Boolean).join(" · ") : "");
  function addItem(e) {
    $("tl-hint").hidden = true;
    const row = document.createElement("div");
    const kind = e.kind;
    row.className = "item k-" + kind + (e.question ? " q" : "");
    const chip = kind === "turn" ? speakerChip(e.speaker) : kind === "summary" ? "✳" : kind === "cue" ? "→" : "◉";
    const text = kind === "cue" ? (isDilo(e.label) ? "Dilo: " : "") + e.text : e.text;
    row.innerHTML = '<span class="chip"></span><div class="body"><p></p><time></time></div>';
    row.querySelector(".chip").textContent = chip;
    if (kind === "turn") row.dataset.speaker = e.speaker || "";
    row.querySelector("p").textContent = text;
    row.querySelector("time").textContent = [fmt(e.at || Date.now()), kind === "cue" ? whyLine(e) : ""].filter(Boolean).join(" · ");
    timeline.insertBefore(row, partial);
    if (e.turnId != null) rows.set(String(e.turnId), row);
    if (kind === "turn") $("tl-count").textContent = ++count + " turns";
    const items = timeline.querySelectorAll(".item");
    if (items.length > 120) items[0].remove();
    partial.textContent = "";
  }

  function showSummary(e) {
    $("now-text").textContent = e.text;
    $("now-text").classList.remove("idle");
    $("now-time").textContent = fmt(e.at || Date.now());
  }

  function setLevel(rms) {
    const bars = $("bars").children;
    const level = Math.min(1, rms / 3000);
    for (let i = 0; i < bars.length; i++) {
      const on = level > i / bars.length;
      bars[i].style.height = on ? 30 + i * 17 + "%" : "25%";
      bars[i].style.background = on ? "var(--ink)" : "var(--line)";
    }
  }

  $("me-all").addEventListener("change", () => post($("me-all").checked ? "/cues/all" : "/cues/addressed"));
  function showNames(names) {
    $("me-names").textContent = names && names.length ? names.join(", ") : "not set";
    if (document.activeElement !== $("me-input")) $("me-input").value = names ? names.join(", ") : "";
  }
  $("me-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    fetch("/profile", { method: "POST", body: JSON.stringify({ names: $("me-input").value }) }).catch(() => {});
    $("me-input").blur();
    $("me").open = false;
  });

  // --- Meetings: start and end, notes of past ones, delete
  const MEETING_STATE = { running: "en curso", extracting: "sacando notas…", done: "", "too-short": "muy corta, sin notas", failed: "no se pudieron sacar notas" };
  const sendJson = (path, body) => fetch(path, { method: "POST", body: JSON.stringify(body || {}) }).catch(() => {});
  $("meet-btn").addEventListener("click", () => {
    if (status.meeting) sendJson("/meeting/end");
    else { sendJson("/meeting/start", { title: $("meet-title").value }); $("meet-title").value = ""; }
  });
  let wipeTimer = 0;
  $("wipe").addEventListener("click", () => {
    if (!wipeTimer) {
      $("wipe").textContent = "Toca de nuevo para borrar todo";
      wipeTimer = setTimeout(() => { wipeTimer = 0; $("wipe").textContent = "Borrar toda la memoria"; }, 4000);
      return;
    }
    clearTimeout(wipeTimer); wipeTimer = 0; $("wipe").textContent = "Borrar toda la memoria";
    sendJson("/meetings/delete-all");
  });
  function showMeeting(m) {
    const on = !!m;
    $("meet").dataset.running = String(on);
    $("meet-title").hidden = on;
    $("meet-live").hidden = !on;
    $("meet-live").textContent = on ? "En reunión" + (m.title ? ": " + m.title : "") + " · " + m.turns + " turnos" : "";
    $("meet-btn").textContent = on ? "Terminar" : "Iniciar";
  }
  function list(parent, label, items, line) {
    if (!items || !items.length) return;
    const h = document.createElement("div"); h.className = "sec"; h.textContent = label; parent.append(h);
    const ul = document.createElement("ul");
    for (const it of items) { const li = document.createElement("li"); li.textContent = line(it); ul.append(li); }
    parent.append(ul);
  }
  function showPast(items) {
    $("past").hidden = !items.length;
    $("past-count").textContent = items.length;
    const box = $("past-list");
    box.textContent = "";
    for (const m of items) {
      const el = document.createElement("div"); el.className = "m";
      const h = document.createElement("h3"); h.textContent = m.title || "Reunión sin título"; el.append(h);
      const when = document.createElement("div"); when.className = "when";
      when.textContent = [new Date(m.startedAt).toLocaleDateString([], { day: "numeric", month: "short" }) + " " + fmt(m.startedAt), m.turns + " turnos", MEETING_STATE[m.status]].filter(Boolean).join(" · ");
      el.append(when);
      if (m.notes) {
        if (m.notes.summary) { const p = document.createElement("p"); p.style.margin = "4px 0 0"; p.textContent = m.notes.summary; el.append(p); }
        list(el, "Decisiones", m.notes.decisions, (d) => d.text);
        list(el, "Compromisos", m.notes.commitments, (c) => (c.owner === "you" ? "Tú" : c.owner) + ": " + c.what + (c.due ? " (" + c.due + ")" : ""));
        list(el, "Pendientes", m.notes.openQuestions, (q) => q.text);
      }
      if (m.status !== "running") {
        const del = document.createElement("button"); del.type = "button"; del.textContent = "Borrar";
        del.addEventListener("click", () => sendJson("/meetings/delete", { id: m.id }));
        el.append(del);
      }
      box.append(el);
    }
  }

  function applyStatus(m) {
    const wearerChanged = !status || status.wearer !== m.wearer;
    status = m;
    if (wearerChanged) relabelSpeakers();
    showNames(m.names);
    showMeeting(m.meeting);
    $("me-all").checked = !!m.everyQuestion;
    $("dot").classList.toggle("on", m.clip);
    $("clip").textContent = m.clip ? "Clip" : "Offline";
    $("listen").setAttribute("aria-pressed", String(m.listening));
    const state = !m.listening ? "paused" : m.clip ? "listening" : "idle";
    document.body.dataset.state = state;
    $("listen-text").textContent = { listening: "Listening", paused: "Paused", idle: "Waiting" }[state];
    for (const b of document.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m.mode));
    $("camoff").hidden = m.mode === "camera";
    $("look").disabled = !m.clip;
    $("live-btn").disabled = !m.clip;
    $("live-btn").setAttribute("aria-pressed", String(!!m.live));
    let note = "";
    if (m.clipError && !m.clip) note = "The clip was refused: " + m.clipError + ".";
    else if (/MODEL_API_KEY/.test(m.asr)) note = "No Meta key yet: camera and microphone only.";
    else if (!m.clip) note = "Waiting for the clip. Check that it has power and is on the same Wi-Fi.";
    else if (m.listening && m.asr !== "listening") note = m.asr;
    $("note").textContent = note;
    $("note").hidden = !note;
    if (!m.clip) setLevel(0);
  }

  const es = new EventSource("/events");
  es.onmessage = (msg) => {
    const m = JSON.parse(msg.data);
    if (m.kind === "status") applyStatus(m);
    else if (m.kind === "history") {
      for (const e of m.items) {
        addItem(e);
        if (e.kind === "summary") showSummary(e);
      }
    } else if (m.kind === "meetings") showPast(m.items);
    else if (m.kind === "level") setLevel(m.rms);
    else if (m.kind === "partial") { $("tl-hint").hidden = true; partial.textContent = m.text; }
    else if (m.kind === "turn") addItem(m);
    else if (m.kind === "speaker") { const r = rows.get(String(m.turnId)); if (r) { r.dataset.speaker = m.speaker; r.querySelector(".chip").textContent = speakerChip(m.speaker); } }
    else if (m.kind === "summary") { addItem(m); showSummary(m); say(m.text, "normal"); }
    else if (m.kind === "live") {
      showView("LIVE", m.text, m.ms, m.photo);
      if (m.text) { addItem(m); say(m.text, "low"); }
    } else if (m.kind === "cue") {
      if (m.photo) {
        showView(m.label === "ON SCREEN" ? "LOOK" : "PHOTO", m.text, m.ms, m.photo);
        if (m.label === "ON SCREEN") { addItem(m); say(m.text, "normal"); }
      } else {
        $("cue").hidden = false;
        $("cue-label").textContent = isDilo(m.label) ? "DILO" : m.label;
        $("cue-text").textContent = m.text;
        $("cue-meta").textContent = [whyLine(m), m.ms != null ? "in " + m.ms + " ms" : ""].filter(Boolean).join(" · ");
        addItem(m);
        if (navigator.vibrate) navigator.vibrate(120);
        say(m.text, "high");
      }
    }
  };
  es.onerror = () => { $("note").textContent = "Reconnecting to the laptop…"; $("note").hidden = false; };

  $("listen").addEventListener("click", () => post(status.listening ? "/listen/off" : "/listen/on"));
  for (const b of document.querySelectorAll("[data-mode]")) b.addEventListener("click", () => post("/mode/" + b.dataset.mode));
  $("live-btn").addEventListener("click", () => post(status.live ? "/live/off" : "/live/on"));
  $("voice").addEventListener("click", () => setVoice(!voiceOn));
  $("summary").addEventListener("click", () => post("/summary"));
  $("rotate").addEventListener("click", () => {
    rotation = (rotation + 90) % 360;
    store.set("lente-rotation", String(rotation));
    if (lastPhoto) drawFrame(lastPhoto);
  });
  $("look").addEventListener("click", async () => {
    $("look").disabled = true;
    await post("/look");
    setTimeout(() => ($("look").disabled = !status.clip), 1500);
  });
  $("voice").setAttribute("aria-pressed", String(voiceOn));
</script>
</body>
</html>`;
