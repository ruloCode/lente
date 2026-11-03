// A small in-memory PostgREST for the Supabase stores' tests: the filters, ordering, paging, upserts
// and Prefer headers that src/supabase-rest.ts sends, over plain arrays of rows. It also refuses,
// like the real schema, a content column (`*_enc`) that is not bytea.

import { SupabaseRest } from "../src/supabase-rest.ts";

type Row = Record<string, unknown>;

export interface FakePostgrest {
  rest: SupabaseRest;
  tables: Map<string, Row[]>;
  requests: { method: string; table: string; search: URLSearchParams; body?: unknown }[];
  /** Every value ever written, as JSON, for leak checks. */
  dump(): string;
}

function matches(row: Row, key: string, expr: string): boolean {
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const value = row[key];
  if (op === "is") return raw === "null" ? value == null : String(value) === raw;
  if (op === "eq") return value != null && String(value) === raw;
  if (op === "gte") return value != null && String(value) >= raw;
  if (op === "lt") return value != null && String(value) < raw;
  if (op === "in") {
    const list = raw.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? [];
    return list.map((v) => (v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v)).includes(String(value));
  }
  throw new Error(`fake PostgREST: operator ${op} not supported`);
}

type Answer = { status: number; ok: boolean; text(): Promise<string> };
type Handler = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Answer>;

export function fakePostgrest(): FakePostgrest & { handler: Handler } {
  const tables = new Map<string, Row[]>();
  const requests: FakePostgrest["requests"] = [];
  const table = (name: string) => tables.get(name) ?? tables.set(name, []).get(name)!;
  const isBytea = (v: unknown) => typeof v === "string" && v.startsWith("\\x");
  const sealedOk = (r: Row) => Object.entries(r).every(([k, v]) => !k.endsWith("_enc") || v === null || isBytea(v));
  const upsert = (name: string, row: Row, keys: string[]) => {
    const existing = table(name).find((e) => keys.every((k) => String(e[k]) === String(row[k])));
    if (existing && existing.user_id !== row.user_id) return false;
    if (existing) Object.assign(existing, row);
    else table(name).push({ ...row });
    return true;
  };

  /** The migrations' functions (20261102010000_atomic_writes.sql): every check runs before any row changes, so a failure leaves nothing. */
  const rpcs: Record<string, (args: Row) => string | undefined> = {
    lente_create_account: (a) => {
      const userId = String(a.p_user_id);
      if (!isBytea(a.p_wrapped_dek)) return "22P02";
      if (table("user_keys").some((r) => r.user_id === userId) || table("accounts").some((r) => r.user_id === userId)) return "23505";
      table("user_keys").push({ user_id: userId, kek_version: a.p_kek_version, wrapped_dek: a.p_wrapped_dek, created_at: a.p_created_at, rotated_at: null });
      table("accounts").push({ user_id: userId, locale: a.p_locale ?? "es-CO", created_at: a.p_created_at });
      return undefined;
    },
    lente_save_meeting: (a) => {
      const userId = String(a.p_user_id);
      const meeting = a.p_meeting as Row | null;
      const turns = (a.p_turns as Row[] | null) ?? [];
      const notes = a.p_notes as Row | null;
      for (const r of [meeting, notes, ...turns]) if (r && !sealedOk(r)) return "22P02";
      const owner = (id: unknown) => (meeting && meeting.id === id ? userId : table("meetings").find((m) => m.id === id)?.user_id);
      if (meeting && table("meetings").some((m) => m.id === meeting.id && m.user_id !== userId)) return "23503";
      for (const r of [...turns, ...(notes ? [notes] : [])]) if (owner(r.meeting_id) !== userId) return "23503";
      for (const t of turns) if (typeof t.seq !== "number" || t.seq < 0 || !isBytea(t.text_enc)) return "23514";
      if (meeting) upsert("meetings", { ...meeting, user_id: userId }, ["id"]);
      for (const t of turns) upsert("meeting_turns", { ...t, user_id: userId }, ["meeting_id", "seq"]);
      if (notes) upsert("meeting_notes", { ...notes, user_id: userId }, ["meeting_id"]);
      return undefined;
    },
  };

  const handler: Handler = async (url, init) => {
      const u = new URL(url);
      const name = u.pathname.replace("/rest/v1/", "");
      const body = init.body ? (JSON.parse(init.body) as unknown) : undefined;
      requests.push({ method: init.method, table: name, search: u.searchParams, body });
      const reply = (status: number, value?: unknown) => ({ status, ok: status < 300, text: async () => (value === undefined ? "" : JSON.stringify(value)) });
      const filters = [...u.searchParams].filter(([k]) => !["select", "order", "limit", "on_conflict"].includes(k));
      const selected = () => table(name).filter((r) => filters.every(([k, v]) => matches(r, k, v)));
      const wantRows = (init.headers.Prefer ?? "").includes("return=representation");

      if (init.method === "POST" && name.startsWith("rpc/")) {
        const fn = rpcs[name.slice(4)];
        if (!fn) return reply(404, { code: "PGRST202" });
        const error = fn(body as Row);
        return error ? reply(400, { code: error }) : reply(204);
      }
      if (init.method === "POST") {
        const rows = body as Row[];
        for (const r of rows) {
          for (const [k, v] of Object.entries(r)) {
            if (k.endsWith("_enc") && v !== null && !(typeof v === "string" && v.startsWith("\\x"))) return reply(400, { code: "22P02" });
          }
        }
        const conflict = u.searchParams.get("on_conflict")?.split(",");
        for (const r of rows) {
          const existing = conflict ? table(name).find((e) => conflict.every((c) => String(e[c]) === String(r[c]))) : undefined;
          if (existing) Object.assign(existing, r);
          else table(name).push({ ...r });
        }
        return reply(201, wantRows ? rows : undefined);
      }
      if (init.method === "PATCH") {
        const hit = selected();
        for (const r of hit) Object.assign(r, body);
        return reply(200, hit.map((r) => ({ ...r })));
      }
      if (init.method === "DELETE") {
        const hit = selected();
        tables.set(name, table(name).filter((r) => !hit.includes(r)));
        return reply(200, hit);
      }
      let rows = selected().map((r) => ({ ...r }));
      for (const spec of u.searchParams.getAll("order").reverse()) {
        const [col, dir = "asc", nulls] = spec.split(".");
        rows = rows.sort((a, b) => {
          const x = a[col!];
          const y = b[col!];
          if (x == null || y == null) return x == null && y == null ? 0 : (x == null) === (nulls === "nullsfirst") ? -1 : 1;
          const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
          return dir === "desc" ? -c : c;
        });
      }
      const limit = u.searchParams.get("limit");
      if (limit) rows = rows.slice(0, Number(limit));
      const select = u.searchParams.get("select");
      if (select && select !== "*") rows = rows.map((r) => Object.fromEntries(select.split(",").map((c) => [c, r[c]])));
      return reply(200, rows);
  };
  const rest = new SupabaseRest({ url: "https://fake.supabase.co", secretKey: "sb_secret_fake", sleep: async () => {}, fetch: handler });
  return { rest, tables, requests, handler, dump: () => JSON.stringify([...tables.entries()]) };
}

