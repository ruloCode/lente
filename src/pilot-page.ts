// The phone screen for the pilot: what is happening, the one cue that matters, what the
// clip sees, and the day as a timeline. It can read everything out loud. Served by
// src/pilot.ts and fed by Server-Sent Events from /events.

import { logoSvg } from "./brand.ts";

export const PILOT_PAGE = `<!doctype html>
<html lang="es">
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
  /* Layout system measured in docs/kb/ui-reference.md: filled surfaces instead of borders,
     24 px cards, pill controls, 48 px targets, 56 px rows, 20 px gutter. */
  :root {
    --bg: #0b1013; --surface: #1a2429; --raised: #26323a; --line: #33414a; --ink: #e6edef; --muted: #8c9aa1;
    --cyan: #4fd0d8; --amber: #e8a052; --live: #ff6262; --ok: #3ccf7a; color-scheme: dark;
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
    --body: "Atkinson Hyperlegible", -apple-system, system-ui, sans-serif;
    --card: 24px; --tile: 14px; --tap: 48px; --row: 56px; --gutter: 20px;
  }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 16px/1.45 var(--body); -webkit-tap-highlight-color: transparent; }
  body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .wrap { width: 100%; max-width: 560px; margin: 0 auto; padding-left: max(var(--gutter), env(safe-area-inset-left)); padding-right: max(var(--gutter), env(safe-area-inset-right)); }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .label { font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
  .cap { font-size: 15px; font-weight: 700; color: var(--muted); }

  /* Header: brand, clip state, listening pill; a red strip across the top while listening. */
  header { border-top: 4px solid transparent; padding-top: env(safe-area-inset-top); }
  body[data-state="listening"] header { border-top-color: var(--live); }
  header .row { display: flex; align-items: center; gap: 12px; min-height: 64px; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 8px; font: 700 24px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  .brand svg { width: 28px; height: 28px; flex: none; }
  .clip { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); margin-left: auto; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
  /* Narrow phones: the dot and bars carry the clip state, the words stay for screen readers. */
  @media (max-width: 400px) { #clip { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
  .dot.on { background: var(--ok); }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; flex: none; }
  .bars i { width: 3px; border-radius: 2px; background: var(--line); height: 25%; transition: height .12s; }
  .listen { display: flex; align-items: center; gap: 8px; min-height: var(--tap); border: 2px solid transparent; background: var(--surface); border-radius: 999px; padding: 0 16px; font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .listen .rec { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--muted); }
  body[data-state="listening"] .listen { background: var(--live); color: #1c0606; }
  body[data-state="listening"] .listen .rec { background: #1c0606; border-color: #1c0606; animation: pulse 1.6s ease-in-out infinite; }
  body[data-state="paused"] .listen { background: transparent; border: 2px dashed var(--line); color: var(--muted); }
  body[data-state="idle"] .listen { color: var(--ink); }
  @keyframes pulse { 50% { opacity: .35; } }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--surface); border-radius: 999px; margin-bottom: 12px; }
  .modes button { border: 0; background: transparent; border-radius: 999px; min-height: var(--tap); padding: 0 8px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--muted); }
  .modes button[aria-pressed="true"] { background: var(--raised); color: var(--ink); }
  .modes svg { width: 18px; height: 18px; flex: none; }

  main { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  main .wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding-block: 4px 24px; }
  .note { display: flex; gap: 10px; align-items: baseline; font-size: 14px; background: var(--surface); border-radius: 16px; padding: 12px 16px; overflow-wrap: anywhere; }
  .note::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; transform: translateY(-1px); }

  /* The one card that matters. */
  .cue { border-radius: var(--card); padding: 18px 20px 20px; display: grid; gap: 8px; background: var(--raised); }
  .cue .label { color: var(--muted); font-size: 12px; letter-spacing: .2em; }
  .cue .text { font: 700 34px/1.05 var(--display); color: var(--cyan); text-wrap: balance; }
  .meta { font: 12px var(--mono); color: var(--amber); }

  /* Start or end a meeting: a pill field and a pill button, like an ask bar. */
  .meet { display: flex; gap: 8px; align-items: center; }
  .meet input, .group input:not([type="checkbox"]) { flex: 1; min-width: 0; min-height: var(--tap); border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); padding: 0 20px; font: inherit; font-size: 16px; }
  .group input:not([type="checkbox"]) { background: var(--bg); }
  .meet input::placeholder, .group input::placeholder { color: var(--muted); }
  .meet button, .group button { flex: none; min-height: var(--tap); border: 0; border-radius: 999px; background: var(--raised); padding: 0 20px; font-weight: 700; white-space: nowrap; }
  .meet button:disabled, .group button:disabled { opacity: .5; }
  .meet .live-title { position: relative; flex: 1; min-width: 0; line-height: var(--tap); padding: 0 20px 0 40px; border-radius: 999px; background: var(--surface); font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meet .live-title::before { content: ""; position: absolute; left: 20px; top: 19px; width: 10px; height: 10px; border-radius: 50%; background: var(--live); animation: pulse 1.6s ease-in-out infinite; }

  .now { border-radius: var(--card); padding: 16px 20px 18px; display: grid; gap: 6px; background: var(--surface); }
  .now .cap { display: flex; justify-content: space-between; gap: 8px; }
  .now .cap span + span { font: 500 12px var(--mono); }
  .now p { margin: 0; font-size: 18px; line-height: 1.35; }
  .now p.idle { font-size: 15px; color: var(--muted); }

  .view { background: var(--surface); border-radius: var(--card); overflow: hidden; }
  .frame { position: relative; background: #000; display: grid; place-items: center; }
  .frame canvas { display: block; width: 100%; height: auto; max-height: 48dvh; object-fit: contain; }
  .rotate { position: absolute; right: 12px; top: 12px; width: var(--tap); height: var(--tap); border-radius: 50%; border: 0; background: rgba(11,16,19,.72); display: grid; place-items: center; }
  .badge { position: absolute; left: 12px; top: 12px; padding: 8px 12px; border-radius: 999px; background: rgba(11,16,19,.72); color: var(--ink); }
  .badge.live { color: var(--live); }
  .caption { padding: 14px 20px 16px; display: grid; gap: 4px; }
  .caption p { margin: 0; font-size: 17px; line-height: 1.3; font-weight: 700; }
  .camoff { display: flex; align-items: center; gap: 12px; min-height: var(--row); padding: 12px 20px; color: var(--muted); font-size: 14px; }
  .camoff svg { width: 20px; height: 20px; flex: none; }

  /* Grouped rows: caption outside, rows inside one surface, dividers inset 16 px. */
  .section { display: grid; gap: 8px; margin-top: 12px; }
  .section > .cap { padding-left: 16px; }
  .group { background: var(--surface); border-radius: var(--card); overflow: hidden; }
  .group > :not([hidden]) ~ :not([hidden]) > summary { background: linear-gradient(var(--line), var(--line)) 16px 0 / calc(100% - 32px) 1px no-repeat; }
  .group summary { list-style: none; display: flex; align-items: center; gap: 16px; min-height: var(--row); padding: 0 16px; cursor: pointer; }
  .group summary::-webkit-details-marker { display: none; }
  .group summary > svg { width: 22px; height: 22px; flex: none; color: var(--muted); }
  .group summary .rl { flex: 1; min-width: 0; font-weight: 700; }
  .group summary .rv { color: var(--muted); font-size: 14px; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .group summary .chev { width: 18px; height: 18px; transition: transform .15s; }
  .group details[open] > summary .chev { transform: rotate(90deg); }
  .group details > :not(summary) { margin-left: 16px; margin-right: 16px; }
  .group details[open] > :last-child { margin-bottom: 16px; }
  .group .row, .group form { display: flex; gap: 8px; margin-top: 8px; margin-bottom: 0; }
  .group .row:first-of-type { margin-top: 0; }
  .group p { margin: 8px 0 0; font-size: 14px; color: var(--muted); }
  .group ul { margin: 4px 0 0; padding-left: 20px; }
  .group li { margin-top: 2px; }
  .sec { font-size: 13px; font-weight: 700; color: var(--muted); margin-top: 12px; }
  .brief .card { padding-top: 4px; display: grid; gap: 2px; font-size: 15px; }
  .brief li small { display: block; color: var(--muted); font: 12px var(--mono); }
  .brief .none { color: var(--muted); margin: 8px 0 0; }
  .lang .stats { margin-top: 0; margin-bottom: 4px; font-size: 15px; color: var(--ink); }
  .lang .stats b { font: 600 15px var(--mono); }
  .lang .t { border-top: 1px solid var(--line); padding: 12px 0; display: grid; gap: 2px; font-size: 15px; }
  .lang .t strong { font: 600 15px var(--mono); }
  .lang .t .n { color: var(--muted); font: 500 12px var(--mono); margin-left: 6px; }
  .lang .t em { color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
  .past .m { border-top: 1px solid var(--line); padding: 12px 0; display: grid; gap: 4px; font-size: 15px; }
  .past .m:first-child { border-top: 0; padding-top: 0; }
  .past .m h3 { margin: 0; font: 700 16px/1.25 var(--body); }
  .past .m .when { color: var(--muted); font: 12px var(--mono); }
  .past .m p { color: var(--ink); }
  .past .m button, .past .wipe { justify-self: start; padding: 0 16px; font-size: 14px; margin-top: 4px; }
  .past .wipe { color: var(--live); }
  .me label.sw { display: flex; align-items: center; gap: 12px; min-height: var(--tap); font-size: 15px; }
  .me label.sw input { flex: none; width: 20px; height: 20px; margin: 0; accent-color: var(--ink); }

  /* The day, newest at the bottom. */
  .tl-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 12px; padding-left: 16px; }
  .tl-head span + span { font: 500 12px var(--mono); color: var(--muted); }
  .timeline { display: grid; gap: 12px; }
  .item { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; align-items: start; }
  .chip { width: 32px; height: 32px; border-radius: 50%; background: var(--surface); display: grid; place-items: center; font: 700 12px var(--mono); color: var(--ink); }
  .item .body { min-width: 0; padding-top: 4px; }
  .item p { margin: 0; overflow-wrap: anywhere; }
  .item time { font: 11px var(--mono); color: var(--muted); }
  .item.q p { font-weight: 700; }
  .item.k-summary p { font-style: italic; }
  .item.k-cue .chip, .item.k-live .chip { font-size: 11px; }
  .item.k-live p { color: var(--muted); font-size: 14px; }
  .item.k-cue p { color: var(--cyan); font-weight: 700; }
  .partial { color: var(--muted); font-style: italic; padding-left: 44px; overflow-wrap: anywhere; }
  .hint { color: var(--muted); font-size: 15px; margin: 0; padding: 0 16px; }

  /* Actions within thumb reach; Look is the one filled button. */
  footer { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  footer .wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding-block: 8px 0; }
  .act { display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 64px; padding: 8px 4px; border-radius: 20px; border: 0; background: var(--surface); font-size: 13px; font-weight: 700; }
  .act svg { width: 22px; height: 22px; }
  .act.primary { background: var(--ink); color: var(--bg); }
  .act[aria-pressed="true"] { background: var(--raised); box-shadow: inset 0 0 0 2px var(--ink); }
  #live-btn[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--live); color: var(--live); }
  .act:disabled { opacity: .4; cursor: default; }
  @media (prefers-reduced-motion: reduce) { .bars i, .group summary .chev { transition: none; } .listen .rec, .meet .live-title::before { animation: none !important; } }
</style>
</head>
<body data-state="idle">
  <header>
    <div class="wrap">
      <div class="row">
        <span class="brand">${logoSvg(false)}Lente</span>
        <span class="clip"><span class="dot" id="dot"></span><span id="clip">Sin clip</span>
          <span class="bars" aria-hidden="true" id="bars"><i></i><i></i><i></i><i></i><i></i></span></span>
        <button class="listen" id="listen" aria-pressed="true"><span class="rec"></span><span id="listen-text">Escuchando</span></button>
      </div>
      <div class="modes" role="group" aria-label="Modo del clip">
        <button data-mode="mic" aria-pressed="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Solo audio
        </button>
        <button data-mode="camera" aria-pressed="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Audio y cámara
        </button>
      </div>
    </div>
  </header>

  <main>
    <div class="wrap">
      <div class="note" id="note" hidden></div>

      <section class="cue" id="cue" aria-live="assertive" hidden>
        <span class="label" id="cue-label">DILO</span>
        <div class="text" id="cue-text"></div>
        <span class="meta" id="cue-meta"></span>
      </section>

      <div class="meet" id="meet" data-running="false">
        <input id="meet-title" autocomplete="off" placeholder="Título (opcional)" aria-label="Título de la reunión">
        <span class="live-title" id="meet-live" hidden></span>
        <button id="meet-btn" type="button">Iniciar</button>
      </div>

      <section class="now" aria-live="polite">
        <span class="cap"><span>Qué está pasando</span><span id="now-time"></span></span>
        <p id="now-text" class="idle">Aquí aparece un resumen corto cada pocos minutos de conversación, o cuando tocas Resumen.</p>
      </section>

      <section class="view">
        <div class="frame" id="frame-box" hidden>
          <canvas id="frame"></canvas>
          <span class="badge label" id="badge">FOTO</span>
          <button class="rotate" id="rotate" aria-label="Girar imagen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>
          </button>
        </div>
        <div class="caption" id="caption" hidden>
          <p id="view-text"></p>
          <span class="meta" id="view-meta"></span>
        </div>
        <div class="camoff" id="camoff">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M9 5h6l2 3h3v9M4 8v11h13"/></svg>
          <span id="camoff-text">Cámara apagada para ahorrar batería. Mirar toma una sola foto cuando la necesites.</span>
        </div>
      </section>

      <section class="section">
        <span class="cap">Reuniones</span>
        <div class="group">
          <details class="brief" id="brief">
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>
              <span class="rl">Antes de la reunión</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </summary>
            <div class="row">
              <input id="brief-title" autocomplete="off" placeholder="Reunión (ej. Sprint review)" aria-label="Reunión">
            </div>
            <div class="row">
              <input id="brief-names" autocomplete="off" placeholder="Con quién" aria-label="Con quién">
              <button id="brief-btn" type="button">Preparar</button>
            </div>
            <div id="brief-out"></div>
          </details>
          <details class="past" id="past" hidden>
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>
              <span class="rl">Reuniones anteriores</span>
              <span class="rv" id="past-count">0</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </summary>
            <div id="past-list"></div>
            <button class="wipe" id="wipe" type="button">Borrar toda la memoria</button>
          </details>
        </div>
      </section>

      <section class="section">
        <span class="cap">Tú</span>
        <div class="group">
          <details class="me" id="me">
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              <span class="rl">Tu nombre</span>
              <span class="rv" id="me-names">sin definir</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </summary>
            <form id="me-form">
              <input id="me-input" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Rulo, Raúl" aria-label="Tu nombre y apodos, separados por comas">
              <button type="submit">Guardar</button>
            </form>
            <label class="sw"><input type="checkbox" id="me-all"> Contestar todas las preguntas (pruebas)</label>
            <p>Lente te avisa cuando alguien dice uno de estos nombres. Di “Lente, soy Rulo” para que reconozca tu voz.</p>
          </details>
          <details class="lang" id="lang" hidden>
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2M9 8h6"/></svg>
              <span class="rl">Mi vocabulario</span>
              <span class="rv" id="lang-count">0</span>
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </summary>
            <p class="stats" id="lang-stats"></p>
            <div id="lang-list"></div>
          </details>
        </div>
      </section>

      <div class="tl-head"><span class="cap">Hoy</span><span id="tl-count"></span></div>
      <div class="timeline" id="timeline">
        <p class="hint" id="tl-hint">Aquí aparece lo que se dice a tu alrededor, con una letra por persona. Solo se guarda como texto.</p>
        <div class="partial" id="partial"></div>
      </div>
    </div>
  </main>

  <footer>
    <div class="wrap">
      <button class="act primary" id="look" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Mirar
      </button>
      <button class="act" id="live-btn" aria-pressed="false" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>En vivo
      </button>
      <button class="act" id="voice" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>Voz
      </button>
      <button class="act" id="summary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>Resumen
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

  const BADGE = { LIVE: "EN VIVO", LOOK: "EN PANTALLA", PHOTO: "FOTO" };
  function showView(label, text, ms, photo) {
    if (photo) drawFrame(photo);
    $("badge").textContent = BADGE[label] || label;
    $("badge").classList.toggle("live", label === "LIVE");
    if (text) { $("view-text").textContent = text; $("caption").hidden = false; }
    $("view-meta").textContent = ms != null ? "descrito en " + ms + " ms" : "";
  }

  // --- Timeline of the day
  const timeline = $("timeline"), partial = $("partial");
  const rows = new Map();
  let count = 0;
  // Speaker labels (A, B…) belong to one transcription session; the hub says which one is the wearer.
  const speakerChip = (label) => (label && status && status.wearer === label ? "Tú" : label || "·");
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
    if (kind === "turn") $("tl-count").textContent = ++count + " turnos";
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
    $("me-names").textContent = names && names.length ? names.join(", ") : "sin definir";
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
  const BRIEF_SECTIONS = [["owed", "Le debes"], ["open", "Quedó abierto"], ["term", "Palabras que pueden salir"], ["phrase", "Frases a la mano"]];
  function showBriefing(b) {
    const out = $("brief-out");
    out.textContent = "";
    const card = document.createElement("div"); card.className = "card";
    if (!b) { out.append(card); return; }
    const title = {};
    for (const s of b.sources) title[s.id] = (s.title || "Reunión sin título") + ", " + new Date(s.startedAt).toLocaleDateString([], { day: "numeric", month: "short" });
    if (!b.remembered) {
      const none = document.createElement("p"); none.className = "none";
      none.textContent = "Aún no recuerdo reuniones relacionadas; solo te dejo frases para empezar.";
      card.append(none);
    }
    for (const [kind, label] of BRIEF_SECTIONS) {
      const items = b.items.filter((i) => i.kind === kind);
      if (!items.length) continue;
      const h = document.createElement("div"); h.className = "sec"; h.textContent = label; card.append(h);
      const ul = document.createElement("ul");
      for (const it of items) {
        const li = document.createElement("li"); li.textContent = it.text;
        if (it.sources.length) { const from = document.createElement("small"); from.textContent = "de " + it.sources.map((id) => title[id] || id).join(" · "); li.append(from); }
        ul.append(li);
      }
      card.append(ul);
    }
    out.append(card);
  }
  $("brief-btn").addEventListener("click", async () => {
    const btn = $("brief-btn");
    btn.disabled = true; btn.textContent = "Preparando…";
    try {
      const res = await fetch("/briefing", { method: "POST", body: JSON.stringify({ title: $("brief-title").value, names: $("brief-names").value }) });
      if (!res.ok) throw new Error(String(res.status));
      showBriefing(await res.json());
    } catch {
      const out = $("brief-out"); out.textContent = "";
      const p = document.createElement("p"); p.className = "none"; p.textContent = "No pude preparar el briefing. Intenta de nuevo."; out.append(p);
    }
    btn.disabled = false; btn.textContent = "Preparar";
  });
  function showLanguage(l) {
    const terms = l ? l.glossary : [];
    const phrases = l && l.phrases ? l.phrases : [];
    $("lang").hidden = !l || (!terms.length && !l.asked && !phrases.length);
    if (!l) return;
    $("lang-count").textContent = terms.length;
    const s = $("lang-stats");
    s.textContent = "";
    if (l.asked) {
      const a = document.createElement("b"), c = document.createElement("b");
      a.textContent = l.asked; c.textContent = l.answered;
      s.append("Te preguntaron ", a, " veces y contestaste ", c, ".");
    }
    const box = $("lang-list");
    box.textContent = "";
    if (phrases.length) {
      const h = document.createElement("div"); h.className = "t";
      const strong = document.createElement("strong"); strong.textContent = "Lo que sueles decir";
      h.append(strong);
      for (const ph of phrases) { const em = document.createElement("em"); em.textContent = "“" + ph + "”"; h.append(em); }
      box.append(h);
    }
    for (const t of terms) {
      const el = document.createElement("div"); el.className = "t";
      const head = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = t.term;
      const n = document.createElement("span"); n.className = "n"; n.textContent = "×" + t.count;
      head.append(strong, n);
      const meaning = document.createElement("div"); meaning.textContent = t.meaning;
      el.append(head, meaning);
      if (t.example) { const ex = document.createElement("em"); ex.textContent = "“" + t.example + "”"; el.append(ex); }
      box.append(el);
    }
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

  function asrNote(asr) {
    if (/^connecting/.test(asr)) return "Conectando la transcripción…";
    if (/^transcription closed/.test(asr)) return "Se cortó la transcripción. Reconectando…";
    if (/^transcription connection error/.test(asr)) return "No se pudo conectar la transcripción. Reintentando…";
    if (/^transcription error/.test(asr)) return "Error de transcripción: " + asr.replace(/^transcription error:\s*/, "");
    return asr;
  }

  // --- Keep the screen on while Lente listens, so a DILO card is never behind a lock screen.
  // Browsers only allow it over HTTPS or localhost; elsewhere the phone's own setting applies.
  let wakeLock = null, wakePending = false;
  async function keepAwake(on) {
    if (!("wakeLock" in navigator)) return;
    if (on && !wakeLock && !wakePending && document.visibilityState === "visible") {
      wakePending = true;
      try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } catch {}
      wakePending = false;
    } else if (!on && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => keepAwake(document.body.dataset.state === "listening"));

  function applyStatus(m) {
    const wearerChanged = !status || status.wearer !== m.wearer;
    status = m;
    if (wearerChanged) relabelSpeakers();
    showNames(m.names);
    showMeeting(m.meeting);
    $("me-all").checked = !!m.everyQuestion;
    $("dot").classList.toggle("on", m.clip);
    $("clip").textContent = m.clip ? "Clip" : "Sin clip";
    $("listen").setAttribute("aria-pressed", String(m.listening));
    const state = !m.listening ? "paused" : m.clip ? "listening" : "idle";
    document.body.dataset.state = state;
    keepAwake(state === "listening");
    $("listen-text").textContent = { listening: "Escuchando", paused: "En pausa", idle: "Esperando" }[state];
    for (const b of document.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m.mode));
    $("camoff").hidden = m.mode === "camera";
    $("look").disabled = !m.clip;
    $("live-btn").disabled = !m.clip;
    $("live-btn").setAttribute("aria-pressed", String(!!m.live));
    let note = "";
    if (m.clipError && !m.clip) note = "El hub rechazó el clip: " + m.clipError + ".";
    else if (/MODEL_API_KEY/.test(m.asr)) note = "Falta la clave de Meta: solo se ven la cámara y el nivel de audio.";
    else if (!m.clip) note = "Esperando el clip. Revisa que tenga batería y esté en la misma red Wi-Fi.";
    else if (m.listening && m.asr !== "listening") note = asrNote(m.asr);
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
    } else if (m.kind === "meetings") { showPast(m.items); showLanguage(m.language); }
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
        $("cue-meta").textContent = [whyLine(m), m.ms != null ? "en " + m.ms + " ms" : ""].filter(Boolean).join(" · ");
        addItem(m);
        if (navigator.vibrate) navigator.vibrate(120);
        say(m.text, "high");
      }
    }
  };
  es.onerror = () => { $("note").textContent = "Reconectando con la computadora…"; $("note").hidden = false; };

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
