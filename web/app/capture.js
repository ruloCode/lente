// Recording with this computer: the microphone, the microphone and the camera, or a meeting tab or
// window, sent to the hub as one more clip (protocol v2 over /device) with the /desktop pipeline,
// which the hub serves as a module built from its tested page scripts.

import { PcmFramer, PcmResampler, SCENE_THUMB_HEIGHT, SCENE_THUMB_WIDTH, SceneDetector, phoneAudioFrame, phoneHello, toLuma, uplinkFrame } from "./lib/capture-pipeline.js";

export const SOURCES = [
  { key: "mic", label: "Micrófono", hint: "Lo que oye esta computadora", icon: "mic" },
  { key: "camera", label: "Micrófono y cámara", hint: "Lente puede mirar cuando lo pidas", icon: "camera" },
  { key: "tab", label: "Pestaña o ventana de una reunión", hint: "Meet, Zoom o Teams en el navegador, más tu micrófono", icon: "screen" },
];

const FW = "web-app-1";
const SCENE_CHECK_MS = 1000;
const PICTURE_WIDTH = 1024;

/** Whether this browser can capture at all (HTTPS or localhost, and the media APIs). */
export function captureSupport() {
  const media = navigator.mediaDevices;
  return { secure: window.isSecureContext, mic: Boolean(media?.getUserMedia), tab: Boolean(media?.getDisplayMedia) };
}

/** One capture at a time; `onChange(state)` hears "capturing", "paused", "stopped" with a note. */
export class ComputerCapture {
  constructor(onChange) {
    this.onChange = onChange;
    this.ws = null;
    this.streams = [];
    this.ctx = null;
    this.node = null;
    this.listening = false;
    this.timer = 0;
    this.scenes = new SceneDetector();
    this.video = null;
    this.source = "";
  }

  get active() {
    return Boolean(this.ws);
  }

  /** Asks the browser for the source, connects as a clip and starts sending once the hub says listen. */
  async start(source) {
    if (this.active) this.stop("");
    this.source = source;
    const media = navigator.mediaDevices;
    try {
      if (source === "tab") {
        const display = await media.getDisplayMedia({ video: true, audio: true });
        this.streams.push(display);
        for (const t of display.getVideoTracks()) t.onended = () => this.stop("Dejaste de compartir.");
        const mic = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);
        if (mic) this.streams.push(mic);
        if (!display.getAudioTracks().length) this.note = "Esa selección no trae audio: elige una pestaña y marca «Compartir audio de la pestaña».";
      } else {
        const stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: source === "camera" ? { width: 1280, height: 720 } : false });
        this.streams.push(stream);
      }
      await this.openSocket(source !== "mic");
      await this.startAudio();
      const pictures = this.streams.find((s) => s.getVideoTracks().length);
      if (pictures) await this.startPictures(pictures);
    } catch (error) {
      this.stop(error?.name === "NotAllowedError" ? "El navegador no dio permiso." : error?.message || "No se pudo empezar a capturar.");
      throw error;
    }
    this.onChange("capturing", this.note ?? "");
  }

  openSocket(camera) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss://" : "ws://"}${location.host}/device`);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        ws.send(phoneHello(FW, "lente-desktop", camera));
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => reject(new Error("No se pudo conectar con el hub de Lente."));
      ws.onmessage = (ev) => {
        for (const b of new Uint8Array(ev.data)) this.onHub(String.fromCharCode(b));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.stop("Se perdió la conexión con el hub.");
      };
    });
  }

  /** The hub's commands are the clip's: M listen, m pause, P picture now, T another device took over. */
  onHub(cmd) {
    if (cmd === "M") {
      this.listening = true;
      this.scenes.reset();
      this.onChange("capturing", "");
    } else if (cmd === "m") {
      this.listening = false;
      this.onChange("paused", "");
    } else if (cmd === "P") void this.sendPicture();
    else if (cmd === "T") this.stop("Otro dispositivo tomó el control.");
  }

  async startAudio() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule("/app/tap-worklet.js");
    // One mono input: the graph sums the tab and the microphone and downmixes stereo.
    this.node = new AudioWorkletNode(ctx, "lente-tap", { numberOfInputs: 1, channelCount: 1, channelCountMode: "explicit" });
    const resampler = new PcmResampler(ctx.sampleRate);
    const framer = new PcmFramer();
    let seq = 0;
    const t0 = performance.now();
    this.node.port.onmessage = (ev) => {
      if (!this.listening || !this.ws || this.ws.readyState !== 1) return;
      for (const f of framer.push(resampler.push(ev.data))) this.ws.send(phoneAudioFrame(seq++, Math.round(performance.now() - t0), f));
    };
    for (const s of this.streams) if (s.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(this.node);
  }

  async startPictures(stream) {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
    await this.video.play();
    this.scenes.reset();
    // A meeting tab sends a picture when its scene changes; a camera only when asked (Mirar).
    if (this.source === "tab") this.timer = setInterval(() => this.checkScene(), SCENE_CHECK_MS);
  }

  checkScene() {
    const v = this.video;
    if (!this.listening || !v?.videoWidth) return;
    const c = (this.thumb ??= Object.assign(document.createElement("canvas"), { width: SCENE_THUMB_WIDTH, height: SCENE_THUMB_HEIGHT }));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(v, 0, 0, SCENE_THUMB_WIDTH, SCENE_THUMB_HEIGHT);
    if (this.scenes.changed(toLuma(g.getImageData(0, 0, SCENE_THUMB_WIDTH, SCENE_THUMB_HEIGHT).data))) void this.sendPicture();
  }

  async sendPicture() {
    const v = this.video;
    if (!this.ws || this.ws.readyState !== 1 || !v?.videoWidth) return;
    const scale = Math.min(1, PICTURE_WIDTH / v.videoWidth);
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(v.videoWidth * scale), height: Math.round(v.videoHeight * scale) });
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
    if (blob && this.ws?.readyState === 1) this.ws.send(uplinkFrame("J", new Uint8Array(await blob.arrayBuffer())));
  }

  stop(why = "") {
    clearInterval(this.timer);
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    for (const s of this.streams) for (const t of s.getTracks()) t.stop();
    this.streams = [];
    if (this.video) this.video.srcObject = null;
    this.video = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
    this.listening = false;
    this.note = "";
    this.onChange("stopped", why);
  }
}
