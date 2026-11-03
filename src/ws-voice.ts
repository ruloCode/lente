// The hub's WebSocket door for a voice session (add-voice-mode): binary messages carry PCM16 mono
// audio at 16 kHz from the phone, text messages carry its JSON controls, and the hub's events go
// back as JSON text. The framing is in src/websocket.ts; admission is the same as `/device`.

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { OPCODE, WsFrameParser, acceptKey, encodeFrame } from "./websocket.ts";

/** Path a voice session upgrades on. */
export const VOICE_WS_PATH = "/voice";

export interface VoiceSocket {
  onText(listener: (text: string) => void): void;
  onAudio(listener: (pcm: Buffer) => void): void;
  onClose(listener: () => void): void;
  send(event: object): void;
  close(): void;
  readonly closed: boolean;
}

/**
 * Completes the handshake and returns the session's socket, or undefined (after answering 400)
 * when the request is not a valid WebSocket upgrade.
 */
export function acceptVoice(req: IncomingMessage, raw: Duplex, head: Buffer): VoiceSocket | undefined {
  const key = req.headers["sec-websocket-key"];
  if (req.headers.upgrade?.toLowerCase() !== "websocket" || typeof key !== "string" || req.headers["sec-websocket-version"] !== "13") {
    raw.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return undefined;
  }
  raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
  const parser = new WsFrameParser();
  const text: ((t: string) => void)[] = [];
  const audio: ((pcm: Buffer) => void)[] = [];
  const closing: (() => void)[] = [];
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    for (const l of closing) l();
  };
  const socket: VoiceSocket = {
    onText: (l) => void text.push(l),
    onAudio: (l) => void audio.push(l),
    onClose: (l) => void closing.push(l),
    send(event) {
      if (!closed && raw.writable) raw.write(encodeFrame(OPCODE.text, JSON.stringify(event)));
    },
    close() {
      if (closed) return;
      if (raw.writable) raw.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xe8])));
      finish();
    },
    get closed() {
      return closed;
    },
  };
  const onBytes = (chunk: Buffer) => {
    try {
      for (const m of parser.push(chunk)) {
        if (m.opcode === OPCODE.binary) for (const l of audio) l(m.payload);
        else if (m.opcode === OPCODE.text) for (const l of text) l(m.payload.toString("utf8"));
        else if (m.opcode === OPCODE.ping) raw.write(encodeFrame(OPCODE.pong, m.payload));
        else if (m.opcode === OPCODE.close) return void socket.close();
      }
    } catch {
      raw.destroy();
    }
  };
  raw.on("data", onBytes);
  raw.on("close", finish);
  raw.on("error", () => raw.destroy());
  if (head.length) setImmediate(() => onBytes(head));
  return socket;
}
