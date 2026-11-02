// A tools-only MCP server over Streamable HTTP (add-agent-bridge, design decision 2), pure: it gets
// the HTTP method, headers and body and returns the status, headers and body; the hub does the I/O.
// Dual-era, as modelcontextprotocol.io describes it (read 2026-11-02):
// - Modern (2026-07-28): no session and no handshake. Every request carries its version in
//   `params._meta`, mirrored in the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, and
//   a mismatch is 400 with -32020. `server/discover` is required. An unknown method is 404 with -32601.
// - Legacy (2025-03-26 to 2025-11-25): `initialize` negotiates a version, later requests carry it in
//   `MCP-Protocol-Version` (missing means 2025-03-26). No session id is minted; those revisions make it optional.
// Replies are always one JSON object, never an SSE stream. GET and DELETE answer 405.

export const MODERN_VERSIONS = ["2026-07-28"] as const;
/** Newest first: `initialize` with an unknown version is answered with the first. */
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
/** What a legacy request without the version header is taken to speak. */
const LEGACY_DEFAULT = "2025-03-26";
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT = "io.modelcontextprotocol/clientInfo";
/** Longest request body read, in bytes; tool arguments here are short text. */
export const MCP_MAX_BODY_BYTES = 64 * 1024;

/** JSON-RPC and MCP error codes this server sends. */
export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

export interface McpToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** A protocol error a tool handler raises (an unknown tool, malformed arguments). */
export class McpError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface McpServer {
  info: { name: string; version: string };
  instructions?: string;
  /** The tools this caller may see: they vary only by the credentials, never by earlier requests. */
  tools(): McpToolDefinition[];
  /** Runs one tool for this caller; `client` is what the request says it is, for display only. */
  call(name: string, args: Record<string, unknown>, client: string): Promise<ToolResult>;
}

export interface McpRequest {
  method: string;
  /** Header names in lower case, as node:http gives them. */
  headers: Record<string, string | string[] | undefined>;
  body: string;
  /** Origins a browser may call from (the hub's own); requests with any other `Origin` are refused. */
  allowedOrigins: readonly string[];
}

export interface McpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
}

type Id = string | number | null;

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, message: object): McpResponse => ({ status, headers: JSON_HEADERS, body: JSON.stringify({ jsonrpc: "2.0", ...message }) });
const result = (id: Id, value: object, status = 200): McpResponse => reply(status, { id, result: value });
const failure = (status: number, id: Id | undefined, code: number, message: string, data?: object): McpResponse =>
  reply(status, { ...(id === undefined ? {} : { id }), error: { code, message, ...(data ? { data } : {}) } });

const header = (req: McpRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** `Mcp-Name` values outside plain ASCII come as `=?base64?…?=` (the 2026-07-28 value encoding). */
export function decodeHeaderValue(value: string): string {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value);
  return m ? Buffer.from(m[1]!, "base64").toString("utf8") : value;
}

/** The 401 every MCP route answers to a missing, unknown or revoked token, before any JSON-RPC. */
export function unauthorizedResponse(): McpResponse {
  return { status: 401, headers: { ...JSON_HEADERS, "WWW-Authenticate": 'Bearer realm="lente"' }, body: JSON.stringify({ error: "unauthorized", message: "Missing, unknown or revoked agent token" }) };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Answers one HTTP request to the MCP endpoint. */
export async function serveMcp(req: McpRequest, server: McpServer): Promise<McpResponse> {
  if (req.method !== "POST") return { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } };
  const origin = header(req, "origin");
  if (origin !== undefined && !req.allowedOrigins.includes(origin)) return failure(403, undefined, RPC.invalidRequest, `Origin ${origin.slice(0, 80)} is not allowed`);
  if (Buffer.byteLength(req.body) > MCP_MAX_BODY_BYTES) return failure(413, null, RPC.invalidRequest, `Body over ${MCP_MAX_BODY_BYTES} bytes`);

  let message: unknown;
  try {
    message = JSON.parse(req.body);
  } catch {
    return failure(400, null, RPC.parse, "Body is not JSON");
  }
  if (Array.isArray(message)) return failure(400, null, RPC.invalidRequest, "Batches are not supported; send one message per POST");
  if (!isObject(message) || message.jsonrpc !== "2.0") return failure(400, null, RPC.invalidRequest, 'Not a JSON-RPC 2.0 message (jsonrpc must be "2.0")');
  if (!("id" in message)) {
    // A notification: accepted and dropped (this server keeps no state a notification could change).
    if (typeof message.method !== "string") return failure(400, undefined, RPC.invalidRequest, "Clients must not send responses");
    return { status: 202, headers: { "Cache-Control": "no-store" } };
  }
  const id = message.id;
  if (typeof id !== "string" && typeof id !== "number") return failure(400, null, RPC.invalidRequest, "id must be a string or a number");
  if (typeof message.method !== "string") return failure(400, id, RPC.invalidRequest, "method must be a string");
  const method = message.method;
  const params = isObject(message.params) ? message.params : {};
  const meta = isObject(params._meta) ? params._meta : {};

  const modernVersion = meta[META_VERSION];
  if (modernVersion !== undefined) return modern(req, server, id, method, params, meta, modernVersion);
  return legacy(req, server, id, method, params);
}

