// The desktop page, served at /desktop: it captures a shared tab or window (its audio, mixed with the
// optional microphone, and its picture when the scene changes) and sends it to the hub as one more
// clip: protocol v2 over the WebSocket door. Pause and takeover come back as the clip's commands.
// Resampling, framing and scene detection are the tested modules; this file is the browser glue.

import { DESKTOP_CAPTURE_PAGE_SCRIPT } from "./desktop-capture.ts";
import { PHONE_AUDIO_PAGE_SCRIPT } from "./phone-audio.ts";

export const DESKTOP_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lente · Escritorio</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f5f4; --fg: #1c1c1e; --card: #fff; --mute: #6b6b70; --rec: #d92d20; --ok: #12805c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111113; --fg: #f2f2f3; --card: #1c1c1f; --mute: #9a9aa2; } }
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: start center; min-height: 100dvh; }
  main { width: min(440px, 100%); box-sizing: border-box; padding: 20px; display: grid; gap: 14px; }
  .card { background: var(--card); border-radius: 20px; padding: 16px; display: grid; gap: 10px; }
  h1 { font-size: 20px; margin: 0; }
  #state { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  #dot { width: 14px; height: 14px; border-radius: 50%; background: var(--mute); }
  body[data-state="capturing"] #dot { background: var(--rec); animation: pulse 1.4s infinite; }
  body[data-state="paused"] #dot { background: var(--ok); }
  @keyframes pulse { 50% { opacity: .35; } }
  label { display: flex; gap: 8px; align-items: center; color: var(--mute); }
  button { font: inherit; min-height: 48px; border: 0; border-radius: 24px; padding: 0 20px; background: var(--fg); color: var(--bg); cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  #note { color: var(--mute); margin: 0; min-height: 1.4em; }
  #cue-label { font-size: 12px; letter-spacing: .08em; color: var(--mute); }
  #cue-text { font-size: 22px; font-weight: 600; }
  #heard { color: var(--mute); }
</style></head>
<body data-state="idle">
<main>
  <h1>Lente · Escritorio</h1>
  <div class="card">
    <div id="state"><span id="dot"></span><span id="state-text">Sin compartir</span></div>
    <label><input type="checkbox" id="use-mic"> Incluir mi micrófono</label>
    <button id="share">Compartir una pestaña</button>
    <p id="note"></p>
  </div>
  <div class="card" id="cue-card" hidden>
    <div id="cue-label">DILO</div>
    <div id="cue-text"></div>
  </div>
  <div class="card"><div id="heard">Lo último que se escuchó aparecerá aquí.</div></div>
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
