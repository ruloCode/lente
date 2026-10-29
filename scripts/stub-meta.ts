// A stand-in for the Meta API, for the CI smoke test: no key, no network, same wire formats as
// the real one (docs/kb/meta-api.md). Realtime transcription hears one scripted question once
// enough audio has arrived, whatever the audio is; Spark answers with a fixed streamed line.

import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { OPCODE, WsFrameParser, acceptKey, encodeFrame } from "../src/websocket.ts";

export const STUB_QUESTION = "Rulo, can we ship the beta on Friday?";
export const STUB_REPLY = "Yes, Friday works if QA signs off Thursday.";
const BYTES_PER_MS = 32; // 16 kHz PCM16 mono
const SPEECH_START_MS = 400;
const SPEECH_END_MS = 2400;

function sse(res: import("node:http").ServerResponse, events: object[]): void {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const e of events) res.write(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end("data: [DONE]\n\n");
}

/** One realtime session: hello, then speechStart → speaker → speechComplete as the audio passes the marks. */
function transcribe(socket: Duplex): void {
  const parser = new WsFrameParser();
  const send = (msg: object) => socket.write(encodeFrame(OPCODE.text, JSON.stringify(msg)));
  let configured = false;
  let processedMs = 0;
  let stage = 0;
  socket.on("data", (chunk: Buffer) => {
    let messages;
    try {
      messages = parser.push(chunk);
    } catch {
      return void socket.destroy();
    }
    for (const m of messages) {
      if (m.opcode === OPCODE.close) return void socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xe8])));
      if (m.opcode === OPCODE.ping) socket.write(encodeFrame(OPCODE.pong, m.payload));
      if (m.opcode === OPCODE.text) {
        const msg = JSON.parse(m.payload.toString()) as { authorization?: unknown; type?: string };
        if (!configured) {
          if (!msg.authorization) return void socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xf0])));
          configured = true;
          send({ sessionId: "stub-session" });
        } else if (msg.type === "endStream") socket.end(encodeFrame(OPCODE.close, Buffer.from([0x03, 0xe8])));
      }
      if (m.opcode === OPCODE.binary && configured) {
        processedMs += m.payload.length / BYTES_PER_MS;
        if (stage === 0 && processedMs >= SPEECH_START_MS) {
          stage = 1;
          send({ type: "speechStart", turnId: 0, audioProcessedMs: SPEECH_START_MS });
          send({ type: "speaker", turnId: 0, label: "B", audioProcessedMs: processedMs });
          send({ type: "transcript", turnId: 0, transcript: "Rulo, can we", final: false, audioProcessedMs: processedMs });
        } else if (stage === 1 && processedMs >= SPEECH_END_MS) {
          stage = 2;
          send({ type: "speechComplete", turnId: 0, transcript: STUB_QUESTION, audioProcessedMs: SPEECH_END_MS });
        }
      }
    }
  });
  socket.on("error", () => {});
}

export function startStubMeta(): Promise<{ server: Server; port: number; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/v1/responses") {
        const usage = { input_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens: 12 };
        sse(res, [
          { type: "response.created" },
          { type: "response.output_text.delta", delta: STUB_REPLY.slice(0, 12) },
          { type: "response.output_text.delta", delta: STUB_REPLY.slice(12) },
          { type: "response.completed", response: { usage } },
        ]);
      } else if (req.url === "/v1/chat/completions") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "no" } }], usage: { prompt_tokens: 50, completion_tokens: 1 } }));
      } else res.writeHead(404).end();
    });
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex) => {
    requests.push(`UPGRADE ${req.url}`);
    const key = req.headers["sec-websocket-key"];
    if (req.url !== "/v1/asr/realtime" || typeof key !== "string") return void socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    transcribe(socket);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, requests })));
}