async function modern(req: McpRequest, server: McpServer, id: string | number, method: string, params: Record<string, unknown>, meta: Record<string, unknown>, version: unknown): Promise<McpResponse> {
  const headerVersion = header(req, "mcp-protocol-version");
  if (headerVersion !== version) return failure(400, id, RPC.headerMismatch, `Header mismatch: MCP-Protocol-Version ${headerVersion === undefined ? "is missing" : `'${headerVersion}'`} but the body says '${String(version)}'`);
  if (!MODERN_VERSIONS.includes(version as (typeof MODERN_VERSIONS)[number])) {
    return failure(400, id, RPC.unsupportedVersion, "Unsupported protocol version", { supported: [...MODERN_VERSIONS], requested: version });
  }
  const headerMethod = header(req, "mcp-method");
  if (headerMethod !== method) return failure(400, id, RPC.headerMismatch, `Header mismatch: Mcp-Method ${headerMethod === undefined ? "is missing" : `'${headerMethod}'`} but the body says '${method}'`);
  if (method === "tools/call" || method === "resources/read" || method === "prompts/get") {
    const raw = header(req, "mcp-name");
    const named = method === "resources/read" ? params.uri : params.name;
    if (raw === undefined || decodeHeaderValue(raw) !== named) return failure(400, id, RPC.headerMismatch, `Header mismatch: Mcp-Name ${raw === undefined ? "is missing" : "does not match the body"}`);
  }
  const client = clientName(meta[META_CLIENT]);
  const complete = (value: object) => result(id, { resultType: "complete", ...value });
  switch (method) {
    case "server/discover":
      return complete({
        supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
        capabilities: { tools: { listChanged: false } },
        _meta: { "io.modelcontextprotocol/serverInfo": server.info },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      });
    case "ping":
      return complete({});
    case "tools/list":
      return complete({ tools: server.tools() });
    case "tools/call":
      return toolCall(server, id, params, client, complete);
    default:
      return failure(404, id, RPC.methodNotFound, `Method not found: ${method.slice(0, 80)}`);
  }
}

async function legacy(req: McpRequest, server: McpServer, id: string | number, method: string, params: Record<string, unknown>): Promise<McpResponse> {
  if (method === "initialize") {
    const requested = params.protocolVersion;
    const version = LEGACY_VERSIONS.includes(requested as (typeof LEGACY_VERSIONS)[number]) ? (requested as string) : LEGACY_VERSIONS[0];
    return result(id, {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: server.info,
      ...(server.instructions ? { instructions: server.instructions } : {}),
    });
  }
  const version = header(req, "mcp-protocol-version") ?? LEGACY_DEFAULT;
  if (MODERN_VERSIONS.includes(version as (typeof MODERN_VERSIONS)[number])) {
    return failure(400, id, RPC.headerMismatch, `Header mismatch: MCP-Protocol-Version '${version}' needs params._meta["${META_VERSION}"] in the body`);
  }
  if (!LEGACY_VERSIONS.includes(version as (typeof LEGACY_VERSIONS)[number])) {
    return failure(400, id, RPC.unsupportedVersion, "Unsupported protocol version", { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: version });
  }
  const client = clientName(isObject(params._meta) ? params._meta[META_CLIENT] : undefined);
  const plain = (value: object) => result(id, value);
  switch (method) {
    case "ping":
      return plain({});
    case "tools/list":
      return plain({ tools: server.tools() });
    case "tools/call":
      return toolCall(server, id, params, client, plain);
    default:
      return failure(200, id, RPC.methodNotFound, `Method not found: ${method.slice(0, 80)}`);
  }
}

async function toolCall(server: McpServer, id: string | number, params: Record<string, unknown>, client: string, ok: (value: object) => McpResponse): Promise<McpResponse> {
  if (typeof params.name !== "string") return failure(200, id, RPC.invalidParams, "tools/call needs params.name");
  if (params.arguments !== undefined && !isObject(params.arguments)) return failure(200, id, RPC.invalidParams, "params.arguments must be an object");
  try {
    return ok(await server.call(params.name, (params.arguments as Record<string, unknown> | undefined) ?? {}, client));
  } catch (error) {
    if (error instanceof McpError) return failure(200, id, error.code, error.message);
    return failure(200, id, RPC.internal, "The tool failed inside the hub");
  }
}

const clientName = (info: unknown): string => (isObject(info) && typeof info.name === "string" ? info.name.slice(0, 60) : "");
