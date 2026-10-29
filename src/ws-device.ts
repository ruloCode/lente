// The hub's WebSocket door for devices that are not the clip (the phone page, the desktop app).
// A binary message carries clip protocol v2 uplink bytes, exactly what the clip sends over TCP;
// the hub's single-byte commands go back as binary messages. The framing is in src/websocket.ts.

import type { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { OPCODE, WsFrameParser, acceptKey, encodeFrame } from "./websocket.ts";

/** Path a device upgrades on. */
export const DEVICE_WS_PATH = "/device";

/**
 * Completes the handshake on an upgrade request and returns the device as a duplex stream:
 * reading yields the protocol bytes of each binary message, writing sends them as binary messages.
 * Returns undefined (after answering 400) when the request is not a valid WebSocket upgrade.
 */
export function acceptDevice(req: IncomingMessage, raw: Duplex, head: Buffer): Duplex | undefined {
  const key = req.headers["sec-websocket-key"];
  if (req.headers.upgrade?.toLowerCase() !== "websocket" || typeof key !== "string" || req.headers["sec-websocket-version"] !== "13") {
    raw.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return undefined;
  }
  raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);

  const parser = new WsFrameParser();
  const device = new Duplex({
    read() {},
    write(chunk: Buffer | string, _encoding, done) {
      raw.write(encodeFrame(OPCODE.binary, typeof chunk === "string" ? Buffer.from(chunk, "latin1") : chunk), () => done());
    },
    final(done) {
      raw.write(encodeFrame(OPCODE.close, Buffer.alloc(0)), () => done());
      raw.end();
    },
    destroy(error, done) {
      raw.destroy();
      done(error);
    },
  });
  const onBytes = (chunk: Buffer) => {
    try {
      for (const message of parser.push(chunk)) {
        if (message.opcode === OPCODE.binary) device.push(message.payload);
        else if (message.opcode === OPCODE.ping) raw.write(encodeFrame(OPCODE.pong, message.payload));
        else if (message.opcode === OPCODE.close) {
          device.push(null);
          return void device.end();
        }
        // Text and pong messages carry nothing the hub uses.
      }
    } catch (error) {
      device.destroy(error as Error);
    }
  };
  raw.on("data", onBytes);
  raw.on("close", () => device.destroy());
  raw.on("error", (error) => device.destroy(error));
  if (head.length) onBytes(head);
  return device;
}
