// The phone screen for the pilot. Ahora holds the live loop (the one cue that matters, what
// is happening, what the clip sees, the day as a timeline); a side menu leads to meetings,
// memory, devices and settings, and marks planned features as such. A first-run
// introduction sets the wearer up. Served by src/pilot.ts and fed by Server-Sent Events.

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
     24 px cards, pill controls, 48 px targets, 56 px rows, 20 px gutter, a side menu. */
  :root {
    --bg: #0b1013; --surface: #1a2429; --raised: #26323a; --line: #33414a; --ink: #e6edef; --muted: #8c9aa1;
    --cyan: #4fd0d8; --amber: #e8a052; --live: #ff6262; --ok: #3ccf7a; color-scheme: dark;
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
    --body: "Atkinson Hyperlegible", -apple-system, system-ui, sans-serif;
    --card: 24px; --tap: 48px; --row: 56px; --gutter: 20px;
  }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 16px/1.45 var(--body); -webkit-tap-highlight-color: transparent; }
  body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .wrap { width: 100%; max-width: 560px; margin: 0 auto; padding-left: max(var(--gutter), env(safe-area-inset-left)); padding-right: max(var(--gutter), env(safe-area-inset-right)); }
  button { font: inherit; color: inherit; cursor: pointer; }
  a { color: inherit; text-decoration: none; }
  button:focus-visible, summary:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .label { font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
  .cap { font-size: 15px; font-weight: 700; color: var(--muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  svg.i { width: 22px; height: 22px; flex: none; }

  /* Header: menu, section title, listening pill; a red strip across the top while listening. */
  header { border-top: 4px solid transparent; padding-top: env(safe-area-inset-top); }
  body[data-state="listening"] header { border-top-color: var(--live); }
  header .row { display: flex; align-items: center; gap: 12px; min-height: 64px; min-width: 0; }
  .round { width: var(--tap); height: var(--tap); flex: none; border: 0; border-radius: 50%; background: var(--surface); display: grid; place-items: center; }
  .title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 0; font: 700 18px/1.2 var(--body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title svg { width: 26px; height: 26px; flex: none; }
  body:not([data-screen="ahora"]) .title svg { display: none; }
  body[data-screen="ahora"] .title { font: 700 24px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  .listen { display: flex; align-items: center; gap: 8px; min-height: var(--tap); flex: none; border: 2px solid transparent; background: var(--surface); border-radius: 999px; padding: 0 16px; font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .listen .rec { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--muted); }
  body[data-state="listening"] .listen { background: var(--live); color: #1c0606; }
  body[data-state="listening"] .listen .rec { background: #1c0606; border-color: #1c0606; animation: pulse 1.6s ease-in-out infinite; }
  body[data-state="paused"] .listen { background: transparent; border: 2px dashed var(--line); color: var(--muted); }
  body[data-state="idle"] .listen { color: var(--ink); }
  @keyframes pulse { 50% { opacity: .35; } }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
  .dot.on { background: var(--ok); }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 14px; flex: none; }
  .bars i { width: 3px; border-radius: 2px; background: var(--line); height: 25%; transition: height .12s; }

  /* Side menu */
  .scrim { position: fixed; inset: 0; background: rgba(3,5,6,.6); z-index: 20; opacity: 0; pointer-events: none; transition: opacity .2s; }
  .drawer { position: fixed; z-index: 21; top: 0; bottom: 0; left: 0; width: min(300px, 84vw); background: var(--bg); padding: calc(env(safe-area-inset-top) + 12px) 10px calc(env(safe-area-inset-bottom) + 12px); display: flex; flex-direction: column; gap: 2px; overflow-y: auto; transform: translateX(-102%); transition: transform .2s ease; }
  body.menu-open .scrim { opacity: 1; pointer-events: auto; }
  body.menu-open .drawer { transform: none; }
  .drawer .brand { display: flex; align-items: center; gap: 8px; padding: 8px 12px 4px; font: 700 24px/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
  .drawer .brand svg { width: 28px; height: 28px; }
  .drawer .clipline { display: flex; align-items: center; gap: 8px; padding: 4px 12px 12px; font-size: 13px; color: var(--muted); }
  .drawer a { display: flex; align-items: center; gap: 16px; min-height: var(--tap); padding: 0 12px; border-radius: 14px; font-weight: 700; }
  .drawer a[aria-current="page"] { background: var(--surface); }
  .drawer a svg { color: var(--muted); }
  .drawer a[aria-current="page"] svg { color: var(--ink); }
  .drawer .cap { padding: 16px 12px 6px; }
  .drawer a.soon { color: var(--muted); font-weight: 400; }
  .drawer a.recent { font-weight: 400; font-size: 15px; }
  .drawer a.recent span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { margin-left: auto; font: 600 10px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 5px 8px; flex: none; }

  main { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .screen { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding-block: 4px 24px; }
  .screen:not(.on) { display: none; }

  /* Ahora */
  .statusrow { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface); font-size: 13px; color: var(--muted); justify-self: start; max-width: 100%; }
  .statusrow .bars { margin-left: 4px; }
  .note { display: flex; gap: 10px; align-items: baseline; font-size: 14px; background: var(--surface); border-radius: 16px; padding: 12px 16px; overflow-wrap: anywhere; }
  .note::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; transform: translateY(-1px); }
  .cue { border-radius: var(--card); padding: 18px 20px 20px; display: grid; gap: 8px; background: var(--raised); }
  .cue .label { color: var(--muted); font-size: 12px; letter-spacing: .2em; }
  .cue .text { font: 700 34px/1.05 var(--display); color: var(--cyan); text-wrap: balance; }
  .meta { font: 12px var(--mono); color: var(--amber); }
  .meet { display: flex; gap: 8px; align-items: center; }
  .field, .meet input { flex: 1; min-width: 0; width: 100%; min-height: var(--tap); border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); padding: 0 20px; font: inherit; font-size: 16px; }
  .group .field { background: var(--bg); }
  .field::placeholder, .meet input::placeholder { color: var(--muted); }
  .btn { flex: none; min-height: var(--tap); border: 0; border-radius: 999px; background: var(--raised); padding: 0 20px; font-weight: 700; white-space: nowrap; }
  .btn:disabled { opacity: .5; }
  .btn.primary { background: var(--ink); color: var(--bg); }
  .btn.danger { color: var(--live); }
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
  .camoff { display: flex; align-items: center; gap: 12px; min-height: var(--row); padding: 8px 8px 8px 20px; color: var(--muted); font-size: 14px; }
  .camoff span { flex: 1; }
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

  /* Grouped rows: caption outside, rows inside one surface, dividers inset 16 px. */
  .section { display: grid; gap: 8px; margin-top: 8px; }
  .section > .cap { padding-left: 16px; }
  .group { background: var(--surface); border-radius: var(--card); overflow: hidden; }
  .group > :not([hidden]) ~ :not([hidden]) { background-image: linear-gradient(var(--line), var(--line)); background-position: 16px 0; background-size: calc(100% - 32px) 1px; background-repeat: no-repeat; }
  .rowi, .group summary { display: flex; align-items: center; gap: 16px; min-height: var(--row); padding: 0 16px; }
  .group summary { list-style: none; cursor: pointer; }
  .group summary::-webkit-details-marker { display: none; }
  .rowi > svg, .group summary > svg { color: var(--muted); }
  .rl { flex: 1; min-width: 0; font-weight: 700; }
  .rl small { display: block; font-weight: 400; font-size: 13px; color: var(--muted); }
  .rv { color: var(--muted); font-size: 14px; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { width: 18px; height: 18px; flex: none; color: var(--muted); transition: transform .15s; }
  details[open] > summary .chev { transform: rotate(90deg); }
  a.rowi, button.rowi { width: 100%; border: 0; background-color: transparent; text-align: left; }
  .pad { padding: 0 16px 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .pad p, .group p.help { margin: 0; font-size: 14px; color: var(--muted); }
  .group p.help { padding: 0 16px 16px; }
  .inline { display: flex; gap: 8px; }
  .sec { font-size: 13px; font-weight: 700; color: var(--muted); margin-top: 8px; }
  .pad ul { margin: 0; padding-left: 20px; }
  .brief-out .none { color: var(--muted); margin: 0; }
  .brief-out li small { display: block; color: var(--muted); font: 12px var(--mono); }
  .m .when { color: var(--muted); font: 12px var(--mono); }
  .m p { margin: 0; color: var(--ink); font-size: 15px; }
  .m .btn { justify-self: start; }
  .empty { text-align: center; color: var(--muted); font-size: 15px; padding: 32px 16px; display: grid; gap: 16px; justify-items: center; }
  .empty .btn { color: var(--ink); }
  .switch { appearance: none; -webkit-appearance: none; flex: none; width: 52px; height: 32px; margin: 0; border-radius: 999px; background: var(--raised); position: relative; cursor: pointer; transition: background .15s; }
  .switch::after { content: ""; position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 50%; background: var(--muted); transition: transform .15s, background .15s; }
  .switch:checked { background: var(--ink); }
  .switch:checked::after { transform: translateX(20px); background: var(--bg); }
  label.rowi { cursor: pointer; }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--surface); border-radius: 999px; }
  .modes button { border: 0; background: transparent; border-radius: 999px; min-height: var(--tap); padding: 0 8px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--muted); }
  .modes button[aria-pressed="true"] { background: var(--raised); color: var(--ink); }
  .modes svg { width: 18px; height: 18px; flex: none; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .tile { background: var(--surface); border-radius: 20px; padding: 16px 18px; display: grid; gap: 4px; }
  .tile b { font: 600 36px/1 var(--mono); color: var(--ink); }
  .tile span { color: var(--muted); font-size: 14px; }
  .term strong { font: 600 15px var(--mono); }
  .term .n { color: var(--muted); font: 500 12px var(--mono); margin-left: 6px; }
  .term div { font-size: 15px; }
  .term em { color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
  .term { padding: 12px 16px; display: grid; gap: 2px; }
  .soonview { text-align: center; padding: 48px 16px; display: grid; gap: 14px; justify-items: center; }
  .soonview .big { width: 72px; height: 72px; border-radius: 24px; background: var(--surface); display: grid; place-items: center; color: var(--muted); }
  .soonview .big svg { width: 32px; height: 32px; }
  .soonview h2 { margin: 0; font-size: 22px; }
  .soonview p { margin: 0; color: var(--muted); max-width: 32ch; }
  .soonview code { font: 12px var(--mono); color: var(--muted); }

  /* Actions within thumb reach, only on Ahora; Mirar is the one filled button. */
  footer { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
  body:not([data-screen="ahora"]) footer { display: none; }
  footer .wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding-block: 8px 0; }
  .act { display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 64px; padding: 8px 4px; border-radius: 20px; border: 0; background: var(--surface); font-size: 13px; font-weight: 700; }
  .act svg { width: 22px; height: 22px; }
  .act.primary { background: var(--ink); color: var(--bg); }
  .act[aria-pressed="true"] { background: var(--raised); box-shadow: inset 0 0 0 2px var(--ink); }
  #live-btn[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--live); color: var(--live); }
  .act:disabled { opacity: .4; cursor: default; }

  /* First-run introduction */
  .intro { position: fixed; inset: 0; z-index: 30; background: var(--bg); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; padding: calc(env(safe-area-inset-top) + 8px) 0 calc(env(safe-area-inset-bottom) + 16px); }
  .intro .top { display: flex; align-items: center; justify-content: space-between; min-height: var(--tap); }
  .intro .dots { display: flex; gap: 6px; }
  .intro .dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
  .intro .dots i.on { background: var(--ink); width: 20px; border-radius: 999px; }
  .intro .skip { border: 0; background: transparent; color: var(--muted); min-height: var(--tap); padding: 0 4px; font-weight: 700; }
  .intro .body { overflow-y: auto; display: grid; align-content: center; }
  .step { display: grid; gap: 16px; padding-block: 24px; }
  .step .mark svg { width: 88px; height: 88px; }
  .step h2 { margin: 0; font: 700 34px/1.05 var(--display); text-wrap: balance; }
  .step p { margin: 0; color: var(--muted); font-size: 17px; }
  .step .live { display: flex; align-items: center; gap: 12px; min-height: var(--row); padding: 0 20px; background: var(--surface); border-radius: 18px; font-weight: 700; }
  .step .live .dot { width: 12px; height: 12px; }
  .step .say { font: 700 30px/1.1 var(--display); color: var(--ink); }
  .step .demo { display: flex; gap: 12px; align-items: center; }
  .step .demo .listen { pointer-events: none; }
  .intro .bottom { display: flex; gap: 8px; }
  .intro .bottom .btn { flex: 1; min-height: 56px; font-size: 17px; }
  .intro .bottom .back { flex: none; }
  @media (prefers-reduced-motion: reduce) { .bars i, .chev, .drawer, .scrim, .switch, .switch::after { transition: none; } .listen .rec, .meet .live-title::before { animation: none !important; } }
</style>
</head>
<body data-state="idle" data-screen="ahora">
  <header>
    <div class="wrap">
      <div class="row">
        <button class="round" id="menu-btn" aria-label="Abrir menú" aria-expanded="false" aria-controls="drawer">
          <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <h1 class="title">${logoSvg(false)}<span id="screen-title">Lente</span></h1>
        <button class="listen" id="listen" aria-pressed="true"><span class="rec"></span><span id="listen-text">Escuchando</span></button>
      </div>
    </div>
  </header>

  <div class="scrim" id="scrim"></div>
  <nav class="drawer" id="drawer" aria-label="Menú" inert>
    <div class="brand">${logoSvg(false)}Lente</div>
    <div class="clipline"><span class="dot" id="menu-dot"></span><span id="menu-clip">Sin clip</span></div>
    <a href="#ahora" data-nav="ahora"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>Ahora</a>
    <a href="#reuniones" data-nav="reuniones"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>Reuniones</a>
    <a href="#memoria" data-nav="memoria"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2M9 8h6"/></svg>Memoria</a>
    <a href="#dispositivos" data-nav="dispositivos"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="14" r="4"/><circle cx="17" cy="14" r="4"/><path d="M11 14h2M3 14V9M21 14V9"/></svg>Dispositivos</a>
    <a href="#ajustes" data-nav="ajustes"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Ajustes</a>
    <span class="cap">Pronto</span>
    <a href="#acciones" data-nav="acciones" class="soon"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>Acciones<span class="tag">Pronto</span></a>
    <a href="#conexiones" data-nav="conexiones" class="soon"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/></svg>Conexiones<span class="tag">Pronto</span></a>
    <a href="#equipo" data-nav="equipo" class="soon"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>Equipo<span class="tag">Pronto</span></a>
    <span class="cap" id="recent-cap" hidden>Recientes</span>
    <div id="recent-list" style="display:contents"></div>
  </nav>

  <main id="main">
    <div class="wrap">

      <section class="screen on" data-screen="ahora">
        <button class="statusrow" id="status-row" aria-label="Ver dispositivos"><span class="dot" id="dot"></span><span id="clip">Sin clip</span><span id="mode-text"></span><span class="bars" aria-hidden="true" id="bars"><i></i><i></i><i></i><i></i><i></i></span></button>
        <div class="note" id="note" hidden></div>
        <section class="cue" id="cue" aria-live="assertive" hidden>
          <span class="label" id="cue-label">DILO</span>
          <div class="text" id="cue-text"></div>
          <span class="meta" id="cue-meta"></span>
        </section>
        <div class="meet" id="meet" data-running="false">
          <input id="meet-title" autocomplete="off" placeholder="Título (opcional)" aria-label="Título de la reunión">
          <span class="live-title" id="meet-live" hidden></span>
          <button class="btn" id="meet-btn" type="button">Iniciar</button>
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
            <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M9 5h6l2 3h3v9M4 8v11h13"/></svg>
            <span>Cámara apagada para ahorrar batería. Mirar toma una sola foto.</span>
            <button class="btn" id="cam-on" type="button">Activar</button>
          </div>
        </section>
        <div class="tl-head"><span class="cap">Hoy</span><span id="tl-count"></span></div>
        <div class="timeline" id="timeline">
          <p class="hint" id="tl-hint">Aquí aparece lo que se dice a tu alrededor, con una letra por persona. Solo se guarda como texto.</p>
          <div class="partial" id="partial"></div>
        </div>
      </section>

      <section class="screen" data-screen="reuniones">
        <div class="section">
          <span class="cap">Antes de la reunión</span>
          <div class="group">
            <div class="pad" style="padding-top:16px">
              <p>Te recuerdo qué quedó pendiente con esas personas y frases útiles.</p>
              <input class="field" id="brief-title" autocomplete="off" placeholder="Reunión (ej. Sprint review)" aria-label="Reunión">
              <div class="inline">
                <input class="field" id="brief-names" autocomplete="off" placeholder="Con quién" aria-label="Con quién">
                <button class="btn primary" id="brief-btn" type="button">Preparar</button>
              </div>
              <div class="brief-out" id="brief-out"></div>
            </div>
          </div>
        </div>
        <div class="section">
          <span class="cap">Anteriores</span>
          <div class="group" id="past-list" hidden></div>
          <div class="empty" id="past-empty">Aún no hay reuniones guardadas. Inicia una desde Ahora y aquí verás sus notas.<a class="btn" href="#ahora">Ir a Ahora</a></div>
        </div>
      </section>

      <section class="screen" data-screen="memoria">
        <div class="tiles" id="mem-tiles" hidden>
          <div class="tile"><b id="mem-asked">0</b><span>veces te preguntaron</span></div>
          <div class="tile"><b id="mem-answered">0</b><span>veces contestaste</span></div>
        </div>
        <div class="section" id="mem-phrases-box" hidden>
          <span class="cap">Lo que sueles decir</span>
          <div class="group" id="mem-phrases"></div>
        </div>
        <div class="section" id="mem-terms-box" hidden>
          <span class="cap">Mi vocabulario</span>
          <div class="group" id="mem-terms"></div>
        </div>
        <div class="empty" id="mem-empty">Cuando termines una reunión, aquí verás cuántas veces te preguntaron, las frases que repites y las palabras nuevas.</div>
      </section>

      <section class="screen" data-screen="dispositivos">
        <div class="section">
          <span class="cap">Clip</span>
          <div class="group">
            <div class="rowi"><span class="dot" id="dev-dot"></span><span class="rl" id="dev-state">Sin clip</span></div>
            <div class="rowi"><span class="rl">Audio perdido</span><span class="rv" id="dev-lost">0</span></div>
            <div class="rowi"><span class="rl">Audio con retraso</span><span class="rv" id="dev-late">0</span></div>
          </div>
          <p class="hint" id="dev-help">Enciende el clip: se conecta solo a la misma red Wi-Fi que la computadora.</p>
        </div>
        <div class="section">
          <span class="cap">Modo</span>
          <div class="modes" role="group" aria-label="Modo del clip">
            <button data-mode="mic" aria-pressed="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Solo audio
            </button>
            <button data-mode="camera" aria-pressed="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Audio y cámara
            </button>
          </div>
        </div>
        <div class="section">
          <span class="cap">Otras formas de usar Lente</span>
          <div class="group">
            <a class="rowi" href="#computadora"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg><span class="rl">Modo computadora<small>Meet, Teams o Zoom, sin el clip</small></span><span class="tag">Pronto</span></a>
            <a class="rowi" href="#nube"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/></svg><span class="rl">Hub en la nube<small>Funciona fuera de casa</small></span><span class="tag">Pronto</span></a>
          </div>
        </div>
      </section>

      <section class="screen" data-screen="ajustes">
        <div class="section">
          <span class="cap">Tú</span>
          <div class="group">
            <details id="me">
              <summary>
                <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                <span class="rl">Tu nombre</span><span class="rv" id="me-names">sin definir</span>
                <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              </summary>
              <div class="pad">
                <form class="inline" id="me-form">
                  <input class="field" id="me-input" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Rulo, Raúl" aria-label="Tu nombre y apodos, separados por comas">
                  <button class="btn primary" type="submit">Guardar</button>
                </form>
                <p>Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.</p>
              </div>
            </details>
            <div class="rowi">
              <svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
              <span class="rl">Tu voz<small id="voice-hint">Di “Lente, soy …” con el clip puesto</small></span><span class="rv" id="voice-id">Sin reconocer</span>
            </div>
          </div>
        </div>
        <div class="section">
          <span class="cap">Lente</span>
          <div class="group">
            <label class="rowi"><span class="rl">Leer en voz alta<small>Las respuestas y los resúmenes, en el teléfono</small></span><input type="checkbox" class="switch" id="voice-set"></label>
            <label class="rowi"><span class="rl">Contestar todas las preguntas<small>Para pruebas: aunque no sean para ti</small></span><input type="checkbox" class="switch" id="me-all"></label>
          </div>
        </div>
        <div class="section">
          <span class="cap">Privacidad</span>
          <div class="group">
            <div class="pad" style="padding-top:16px">
              <p>Lente guarda solo texto, nunca audio. Mientras escucha lo verás siempre arriba, y puedes pausarlo cuando quieras.</p>
              <button class="btn danger" id="wipe" type="button" style="justify-self:start">Borrar toda la memoria</button>
            </div>
          </div>
        </div>
        <div class="section">
          <span class="cap">Ayuda</span>
          <div class="group">
            <button class="rowi" id="intro-again" type="button"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg><span class="rl">Ver la introducción</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
            <div class="rowi"><span class="rl">Modelos<small>Muse Voice Transcribe y Muse Spark 1.3 de Meta</small></span></div>
          </div>
        </div>
      </section>

      <section class="screen" data-screen="pronto">
        <div class="soonview">
          <div class="big" id="soon-icon"></div>
          <span class="tag" style="margin:0">Pronto</span>
          <h2 id="soon-title"></h2>
          <p id="soon-text"></p>
          <code id="soon-change"></code>
        </div>
      </section>

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

  <div class="intro" id="intro" role="dialog" aria-modal="true" aria-label="Introducción" hidden>
    <div class="wrap top"><div class="dots" id="intro-dots"><i></i><i></i><i></i><i></i><i></i></div><button class="skip" id="intro-skip" type="button">Omitir</button></div>
    <div class="wrap body">
      <div class="step" data-step="1">
        <div class="mark">${logoSvg(false)}</div>
        <h2>Te dice qué decir, justo cuando te preguntan.</h2>
        <p>Lente escucha la reunión desde el clip de tus lentes. Cuando alguien te hace una pregunta, aquí aparece una frase para responder: DILO.</p>
      </div>
      <div class="step" data-step="2" hidden>
        <h2>¿Cómo te llaman?</h2>
        <p>Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.</p>
        <input class="field" id="intro-names" autocomplete="off" autocapitalize="words" enterkeyhint="next" placeholder="Rulo, Raúl" aria-label="Tu nombre y apodos">
      </div>
      <div class="step" data-step="3" hidden>
        <h2>Conecta el clip</h2>
        <p>Enciéndelo: se conecta solo a la misma red Wi-Fi que la computadora donde corre Lente.</p>
        <div class="live"><span class="dot" id="intro-clip-dot"></span><span id="intro-clip">Esperando el clip…</span></div>
      </div>
      <div class="step" data-step="4" hidden>
        <h2>Que reconozca tu voz</h2>
        <p>Con el clip puesto, di en voz alta:</p>
        <div class="say" id="intro-say">“Lente, soy …”</div>
        <div class="live"><span class="dot" id="intro-voice-dot"></span><span id="intro-voice">Escuchando…</span></div>
      </div>
      <div class="step" data-step="5" hidden>
        <h2>Siempre a la vista</h2>
        <p>Mientras escucha verás la franja roja arriba y este botón. Tócalo cuando quieras pausar. Lente guarda solo texto, nunca audio.</p>
        <div class="demo"><span class="listen" style="background:var(--live);color:#1c0606"><span class="rec" style="background:#1c0606;border-color:#1c0606"></span>Escuchando</span><span class="listen" style="background:transparent;border:2px dashed var(--line);color:var(--muted)"><span class="rec"></span>En pausa</span></div>
      </div>
    </div>
    <div class="wrap bottom"><button class="btn back" id="intro-back" type="button" hidden>Atrás</button><button class="btn primary" id="intro-next" type="button">Siguiente</button></div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const post = (path) => fetch(path, { method: "POST" }).catch(() => {});
  const sendJson = (path, body) => fetch(path, { method: "POST", body: JSON.stringify(body || {}) }).catch(() => {});
  const fmt = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = (at) => new Date(at).toLocaleDateString([], { day: "numeric", month: "short" });
  let status = {};
  const isDilo = (label) => label === "DILO" || label === "SAY THIS"; // older day records say SAY THIS

  // --- Sections and the side menu. The hash names the section, so the back button works.
  const TITLES = { ahora: "Lente", reuniones: "Reuniones", memoria: "Memoria", dispositivos: "Dispositivos", ajustes: "Ajustes" };
  // Planned, not built: each says what it will do and when it comes.
  const PLANNED = {
    acciones: { title: "Acciones", when: "Llega con add-closing-agent", icon: '<path d="M8.5 12l2.5 2.5 4.5-5"/><rect x="4" y="4" width="16" height="16" rx="4"/>',
      text: "Al terminar una reunión, un agente redactará el correo de seguimiento y tus tareas, con la evidencia de cada una. Nada sale sin que lo apruebes aquí." },
    conexiones: { title: "Conexiones", when: "Llega con add-glasses-mcp", icon: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
      text: "Conecta tu calendario, tus tareas u otros agentes por MCP. Ellos podrán pedirle cosas a Lente y Lente a ellos, siempre con tu permiso." },
    equipo: { title: "Equipo", when: "Planeado para después del hackathon", icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
      text: "Una memoria compartida con tu equipo: las notas y los compromisos de cada reunión, para todos los que estuvieron." },
    computadora: { title: "Modo computadora", when: "Llega con add-desktop-mode", icon: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
      text: "Usa Lente en Meet, Teams o Zoom sin el clip: una página en la computadora comparte el audio de la llamada." },
    nube: { title: "Hub en la nube", when: "Llega con add-cloud-hub", icon: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
      text: "El clip funcionará en cualquier lugar, con el hotspot de tu teléfono, sin depender de una computadora encendida. Emparejas el teléfono con un código." },
  };
  const drawer = $("drawer");
  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    $("menu-btn").setAttribute("aria-expanded", String(open));
    drawer.inert = !open;
    if (open) (drawer.querySelector('[aria-current="page"]') || drawer.querySelector("a")).focus({ focusVisible: false });
  }
  $("menu-btn").addEventListener("click", () => setMenu(true));
  $("scrim").addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") setMenu(false); });
  drawer.addEventListener("click", (ev) => { if (ev.target.closest("a")) setMenu(false); });

  function route() {
    const name = (location.hash || "#ahora").slice(1);
    const planned = PLANNED[name];
    const screen = planned ? "pronto" : TITLES[name] ? name : "ahora";
    document.body.dataset.screen = screen;
    for (const s of document.querySelectorAll(".screen")) s.classList.toggle("on", s.dataset.screen === screen);
    for (const a of drawer.querySelectorAll("[data-nav]")) a.toggleAttribute("aria-current", a.dataset.nav === name || (name === "" && a.dataset.nav === "ahora"));
    for (const a of drawer.querySelectorAll("[aria-current]")) a.setAttribute("aria-current", "page");
    $("screen-title").textContent = planned ? planned.title : TITLES[screen];
    if (planned) {
      $("soon-title").textContent = planned.title;
      $("soon-text").textContent = planned.text;
      $("soon-change").textContent = planned.when;
      $("soon-icon").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + planned.icon + "</svg>";
    }
    $("main").scrollTop = 0;
  }
  addEventListener("hashchange", route);
  route();
  $("status-row").addEventListener("click", () => { location.hash = "#dispositivos"; });

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
    $("voice-set").checked = on;
    if (on) {
      // Phones only allow audio after a tap: this one unlocks both kinds of voice.
      player.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      player.play().catch(() => {});
      say("Voz activada.", "high");
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

  // --- Settings: names, voice output, the testing switch
  $("me-all").addEventListener("change", () => post($("me-all").checked ? "/cues/all" : "/cues/addressed"));
  $("voice-set").addEventListener("change", () => setVoice($("voice-set").checked));
  const saveNames = (names) => fetch("/profile", { method: "POST", body: JSON.stringify({ names }) }).catch(() => {});
  function showNames(names) {
    const list = names && names.length ? names : [];
    $("me-names").textContent = list.length ? list.join(", ") : "sin definir";
    if (document.activeElement !== $("me-input")) $("me-input").value = list.join(", ");
    $("intro-say").textContent = "“Lente, soy " + (list[0] || "…") + "”";
    $("voice-hint").textContent = "Di “Lente, soy " + (list[0] || "…") + "” con el clip puesto";
  }
  $("me-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    saveNames($("me-input").value);
    $("me-input").blur();
    $("me").open = false;
  });

  // --- Meetings: start and end, notes of past ones, delete
  const MEETING_STATE = { running: "en curso", extracting: "sacando notas…", done: "", "too-short": "muy corta, sin notas", failed: "no se pudieron sacar notas" };
  $("meet-btn").addEventListener("click", () => {
    if (status.meeting) sendJson("/meeting/end");
    else { sendJson("/meeting/start", { title: $("meet-title").value }); $("meet-title").value = ""; }
  });
  $("cam-on").addEventListener("click", () => post("/mode/camera"));
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
    if (!b) return;
    const title = {};
    for (const s of b.sources) title[s.id] = (s.title || "Reunión sin título") + ", " + day(s.startedAt);
    if (!b.remembered) {
      const none = document.createElement("p"); none.className = "none";
      none.textContent = "Aún no recuerdo reuniones relacionadas; solo te dejo frases para empezar.";
      out.append(none);
    }
    for (const [kind, label] of BRIEF_SECTIONS) {
      const items = b.items.filter((i) => i.kind === kind);
      if (!items.length) continue;
      const h = document.createElement("div"); h.className = "sec"; h.textContent = label; out.append(h);
      const ul = document.createElement("ul");
      for (const it of items) {
        const li = document.createElement("li"); li.textContent = it.text;
        if (it.sources.length) { const from = document.createElement("small"); from.textContent = "de " + it.sources.map((id) => title[id] || id).join(" · "); li.append(from); }
        ul.append(li);
      }
      out.append(ul);
    }
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

  // --- Memory: questions asked and answered, the wearer's phrases, the glossary
  function showLanguage(l) {
    const terms = l ? l.glossary : [];
    const phrases = l && l.phrases ? l.phrases : [];
    const asked = l ? l.asked : 0;
    $("mem-tiles").hidden = !asked;
    $("mem-asked").textContent = asked || 0;
    $("mem-answered").textContent = l ? l.answered : 0;
    $("mem-phrases-box").hidden = !phrases.length;
    $("mem-terms-box").hidden = !terms.length;
    $("mem-empty").hidden = !!(asked || phrases.length || terms.length);
    const pbox = $("mem-phrases"); pbox.textContent = "";
    for (const ph of phrases) { const r = document.createElement("div"); r.className = "term"; const em = document.createElement("div"); em.textContent = "“" + ph + "”"; r.append(em); pbox.append(r); }
    const tbox = $("mem-terms"); tbox.textContent = "";
    for (const t of terms) {
      const el = document.createElement("div"); el.className = "term";
      const head = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = t.term;
      const n = document.createElement("span"); n.className = "n"; n.textContent = "×" + t.count;
      head.append(strong, n);
      const meaning = document.createElement("div"); meaning.textContent = t.meaning;
      el.append(head, meaning);
      if (t.example) { const ex = document.createElement("em"); ex.textContent = "“" + t.example + "”"; el.append(ex); }
      tbox.append(el);
    }
  }

  // --- Past meetings: one row each in Reuniones, the latest three in the menu
  function showPast(items) {
    const sorted = [...items].sort((a, b) => b.startedAt - a.startedAt);
    const box = $("past-list");
    box.textContent = "";
    box.hidden = !sorted.length;
    $("past-empty").hidden = !!sorted.length;
    for (const m of sorted) {
      const d = document.createElement("details"); d.id = "m-" + m.id;
      const s = document.createElement("summary");
      const rl = document.createElement("span"); rl.className = "rl"; rl.textContent = m.title || "Reunión sin título";
      const sm = document.createElement("small");
      sm.textContent = [day(m.startedAt) + " " + fmt(m.startedAt), m.turns + " turnos", MEETING_STATE[m.status]].filter(Boolean).join(" · ");
      rl.append(sm);
      s.append(rl);
      s.insertAdjacentHTML("beforeend", '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>');
      const pad = document.createElement("div"); pad.className = "pad m";
      if (m.notes) {
        if (m.notes.summary) { const p = document.createElement("p"); p.textContent = m.notes.summary; pad.append(p); }
        list(pad, "Decisiones", m.notes.decisions, (x) => x.text);
        list(pad, "Compromisos", m.notes.commitments, (c) => (c.owner === "you" ? "Tú" : c.owner) + ": " + c.what + (c.due ? " (" + c.due + ")" : ""));
        list(pad, "Pendientes", m.notes.openQuestions, (q) => q.text);
      } else { const p = document.createElement("p"); p.className = "when"; p.textContent = "Sin notas."; pad.append(p); }
      if (m.status !== "running") {
        const del = document.createElement("button"); del.type = "button"; del.className = "btn danger"; del.textContent = "Borrar";
        del.addEventListener("click", () => sendJson("/meetings/delete", { id: m.id }));
        pad.append(del);
      }
      d.append(s, pad);
      box.append(d);
    }
    const recent = $("recent-list");
    recent.textContent = "";
    $("recent-cap").hidden = !sorted.length;
    for (const m of sorted.slice(0, 3)) {
      const a = document.createElement("a"); a.href = "#reuniones"; a.className = "recent";
      const span = document.createElement("span"); span.textContent = m.title || "Reunión del " + day(m.startedAt);
      a.append(span);
      a.addEventListener("click", () => setTimeout(() => { const d = $("m-" + m.id); if (d) { d.open = true; d.scrollIntoView({ block: "start" }); } }, 0));
      recent.append(a);
    }
  }

  function asrNote(asr) {
    if (/^connecting/.test(asr)) return "Conectando la transcripción…";
    if (/^transcription closed/.test(asr)) return "Se cortó la transcripción. Reconectando…";
    if (/^transcription connection error/.test(asr)) return "No se pudo conectar la transcripción. Reintentando…";
    if (/^transcription error/.test(asr)) return "Error de transcripción: " + asr.replace(/^transcription error:\\s*/, "");
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
    const clipText = m.clip ? "Clip conectado" : "Sin clip";
    for (const id of ["dot", "menu-dot", "dev-dot", "intro-clip-dot"]) $(id).classList.toggle("on", m.clip);
    $("clip").textContent = m.clip ? "Clip" : "Sin clip";
    $("mode-text").textContent = m.clip ? "· " + (m.mode === "camera" ? "Audio y cámara" : "Solo audio") : "";
    $("menu-clip").textContent = clipText;
    $("dev-state").textContent = clipText;
    $("intro-clip").textContent = m.clip ? "Clip conectado" : "Esperando el clip…";
    $("dev-lost").textContent = m.audioLost || 0;
    $("dev-late").textContent = m.audioLate || 0;
    $("dev-help").hidden = m.clip;
    $("voice-id").textContent = m.wearer ? "Reconocida" : "Sin reconocer";
    $("intro-voice-dot").classList.toggle("on", !!m.wearer);
    $("intro-voice").textContent = m.wearer ? "Voz reconocida" : m.clip ? "Escuchando…" : "Conecta el clip primero";
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
        // The card matters more than wherever the wearer was: go back to Ahora.
        if ($("intro").hidden) { setMenu(false); if (document.body.dataset.screen !== "ahora") location.hash = "#ahora"; }
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
  $("voice-set").checked = voiceOn;

  // --- First-run introduction: five steps, each skippable, again from Ajustes.
  const STEPS = 5;
  let step = 1;
  function showStep(n) {
    step = n;
    for (const s of document.querySelectorAll(".step")) s.hidden = Number(s.dataset.step) !== n;
    [...$("intro-dots").children].forEach((d, i) => d.classList.toggle("on", i === n - 1));
    $("intro-back").hidden = n === 1;
    $("intro-next").textContent = n === STEPS ? "Empezar" : "Siguiente";
    if (n === 2) { $("intro-names").value = (status.names || []).join(", "); setTimeout(() => $("intro-names").focus(), 50); }
  }
  function openIntro() { $("intro").hidden = false; setMenu(false); showStep(1); }
  function closeIntro() { $("intro").hidden = true; store.set("lente-intro", "done"); location.hash = "#ahora"; }
  $("intro-next").addEventListener("click", () => {
    if (step === 2 && $("intro-names").value.trim()) saveNames($("intro-names").value);
    if (step === STEPS) closeIntro(); else showStep(step + 1);
  });
  $("intro-back").addEventListener("click", () => showStep(Math.max(1, step - 1)));
  $("intro-skip").addEventListener("click", closeIntro);
  $("intro-names").addEventListener("keydown", (ev) => { if (ev.key === "Enter") $("intro-next").click(); });
  $("intro-again").addEventListener("click", openIntro);
  if (store.get("lente-intro") !== "done") openIntro();
</script>
</body>
</html>`;
