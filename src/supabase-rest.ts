// The hub's only way into Supabase Postgres (add-accounts 4.2, design decisions 1 and 2): PostgREST
// and RPC over `fetch` with the secret key, no driver and no supabase-js. Every query on a user's
// table is built from `forUser(userId)`, which puts `user_id=eq.<id>` in the filter and stamps it on
// inserted rows; the client re-checks that filter on the final URL before sending. The few lookups
// that cross users by design (a device or session token's hash, the KEK canaries) are named methods
// on `system`, not a general escape hatch. Errors name the table and status, never row content.

/** Retries after a 429, a 5xx or a network failure, with these waits in milliseconds. */
export const RETRY_DELAYS_MS = [200, 800];
/** One request's time limit. */
export const REQUEST_TIMEOUT_MS = 8000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z_][a-z0-9_]*$/;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export class SupabaseError extends Error {
  override name = "SupabaseError";
  readonly table: string;
  readonly status: number;
  readonly code?: string;

  constructor(table: string, status: number, code: string | undefined, reason: string) {
    super(`supabase ${table}: ${status}${code ? ` ${code}` : ""} ${reason}`.trim());
    this.table = table;
    this.status = status;
    this.code = code;
  }
}

/** bytea in and out of PostgREST: `\x` followed by hex. */
export const toBytea = (bytes: Buffer): string => `\\x${bytes.toString("hex")}`;
export function fromBytea(value: unknown): Buffer {
  if (typeof value !== "string" || !value.startsWith("\\x")) throw new Error("expected a bytea value (\\x…)");
  return Buffer.from(value.slice(2), "hex");
}

type Scalar = string | number | boolean | null;
const encodeValue = (v: Scalar): string => (v === null ? "null" : encodeURIComponent(String(v)));
function inList(values: readonly Scalar[]): string {
  return `(${values.map((v) => (typeof v === "string" ? `"${v.replace(/["\\]/g, (c) => `\\${c}`)}"` : String(v))).map(encodeURIComponent).join(",")})`;
}

/** Filters, order and paging for one table, always scoped to one user. */
export class Query {
  readonly table: string;
  private readonly parts: string[] = [];

  constructor(table: string, scope: { userId: string } | { system: true }) {
    if (!IDENT.test(table)) throw new Error(`table name ${table} is not an identifier`);
    this.table = table;
    if ("userId" in scope) {
      if (!UUID.test(scope.userId)) throw new Error(`query on ${table} needs a user id (uuid), got ${scope.userId ? "a non-uuid" : "none"}`);
      this.parts.push(`user_id=eq.${scope.userId}`);
    }
  }

  private add(column: string, op: string, value: string): this {
    if (!IDENT.test(column)) throw new Error(`column ${column} is not an identifier`);
    if (column === "user_id") throw new Error("user_id is set by the scope, not by a filter");
    this.parts.push(`${column}=${op}.${value}`);
    return this;
  }

  eq(column: string, value: Scalar): this {
    return value === null ? this.add(column, "is", "null") : this.add(column, "eq", encodeValue(value));
  }
  gte(column: string, value: string | number): this {
    return this.add(column, "gte", encodeValue(value));
  }
  lt(column: string, value: string | number): this {
    return this.add(column, "lt", encodeValue(value));
  }
  in(column: string, values: readonly Scalar[]): this {
    return this.add(column, "in", inList(values));
  }
  order(column: string, direction: "asc" | "desc" = "asc", nulls?: "first" | "last"): this {
    if (!IDENT.test(column)) throw new Error(`column ${column} is not an identifier`);
    this.parts.push(`order=${column}.${direction}${nulls ? `.nulls${nulls}` : ""}`);
    return this;
  }
  limit(n: number): this {
    if (!Number.isInteger(n) || n < 1) throw new Error("limit must be a positive integer");
    this.parts.push(`limit=${n}`);
    return this;
  }

  /** The query string, with `select` first when given. */
  search(select?: string): string {
    const head = select ? [`select=${encodeURIComponent(select)}`] : [];
    return [...head, ...this.parts].join("&");
  }
}

type Row = Record<string, unknown>;

