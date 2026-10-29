// WebSocket framing (RFC 6455), dependency-free. Pure: the handshake key, frame encoding, and a
// parser that turns bytes into whole messages. Sockets and the HTTP upgrade stay with the caller
// (the stub Meta API in scripts/stub-meta.ts today; the hub's phone and desktop ingest next).

import { createHash } from "node:crypto";

const HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const OPCODE = { continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa } as const;

/** Largest message accepted, in bytes: a phone photo fits with room to spare. */
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/** The `Sec-WebSocket-Accept` value for a client's `Sec-WebSocket-Key`. */
export function acceptKey(clientKey: string): string {
  return createHash("sha1").update(clientKey + HANDSHAKE_GUID).digest("base64");
}

/** One unfragmented frame. Servers send unmasked; a client must pass a 4-byte `mask`. */
export function encodeFrame(opcode: number, payload: Buffer | string, mask?: Buffer): Buffer {
  const body = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const n = body.length;
  const lengthBytes = n < 126 ? 0 : n < 65536 ? 2 : 8;
  const head = Buffer.alloc(2 + lengthBytes + (mask ? 4 : 0));
  head[0] = 0x80 | opcode;
  head[1] = (mask ? 0x80 : 0) | (n < 126 ? n : n < 65536 ? 126 : 127);
  if (lengthBytes === 2) head.writeUInt16BE(n, 2);
  if (lengthBytes === 8) head.writeBigUInt64BE(BigInt(n), 2);
  if (!mask) return Buffer.concat([head, body]);
  mask.copy(head, 2 + lengthBytes);
  const masked = Buffer.alloc(n);
  for (let i = 0; i < n; i++) masked[i] = body[i] ^ mask[i % 4];
  return Buffer.concat([head, masked]);
}

export interface WsMessage {
  opcode: number;
  payload: Buffer;
}

/**
 * Feed it bytes as they arrive; it returns the messages that completed. Fragmented messages are
 * joined; control frames (ping, pong, close) come out on their own, even between fragments.
 * Throws on a malformed stream or a message over MAX_MESSAGE_BYTES, so the caller can close.
 */
export class WsFrameParser {
  private buffer: Buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  private fragmentBytes = 0;

  push(chunk: Buffer): WsMessage[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const out: WsMessage[] = [];
    for (;;) {
      if (this.buffer.length < 2) break;
      const fin = (this.buffer[0] & 0x80) !== 0;
      const opcode = this.buffer[0] & 0x0f;
      const masked = (this.buffer[1] & 0x80) !== 0;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) break;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) break;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE_BYTES)) throw new Error(`WebSocket frame of ${big} bytes is over the ${MAX_MESSAGE_BYTES}-byte limit`);
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_MESSAGE_BYTES) throw new Error(`WebSocket frame of ${length} bytes is over the ${MAX_MESSAGE_BYTES}-byte limit`);
      const maskAt = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) break;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      if (masked) for (let i = 0; i < length; i++) payload[i] ^= this.buffer[maskAt + (i % 4)];
      this.buffer = this.buffer.subarray(offset + length);

      if (opcode >= 0x8) {
        if (!fin || length > 125) throw new Error(`WebSocket control frame ${opcode} is fragmented or over 125 bytes`);
        out.push({ opcode, payload });
      } else if (opcode === OPCODE.continuation) {
        if (!this.fragments.length) throw new Error("WebSocket continuation frame without a message to continue");
        this.addFragment(payload);
        if (fin) out.push(this.takeMessage());
      } else if (opcode === OPCODE.text || opcode === OPCODE.binary) {
        if (this.fragments.length) throw new Error("WebSocket message started before the previous one finished");
        if (fin) out.push({ opcode, payload });
        else {
          this.fragmentOpcode = opcode;
          this.addFragment(payload);
        }
      } else {
        throw new Error(`WebSocket opcode ${opcode} is reserved`);
      }
    }
    return out;
  }

  private addFragment(payload: Buffer): void {
    this.fragmentBytes += payload.length;
    if (this.fragmentBytes > MAX_MESSAGE_BYTES) throw new Error(`WebSocket message over the ${MAX_MESSAGE_BYTES}-byte limit`);
    this.fragments.push(payload);
  }

  private takeMessage(): WsMessage {
    const message = { opcode: this.fragmentOpcode, payload: Buffer.concat(this.fragments) };
    this.fragments = [];
    this.fragmentBytes = 0;
    return message;
  }
}