/**
 * The same fake over HTTP, for a hub in another process: `/rest/v1/…` goes to the fake (only with
 * the expected secret key), `/auth/v1/.well-known/jwks.json` answers with the keys given.
 */
export async function servePostgrest(jwks: object, auth?: (path: string, body: string) => { status: number; body: unknown } | undefined): Promise<{ url: string; fake: ReturnType<typeof fakePostgrest>; close(): void }> {
  const { createServer } = await import("node:http");
  const fake = fakePostgrest();
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      if (req.url?.startsWith("/auth/v1/.well-known/jwks.json")) return void res.end(JSON.stringify(jwks));
      const authAnswer = req.url?.startsWith("/auth/v1/") ? auth?.(req.url, body) : undefined;
      if (authAnswer) return void res.writeHead(authAnswer.status, { "Content-Type": "application/json" }).end(JSON.stringify(authAnswer.body));
      if (!req.url?.startsWith("/rest/v1/") || req.headers.apikey !== "sb_secret_fake") return void res.writeHead(401).end("{}");
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k === "prefer" ? "Prefer" : k, String(v)]));
      const answer = await fake.handler(`http://fake${req.url}`, { method: req.method ?? "GET", headers, body: body || undefined });
      res.writeHead(answer.status, { "Content-Type": "application/json" }).end(await answer.text());
    });
  });
  await new Promise<void>((ok) => server.listen(0, ok));
  const { port } = server.address() as { port: number };
  return { url: `http://localhost:${port}`, fake, close: () => (server.closeAllConnections(), server.close()) };
}
