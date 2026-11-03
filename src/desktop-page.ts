// The desktop page, served at /desktop: it captures a shared tab or window (its audio, mixed with the
// optional microphone, and its picture when the scene changes) and sends it to the hub as one more
// clip: protocol v2 over the WebSocket door. Pause and takeover come back as the clip's commands.
// Resampling, framing and scene detection are the tested modules; this file is the browser glue.

import { logoSvg } from "./brand.ts";
import { DESKTOP_CAPTURE_PAGE_SCRIPT } from "./desktop-capture.ts";
import { PHONE_AUDIO_PAGE_SCRIPT } from "./phone-audio.ts";
import { THEME_TOKENS } from "./theme.ts";

export const DESKTOP_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<title>Lente · Escritorio</title>
<style>
${THEME_TOKENS}
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 32px; background: var(--bg); color: var(--ink); font: 15px/1.45 var(--body); -webkit-font-smoothing: antialiased; }
  /* A macOS window: translucent toolbar, two panes, soft shadow. */
  .window { width: min(1040px, 100%); border-radius: 14px; overflow: hidden; background: var(--surface); box-shadow: 0 0 0 .5px var(--glass-edge), 0 24px 70px rgba(10, 15, 40, .18), 0 4px 14px rgba(10, 15, 40, .08); }
  @media (prefers-color-scheme: dark) { .window { box-shadow: 0 0 0 1px #38383A, 0 24px 70px rgba(0, 0, 0, .7); } }
  .toolbar { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 18px; background: var(--glass); -webkit-backdrop-filter: blur(20px) saturate(1.8); backdrop-filter: blur(20px) saturate(1.8); border-bottom: 1px solid var(--line); }
  .toolbar svg { width: 24px; height: 24px; color: var(--ink); flex: none; }
  .toolbar h1 { margin: 0; font: 700 15px/1 var(--display); }
  .toolbar span { color: var(--muted); font-size: 13px; }
  .toolbar .grow { flex: 1; }
  .panes { display: grid; grid-template-columns: 340px minmax(0, 1fr); min-height: 520px; }
  .side { padding: 22px 20px; background: var(--bg); border-right: 1px solid var(--line); display: grid; align-content: start; gap: 16px; }
  .main { padding: 28px 32px; display: grid; align-content: start; gap: 16px; }
  .cap { font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--muted); margin: 0 4px; }
  .card { background: var(--surface); border-radius: 14px; padding: 16px; display: grid; gap: 14px; box-shadow: var(--shadow); }
  @media (prefers-color-scheme: dark) { .main .card { background: var(--raised); box-shadow: none; } }
  #state { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; }
  #dot { width: 12px; height: 12px; border-radius: 50%; background: var(--muted); flex: none; }
  body[data-state="capturing"] #dot { background: var(--live-fill); box-shadow: 0 0 0 4px color-mix(in srgb, var(--live-fill) 22%, transparent); animation: pulse 1.4s infinite; }
  body[data-state="capturing"] #state-text { color: var(--live); }
  @keyframes pulse { 50% { opacity: .4; } }
  label { display: flex; gap: 12px; align-items: center; justify-content: space-between; font-weight: 500; cursor: pointer; }
  #use-mic { appearance: none; -webkit-appearance: none; flex: none; width: 38px; height: 22px; margin: 0; border-radius: 999px; background: var(--track); box-shadow: inset 0 0 0 1px var(--line); position: relative; cursor: pointer; transition: background-color .2s; }
  #use-mic::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .3s var(--spring); }
  #use-mic:checked { background: var(--accent-fill); box-shadow: none; }
  #use-mic:checked::after { transform: translateX(16px); }
  #use-mic:disabled { opacity: .5; }
  button { font: inherit; font-weight: 600; min-height: 40px; border: 0; border-radius: 10px; padding: 0 18px; background: var(--accent-fill); color: var(--on-accent); cursor: pointer; transition: scale .3s var(--spring); }
  button:active { scale: .97; }
  body[data-state="capturing"] button, body[data-state="paused"] button { background: var(--raised); color: var(--ink); }
  button:disabled { opacity: .45; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2.5px solid var(--accent); outline-offset: 2px; }
  #note { color: var(--muted); margin: 0; min-height: 1.4em; font-size: 13px; }
  .privacy { margin: 0; font-size: 13px; color: var(--muted); }
  #cue-card { padding: 22px 24px; gap: 10px; justify-items: start; }
  #cue-label { padding: 4px 9px; border-radius: 8px; background: var(--tag); color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .08em; }
  #cue-text { font: 700 30px/1.15 var(--display); letter-spacing: -.02em; text-wrap: balance; }
  .waiting { color: var(--muted); font-size: 15px; }
  #heard { font-size: 17px; line-height: 1.45; color: var(--ink); }
  #cue-card:not([hidden]) + .waiting { display: none; }
  @media (max-width: 760px) { body { padding: 0; } .window { border-radius: 0; } .panes { grid-template-columns: minmax(0, 1fr); } .side { border-right: 0; border-bottom: 1px solid var(--line); } }
  @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
</style></head>
<body data-state="idle">
<main class="window">
  <div class="toolbar">${logoSvg(false)}<h1>Lente</h1><span>Escritorio</span><span class="grow"></span><span>Una pestaña o ventana, como si fuera el clip</span></div>
  <div class="panes">
    <section class="side" aria-label="Captura">
      <p class="cap">Captura</p>
      <div class="card">
        <div id="state"><span id="dot"></span><span id="state-text">Sin compartir</span></div>
        <label>Incluir mi micrófono <input type="checkbox" id="use-mic"></label>
        <button id="share">Compartir una pestaña</button>
        <p id="note"></p>
      </div>
      <p class="privacy">El navegador pide permiso antes de compartir y Lente muestra siempre que está escuchando. Se guarda el texto; el audio y las fotos, solo con «Guardar audio» y «Guardar fotos» activados, cifrados.</p>
    </section>
    <section class="main" aria-label="En vivo">
      <p class="cap">Qué decir</p>
      <div class="card" id="cue-card" hidden>
        <div id="cue-label">DILO</div>
        <div id="cue-text"></div>
      </div>
      <div class="card waiting">Cuando te pregunten algo en la llamada, aquí aparece qué decir.</div>
      <p class="cap">Lo último que se escuchó</p>
      <div class="card"><div id="heard">Lo último que se escuchó aparecerá aquí.</div></div>
    </section>
  </div>
</main>
<script>
(() => {
  ${PHONE_AUDIO_PAGE_SCRIPT}
  ${DESKTOP_CAPTURE_PAGE_SCRIPT}
  const FW = "desktop-page-1";
  const SCENE_CHECK_MS = 1000, PICTURE_WIDTH = 1024;
  const $ = (id) => document.getElementById(id);
  const d = { ws: null, display: null, mic: null, ctx: null, node: null, resampler: null, framer: null, seq: 0, t0: 0, listening: false, timer: 0, scenes: new SceneDetector() };
  const secureOk = window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  function render() {
    const on = !!d.ws && !!d.display;
    const state = !on ? "idle" : d.listening ? "capturing" : "paused";
    document.body.dataset.state = state;
    $("state-text").textContent = state === "capturing" ? "Escuchando esta pestaña" : state === "paused" ? "En pausa: no se envía audio" : "Sin compartir";
    $("share").textContent = on ? "Dejar de compartir" : "Compartir una pestaña";
    $("share").disabled = !secureOk;
    $("use-mic").disabled = on;
  }
  function note(text) { $("note").textContent = text || ""; }

  function stop(why) {
    clearInterval(d.timer);
    if (d.node) { d.node.port.onmessage = null; d.node.disconnect(); d.node = null; }
    if (d.ctx) { d.ctx.close().catch(() => {}); d.ctx = null; }
    for (const s of [d.display, d.mic]) if (s) for (const t of s.getTracks()) t.stop();
    d.display = d.mic = null;
    if (d.ws) { const w = d.ws; d.ws = null; w.onclose = null; try { w.close(); } catch {} }
    d.listening = false;
    note(why || "");
    render();
  }

  function openSocket() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/device");
      ws.binaryType = "arraybuffer";
      ws.onopen = () => { ws.send(phoneHello(FW, "lente-desktop", true)); d.ws = ws; resolve(); };
      ws.onerror = () => reject(new Error("No se pudo conectar con la computadora de Lente."));
      ws.onmessage = (ev) => { for (const b of new Uint8Array(ev.data)) onHub(String.fromCharCode(b)); };
      ws.onclose = () => { if (d.ws === ws) stop("Se perdió la conexión con Lente."); };
    });
  }
  // The hub's commands are the clip's: M listen, m pause, P picture now, T another device took over.
  function onHub(cmd) {
    if (cmd === "M") { d.listening = !!d.display; if (d.display) d.scenes.reset(); }
    else if (cmd === "m") d.listening = false;
    else if (cmd === "P") sendPicture();
    else if (cmd === "T") return stop("Otro dispositivo tomó el control: esta pestaña dejó de enviarse.");
    render();
  }

  async function startAudio() {
    const ctx = new AudioContext();
    d.ctx = ctx;
    const code = "class Tap extends AudioWorkletProcessor { process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('lente-tap', Tap);";
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    // One mono input: the graph sums the tab and the microphone and downmixes a stereo tab for us.
    d.node = new AudioWorkletNode(ctx, "lente-tap", { numberOfInputs: 1, channelCount: 1, channelCountMode: "explicit" });
    d.resampler = new PcmResampler(ctx.sampleRate);
    d.framer = new PcmFramer();
    d.seq = 0; d.t0 = performance.now();
    d.node.port.onmessage = (ev) => {
      if (!d.listening || !d.ws || d.ws.readyState !== 1) return;
      for (const f of d.framer.push(d.resampler.push(ev.data))) {
        d.ws.send(phoneAudioFrame(d.seq, Math.round(performance.now() - d.t0), f));
        d.seq++;
      }
    };
    for (const s of [d.display, d.mic]) if (s && s.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(d.node);
  }

  // --- Pictures: one per new scene, and one on request.
  const video = document.createElement("video");
  video.muted = true;
  const thumb = document.createElement("canvas");
  thumb.width = SCENE_THUMB_WIDTH; thumb.height = SCENE_THUMB_HEIGHT;
  async function sendPicture() {
    if (!d.ws || d.ws.readyState !== 1 || !video.videoWidth) return;
    const scale = Math.min(1, PICTURE_WIDTH / video.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
    if (blob && d.ws && d.ws.readyState === 1) d.ws.send(uplinkFrame("J", new Uint8Array(await blob.arrayBuffer())));
  }
  function checkScene() {
    if (!d.listening || !video.videoWidth) return;
    const g = thumb.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, 0, 0, SCENE_THUMB_WIDTH, SCENE_THUMB_HEIGHT);
    if (d.scenes.changed(toLuma(g.getImageData(0, 0, SCENE_THUMB_WIDTH, SCENE_THUMB_HEIGHT).data))) sendPicture();
  }

  async function start() {
    note("");
    try {
      d.display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!d.display.getAudioTracks().length) note("Esa selección no trae audio: elige una pestaña y marca “Compartir audio de la pestaña”.");
      if ($("use-mic").checked) d.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      await openSocket();
      await startAudio();
      video.srcObject = d.display;
      await video.play();
      d.scenes.reset();
      d.timer = setInterval(checkScene, SCENE_CHECK_MS);
      // Sharing stopped from the browser's own bar: let go and tell the hub by closing.
      for (const t of d.display.getVideoTracks()) t.onended = () => stop("Dejaste de compartir.");
    } catch (e) {
      stop(e && e.name === "NotAllowedError" ? "El navegador no dio permiso." : (e && e.message) || "No se pudo empezar a capturar.");
      return;
    }
    render();
  }
  $("share").addEventListener("click", () => { if (d.display) stop(""); else start(); });

  // --- The panel: what the hub says, from the same event stream as the phone.
  const es = new EventSource("/events");
  es.onmessage = (msg) => {
    const m = JSON.parse(msg.data);
    if (m.kind === "turn") $("heard").textContent = (m.speaker ? m.speaker + ": " : "") + m.text;
    else if (m.kind === "partial") $("heard").textContent = m.text;
    else if (m.kind === "cue" && !m.photo) {
      $("cue-card").hidden = false;
      $("cue-label").textContent = /dilo/i.test(m.label) ? "DILO" : m.label;
      $("cue-text").textContent = m.text;
    }
  };
  if (!secureOk) note("Requiere HTTPS o localhost: el navegador no comparte pestañas por HTTP.");
  render();
  window.__lenteDesktop = d;
})();
</script>
</body></html>`;
