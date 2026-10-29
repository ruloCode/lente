import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_BYTES, OPCODE, WsFrameParser, acceptKey, encodeFrame } from "../src/websocket.ts";

const bytes = (...b: number[]) => Buffer.from(b);

test("handshake accept key matches the RFC 6455 example", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("encodes the RFC examples: unmasked and masked Hello", () => {
  assert.deepEqual(encodeFrame(OPCODE.text, "Hello"), bytes(0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f));
  assert.deepEqual(encodeFrame(OPCODE.text, "Hello", bytes(0x37, 0xfa, 0x21, 0x3d)), bytes(0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58));
});

test("uses 16- and 64-bit lengths past 125 and 65535 bytes", () => {
  const mid = encodeFrame(OPCODE.binary, Buffer.alloc(256));
  assert.deepEqual([...mid.subarray(0, 4)], [0x82, 0x7e, 0x01, 0x00]);
  const big = encodeFrame(OPCODE.binary, Buffer.alloc(65536));
  assert.deepEqual([...big.subarray(0, 10)], [0x82, 0x7f, 0, 0, 0, 0, 0, 1, 0, 0]);
  const p = new WsFrameParser();
  assert.equal(p.push(big)[0].payload.length, 65536);
});

test("parser unmasks, survives byte-by-byte delivery and returns several messages per chunk", () => {
  const p = new WsFrameParser();
  const masked = encodeFrame(OPCODE.text, "Hello", bytes(0x37, 0xfa, 0x21, 0x3d));
  const got = [];
  for (const b of masked) got.push(...p.push(bytes(b)));
  assert.deepEqual(got.map((m) => m.payload.toString()), ["Hello"]);
  const two = p.push(Buffer.concat([encodeFrame(OPCODE.binary, bytes(1, 2)), encodeFrame(OPCODE.text, "x", bytes(1, 2, 3, 4))]));
  assert.deepEqual(two.map((m) => [m.opcode, m.payload.toString("hex")]), [[OPCODE.binary, "0102"], [OPCODE.text, "78"]]);
});

test("parser joins fragments and lets a ping through between them", () => {
  const p = new WsFrameParser();
  const out = p.push(Buffer.concat([bytes(0x01, 0x03, 0x48, 0x65, 0x6c), encodeFrame(OPCODE.ping, "p"), bytes(0x80, 0x02, 0x6c, 0x6f)]));
  assert.deepEqual(out.map((m) => [m.opcode, m.payload.toString()]), [[OPCODE.ping, "p"], [OPCODE.text, "Hello"]]);
});

test("parser refuses reserved opcodes, stray continuations and oversized messages", () => {
  assert.throws(() => new WsFrameParser().push(bytes(0x83, 0x00)), /reserved/);
  assert.throws(() => new WsFrameParser().push(bytes(0x80, 0x00)), /without a message/);
  const head = Buffer.alloc(10);
  head[0] = 0x82;
  head[1] = 0x7f;
  head.writeBigUInt64BE(BigInt(MAX_MESSAGE_BYTES + 1), 2);
  assert.throws(() => new WsFrameParser().push(head), /over the/);
});
