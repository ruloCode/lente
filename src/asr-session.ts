// One live Muse Voice Transcribe stream in DIARIZATION mode. Reconnects on its
// own until stopped, since sessions end at 60 minutes or on backend hiccups.

import { META_REALTIME_URL, TRANSCRIBE_MODEL } from "./providers.ts";

export interface AsrTurn {
  turnId: string;
  text: string;
  speaker?: string;
}

export interface AsrHandlers {
  onTurn(turn: AsrTurn): void;
  /** Speaker labels may arrive after the turn they belong to. */
  onSpeaker(turnId: string, speaker: string): void;
  onPartial(text: string): void;
  onStatus(status: string): void;
}

interface ServerMessage {
  type?: string;
  sessionId?: string;
  turnId?: string | number;
  transcript?: string;
  final?: boolean;
  label?: string;
  message?: string;
}

const MAX_QUEUED_FRAMES = 25;

/** Turn ids arrive as numbers starting at 0, so a truthiness check would drop the first turn. */
export function turnIdOf(msg: { turnId?: string | number | null }): string | undefined {
  return msg.turnId === undefined || msg.turnId === null ? undefined : String(msg.turnId);
}

export class AsrSession {
  private ws: WebSocket | undefined;
  private ready = false;
  private stopped = false;
  private queue: Buffer[] = [];
  private currentTurn: string | undefined;
  private speakerOf = new Map<string, string>();
  private key: string;
  private handlers: AsrHandlers;
  private languages: string[];

  constructor(key: string, handlers: AsrHandlers, languages = ["English", "Spanish"]) {
    this.key = key;
    this.handlers = handlers;
    this.languages = languages;
  }

  start(): void {
    this.ready = false;
    const ws = new WebSocket(META_REALTIME_URL);
    this.ws = ws;
    ws.addEventListener("open", () => {
      // Auth goes in the first text frame, not in an HTTP header.
      ws.send(
        JSON.stringify({
          authorization: { accessToken: `Bearer ${this.key}` },
          audioEncoding: "PCM_16KHZ",
          model: TRANSCRIBE_MODEL,
          mode: "DIARIZATION",
          languageBias: this.languages,
          keywords: ["Lente", "Muse Spark", "Meta"],
        }),
      );
    });
    ws.addEventListener("message", (event) => this.onMessage(String(event.data)));
    ws.addEventListener("close", (event) => {
      this.ready = false;
      // A stopped session closing late must not overwrite the status of the one that replaced it.
      if (this.stopped || this.ws !== ws) return;
      this.handlers.onStatus(`transcription closed (${event.code}${event.reason ? ` ${event.reason}` : ""})`);
      // 1008 means bad config or pacing: retrying as-is won't help quickly, so back off.
      const delay = event.code === 1013 || event.code === 1008 ? 5000 : 1000;
      setTimeout(() => !this.stopped && this.start(), delay);
    });
    ws.addEventListener("error", () => this.handlers.onStatus("transcription connection error"));
  }

  send(pcm: Buffer): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
      return;
    }
    this.queue.push(pcm);
    if (this.queue.length > MAX_QUEUED_FRAMES) this.queue.shift();
  }

  stop(): void {
    this.stopped = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "endStream" }));
      const ws = this.ws;
      setTimeout(() => ws.close(), 3000);
    }
  }

  private onMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (!msg.type && msg.sessionId) {
      this.ready = true;
      this.handlers.onStatus("listening");
      for (const frame of this.queue.splice(0)) this.ws?.send(frame);
      return;
    }
    const turnId = turnIdOf(msg);
    switch (msg.type) {
      case "speechStart":
        this.currentTurn = turnId;
        break;
      case "transcript":
        if (!msg.final && msg.transcript) this.handlers.onPartial(msg.transcript);
        break;
      case "speaker": {
        const forTurn = turnId ?? this.currentTurn;
        if (forTurn === undefined || !msg.label) break;
        this.speakerOf.set(forTurn, msg.label);
        this.handlers.onSpeaker(forTurn, msg.label);
        break;
      }
      case "speechComplete":
        if (turnId !== undefined && msg.transcript?.trim()) {
          this.handlers.onTurn({ turnId, text: msg.transcript.trim(), speaker: this.speakerOf.get(turnId) });
        }
        break;
      case "error":
        this.handlers.onStatus(`transcription error: ${msg.message ?? "unknown"}`);
        break;
    }
  }
}