export interface RestOptions {
  url: string;
  secretKey: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export class SupabaseRest {
  private readonly base: string;
  private readonly key: string;
  private readonly fetchFn: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: RestOptions) {
    if (!options.secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");
    this.base = `${options.url.replace(/\/+$/, "")}/rest/v1`;
    this.key = options.secretKey;
    this.fetchFn = options.fetch ?? (fetch as unknown as FetchLike);
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Everything one user may touch: every query carries their id. */
  forUser(userId: string) {
    const q = (table: string) => new Query(table, { userId });
    return {
      query: q,
      select: <T = Row>(query: Query, columns = "*") => this.send<T[]>("GET", query.table, query.search(columns), undefined, {}, userId),
      insert: (table: string, rows: Row[], options: { returning?: boolean; upsertOn?: string } = {}) => {
        const stamped = rows.map((r) => {
          if (r.user_id !== undefined && r.user_id !== userId) throw new Error(`insert into ${table} carries another user's id`);
          return { ...r, user_id: userId };
        });
        const prefer = [options.returning ? "return=representation" : "return=minimal", ...(options.upsertOn ? ["resolution=merge-duplicates"] : [])];
        const search = options.upsertOn ? `on_conflict=${encodeURIComponent(options.upsertOn)}` : "";
        return this.send<Row[] | null>("POST", table, search, stamped, { Prefer: prefer.join(",") }, undefined);
      },
      update: (query: Query, values: Row) => {
        if ("user_id" in values) throw new Error(`update on ${query.table} may not change user_id`);
        return this.send<Row[]>("PATCH", query.table, query.search(), values, { Prefer: "return=representation" }, userId);
      },
      remove: (query: Query) => this.send<Row[]>("DELETE", query.table, query.search(), undefined, { Prefer: "return=representation" }, userId),
      /** A database function; the user id goes in as `p_user_id`. */
      rpc: <T = unknown>(fn: string, args: Row) => {
        if (!IDENT.test(fn)) throw new Error(`function name ${fn} is not an identifier`);
        return this.send<T>("POST", `rpc/${fn}`, "", { ...args, p_user_id: userId }, {}, undefined);
      },
    };
  }

  /** The lookups that cross users by design, each one named. */
  get system() {
    const sys = (table: string) => new Query(table, { system: true });
    return {
      deviceByTokenHash: (hash: Buffer) => this.send<Row[]>("GET", "devices", sys("devices").eq("token_hash", toBytea(hash)).limit(1).search("*"), undefined, {}, undefined),
      sessionByTokenHash: (hash: Buffer) => this.send<Row[]>("GET", "sessions", sys("sessions").eq("token_hash", toBytea(hash)).limit(1).search("*"), undefined, {}, undefined),
      canary: (version: number) => this.send<Row[]>("GET", "kek_canaries", sys("kek_canaries").eq("kek_version", version).search("kek_version,sealed"), undefined, {}, undefined),
      putCanary: (version: number, sealed: Buffer) => this.send<null>("POST", "kek_canaries", "", [{ kek_version: version, sealed: toBytea(sealed) }], { Prefer: "return=minimal" }, undefined),
      /** Every user's wrapped data key, for a KEK rotation (scripts/rotate-kek.ts); no content. */
      wrappedKeys: () => this.send<Row[]>("GET", "user_keys", sys("user_keys").order("user_id").search("user_id,kek_version,wrapped_dek"), undefined, {}, undefined),
      /** Replaces one wrapped key, only if it is still under `fromVersion`; returns the rows changed. */
      rewrapKey: (userId: string, fromVersion: number, toVersion: number, wrapped: Buffer, at: string) =>
        this.send<Row[]>("PATCH", "user_keys", new Query("user_keys", { userId }).eq("kek_version", fromVersion).search(), { kek_version: toVersion, wrapped_dek: toBytea(wrapped), rotated_at: at }, { Prefer: "return=representation" }, userId),
      /** One cheap select for health (decision 13), timed by the caller; no retries, so a failure shows at once. */
      ping: () => this.send<Row[]>("GET", "accounts", sys("accounts").limit(1).search("user_id"), undefined, {}, undefined, false),
    };
  }

  private async send<T>(method: string, path: string, search: string, body: unknown, extra: Record<string, string>, scopedTo: string | undefined, retry = true): Promise<T> {
    const delays = retry ? RETRY_DELAYS_MS : [];
    const table = path.startsWith("rpc/") ? path : path.split("/")[0]!;
    if (scopedTo !== undefined && !new URLSearchParams(search).getAll("user_id").includes(`eq.${scopedTo}`)) {
      throw new Error(`refusing ${method} on ${table}: the query lost its user filter`);
    }
    const url = `${this.base}/${path}${search ? `?${search}` : ""}`;
    const headers: Record<string, string> = { apikey: this.key, Accept: "application/json", ...extra };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      let text = "";
      try {
        const res = await this.fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        status = res.status;
        text = await res.text();
        if (res.ok) return (text ? JSON.parse(text) : null) as T;
      } catch (error) {
        if (error instanceof SyntaxError) throw new SupabaseError(table, status, undefined, "answered with a body that is not JSON");
        if (attempt >= delays.length) throw new SupabaseError(table, 0, undefined, `unreachable: ${(error as Error).name}`);
        await this.sleep(delays[attempt]!);
        continue;
      }
      const retryable = status === 429 || status >= 500;
      if (retryable && attempt < delays.length) {
        await this.sleep(delays[attempt]!);
        continue;
      }
      throw new SupabaseError(table, status, errorCode(text), status === 401 || status === 403 ? "refused the secret key" : retryable ? "failed after retries" : "rejected the request");
    }
  }
}

/** PostgREST's error code (e.g. 23505); its message, details and hint can quote row values, so they are dropped. */
function errorCode(text: string): string | undefined {
  try {
    const code = (JSON.parse(text) as { code?: unknown }).code;
    return typeof code === "string" && /^[\w-]{1,12}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}
