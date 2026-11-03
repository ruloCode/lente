// add-agent-bridge 2.1: the MCP transport, both eras, against a fake server with one tool.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type McpRequest, type McpServer, McpError, RPC, decodeHeaderValue, serveMcp, unauthorizedResponse } from "../src/mcp.ts";

const calls: { name: string; args: Record<string, unknown>; client: string }[] = [];
const server: McpServer = {
  info: { name: "lente", version: "test" },
  instructions: "PROBE instructions",
  tools: () => [{ name: "echo", description: "Echo", inputSchema: { type: "object", additionalProperties: false } }],
  async call(name, args, client) {
    if (name !== "echo") throw new McpError(RPC.invalidParams, `Unknown tool: ${name}`);
    calls.push({ name, args, client });
    return { content: [{ type: "text", text: "PROBE-echo" }], structuredContent: { args } };
  },
};

const MODERN = "2026-07-28";
const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientInfo": { name: "probe-client", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };

function modern(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}, id: number | string = 1): McpRequest {
  return {
    method: "POST",
    headers: { "mcp-protocol-version": MODERN, "mcp-method": method, ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}), ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: meta } }),
    allowedOrigins: ["https://hub.example"],
  };
}
const legacy = (method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}): McpRequest => ({
  method: "POST",
  headers,
  body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  allowedOrigins: [],
});
const body = (r: { body?: string }) => JSON.parse(r.body ?? "{}") as { id?: unknown; result?: Record<string, unknown>; error?: { code: number; message: string; data?: Record<string, unknown> } };

test("modern: discover, list and call, statelessly, with resultType complete", async () => {
  const discover = await serveMcp(modern("server/discover"), server);
  assert.equal(discover.status, 200);
  assert.equal(discover.headers["Content-Type"], "application/json");
  const d = body(discover).result!;
  assert.deepEqual(d.supportedVersions, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  assert.deepEqual(d.capabilities, { tools: { listChanged: false } });
  assert.equal(d.resultType, "complete");

  const list = body(await serveMcp(modern("tools/list"), server)).result!;
  assert.deepEqual((list.tools as { name: string }[]).map((t) => t.name), ["echo"]);

  const call = await serveMcp(modern("tools/call", { name: "echo", arguments: { a: 1 } }), server);
  assert.equal(call.status, 200);
  assert.deepEqual(body(call).result, { resultType: "complete", content: [{ type: "text", text: "PROBE-echo" }], structuredContent: { args: { a: 1 } } });
  assert.equal(calls.at(-1)!.client, "probe-client");
  assert.equal(call.headers["Mcp-Session-Id"], undefined, "no session is minted");
});

test("modern: headers must match the body", async () => {
  const noVersion = await serveMcp(modern("tools/list", {}, { "mcp-protocol-version": "" }), server);
  assert.equal(noVersion.status, 400);
  assert.equal(body(noVersion).error!.code, RPC.headerMismatch);
  const wrongMethod = await serveMcp(modern("tools/list", {}, { "mcp-method": "tools/call" }), server);
  assert.equal(wrongMethod.status, 400);
  assert.equal(body(wrongMethod).error!.code, -32020);
  const wrongName = await serveMcp(modern("tools/call", { name: "echo" }, { "mcp-name": "other" }), server);
  assert.equal(body(wrongName).error!.code, -32020);
  const encoded = await serveMcp(modern("tools/call", { name: "echo" }, { "mcp-name": `=?base64?${Buffer.from("echo").toString("base64")}?=` }), server);
  assert.equal(encoded.status, 200, "a base64 Mcp-Name is decoded before comparing");
  assert.equal(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?="), "Hello, 世界");
});

test("modern: an unknown version lists the supported ones; an unknown method is 404", async () => {
  const req = modern("tools/list");
  const old = { ...req, headers: { ...req.headers, "mcp-protocol-version": "1900-01-01" }, body: req.body.replace(MODERN, "1900-01-01") };
  const answer = await serveMcp(old, server);
  assert.equal(answer.status, 400);
  assert.deepEqual(body(answer).error, { code: -32022, message: "Unsupported protocol version", data: { supported: ["2026-07-28"], requested: "1900-01-01" } });
  const unknown = await serveMcp(modern("resources/list"), server);
  assert.equal(unknown.status, 404);
  assert.equal(body(unknown).error!.code, RPC.methodNotFound);
});

test("legacy: initialize negotiates, then calls work without a session", async () => {
  const init = await serveMcp(legacy("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "old", version: "1" } }), server);
  assert.equal(init.status, 200);
  const r = body(init).result!;
  assert.equal(r.protocolVersion, "2025-06-18");
  assert.deepEqual(r.serverInfo, { name: "lente", version: "test" });
  assert.equal(r.instructions, "PROBE instructions");
  assert.equal(init.headers["Mcp-Session-Id"], undefined);
  assert.equal(body(await serveMcp(legacy("initialize", { protocolVersion: "2099-01-01" }), server)).result!.protocolVersion, "2025-11-25", "unknown → newest legacy");

  const initialized = await serveMcp({ ...legacy("x"), body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }, server);
  assert.equal(initialized.status, 202);
  assert.equal(initialized.body, undefined);

  const list = await serveMcp(legacy("tools/list", {}, { "mcp-protocol-version": "2025-06-18" }), server);
  assert.deepEqual((body(list).result!.tools as { name: string }[]).map((t) => t.name), ["echo"]);
  assert.equal(body(list).result!.resultType, undefined, "legacy results keep their own shape");
  const noHeader = await serveMcp(legacy("tools/call", { name: "echo", arguments: {} }), server);
  assert.equal(noHeader.status, 200, "no header means 2025-03-26");
  const bad = await serveMcp(legacy("tools/list", {}, { "mcp-protocol-version": "2024-01-01" }), server);
  assert.equal(bad.status, 400);
  const modernHeaderOnly = await serveMcp(legacy("tools/list", {}, { "mcp-protocol-version": MODERN }), server);
  assert.equal(body(modernHeaderOnly).error!.code, -32020, "a modern header without _meta is a mismatch");
});

test("transport rules: 405, Origin, parse errors, batches, responses, unknown tools", async () => {
  assert.equal((await serveMcp({ ...modern("tools/list"), method: "GET" }, server)).status, 405);
  assert.equal((await serveMcp({ ...modern("tools/list"), method: "DELETE" }, server)).status, 405);
  const foreign = await serveMcp(modern("tools/list", {}, { origin: "https://evil.example" }), server);
  assert.equal(foreign.status, 403);
  assert.equal((await serveMcp(modern("tools/list", {}, { origin: "https://hub.example" }), server)).status, 200);
  assert.equal(body(await serveMcp({ ...legacy("x"), body: "{not json" }, server)).error!.code, RPC.parse);
  assert.equal((await serveMcp({ ...legacy("x"), body: "[]" }, server)).status, 400);
  assert.equal((await serveMcp({ ...legacy("x"), body: JSON.stringify({ jsonrpc: "2.0", result: {} }) }, server)).status, 400);
  const unknownTool = await serveMcp(modern("tools/call", { name: "rm" }), server);
  assert.equal(unknownTool.status, 200);
  assert.equal(body(unknownTool).error!.code, RPC.invalidParams);
  assert.equal(unauthorizedResponse().status, 401);
  assert.match(unauthorizedResponse().headers["WWW-Authenticate"]!, /^Bearer/);
});
