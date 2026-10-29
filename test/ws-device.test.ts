import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { ClipFrameParser, encodeAudioFrame, encodeHello, parseAudioFrame, parseHello } from "../src/clip-protocol.ts";
import { OPCODE, WsFrameParser, encodeFrame as wsFrame } from "../src/websocket.ts";
import { DEVICE_WS_PATH, acceptDevice } from "../src/ws-device.ts";

const MASK = Buffer.from([1, 2, 3, 4]);

async function withHub(onDevice: (device: import("node:stream").Duplex) => void, run: (port: number) => Promise<void>) {
  const server = createServer((_req, res) => res.writeHead(404).end());
  server.on("upgrade", (req, raw, head) => {
    const device = acceptDevice(req, raw, head);
    if (device) onDevice(device);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

function upgrade(port: number, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; socket?: import("node:net").Socket }>((resolve) => {
    const req = request({ port, host: "127.0.0.1", path: DEVICE_WS_PATH, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", ...headers } });
    req.on("upgrade", (res, socket) => {
      assert.equal(res.headers["sec-websocket-accept"], "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
      resolve({ status: res.statusCode ?? 0, socket });
    });
    req.on("response", (res) => resolve({ status: res.statusCode ?? 0 }));
    req.end();
  });
}

test("hello and audio frames sent as binary messages reach the hub as clip protocol v2, commands go back", async () => {
  const seen: Buffer[] = [];
  await withHub(
    (device) => {
      device.once("data", () => device.write("M"));
      device.on("data", (c: Buffer) => seen.push(c));
    },
    async (port) => {
      const { status, socket } = await upgrade(port);
      assert.equal(status, 101);
      const pcm = Buffer.alloc(2560, 7);
      socket!.write(wsFrame(OPCODE.binary, encodeHello({ fw: "test", device: "phone" }), MASK));
      socket!.write(wsFrame(OPCODE.binary, encodeAudioFrame(0, 0, pcm), MASK));
      const back = new WsFrameParser();
      const commands = await new Promise<Buffer>((resolve) => socket!.once("data", (c) => resolve(back.push(c)[0].payload)));
      assert.equal(commands.toString("latin1"), "M");
      await new Promise((r) => setTimeout(r, 50));
      const frames = new ClipFrameParser().push(Buffer.concat(seen));
      assert.deepEqual(frames.map((f) => f.type), ["H", "A"]);
      const hello = parseHello(frames[0].payload);
      assert.ok(hello.ok);
      assert.deepEqual(parseAudioFrame(frames[1].payload).pcm, pcm);
      socket!.destroy();
    },
  );
});

test("a close message ends the device stream; a request that is not a WebSocket upgrade gets 400", async () => {
  let ended!: () => void;
  const done = new Promise<void>((r) => (ended = r));
  await withHub(
    (device) => {
      device.resume();
      device.on("end", ended);
    },
    async (port) => {
      const { socket } = await upgrade(port);
      socket!.write(wsFrame(OPCODE.close, Buffer.alloc(0), MASK));
      await done;
      socket!.destroy();
      const bad = await upgrade(port, { "Sec-WebSocket-Version": "8" });
      assert.equal(bad.status, 400);
    },
  );
});
