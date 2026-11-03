// Signing in on the web page (add-accounts 3.2, design decision 3): `/auth/google` starts Supabase's
// OAuth with PKCE, `/auth/callback` exchanges the code, and the hub keeps the browser signed in with
// its own random session token in an HttpOnly cookie. The session row stores only the token's
// SHA-256 and the Supabase refresh token sealed under the user's data key. The `state` that ties a
// callback to the browser that started it is single use, expires in 10 minutes, and must match a
// short-lived cookie. Supabase's Auth endpoints are reached with `fetch`; the shapes used here are
// to be confirmed on the live service by task 1.1.

import { createHash, randomBytes, randomUUID } from "node:crypto";

/** How long a sign-in may take between leaving for Google and coming back. */
export const PKCE_TTL_MS = 10 * 60 * 1000;
/** Sign-ins waiting at once; the oldest is dropped past this (a flood cannot grow memory). */
export const PKCE_MAX_PENDING = 1000;
/** How long a web session lasts without use. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/** The cookie that carries the sign-in `state` to the callback. */
export const AUTH_COOKIE = "lente_auth";

const b64url = (bytes: Buffer): string => bytes.toString("base64url");
export const sha256 = (text: string): Buffer => createHash("sha256").update(text).digest();

/** The PKCE verifiers of sign-ins in progress, by `state`. */
export class PkceFlows {
  private readonly pending = new Map<string, { verifier: string; at: number }>();

  /** A new sign-in: the `state`, the verifier kept here, and the S256 challenge sent to Supabase. */
  start(now = Date.now()): { state: string; challenge: string } {
    for (const [state, flow] of this.pending) if (now - flow.at > PKCE_TTL_MS) this.pending.delete(state);
    while (this.pending.size >= PKCE_MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(48));
    this.pending.set(state, { verifier, at: now });
    return { state, challenge: b64url(sha256(verifier)) };
  }

  /** The verifier for a returning `state`, once: a replayed, unknown or expired state gets nothing. */
  take(state: string | null | undefined, now = Date.now()): string | undefined {
    if (!state) return undefined;
    const flow = this.pending.get(state);
    this.pending.delete(state);
    if (!flow || now - flow.at > PKCE_TTL_MS) return undefined;
    return flow.verifier;
  }
}

/** Where the browser goes to sign in with Google through Supabase. */
export function authorizeUrl(supabaseUrl: string, callbackUrl: string, state: string, challenge: string): string {
  const redirect = new URL(callbackUrl);
  redirect.searchParams.set("state", state);
  const url = new URL(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirect.toString());
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");
  return url.toString();
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Trades the code Supabase sent back for the user's tokens. Errors name the step and status, never a token. */
export async function exchangeCode(supabaseUrl: string, apikey: string, code: string, verifier: string, fetchFn: Fetch = fetch as unknown as Fetch): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetchFn(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`the sign-in code exchange answered ${res.status}`);
  const body = JSON.parse(await res.text()) as { access_token?: unknown; refresh_token?: unknown };
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") throw new Error("the sign-in code exchange returned no tokens");
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

export interface SessionRow {
  id: string;
  userId: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

/** Where web sessions live: the `sessions` table on Supabase, a JSON file without it. */
export interface SessionStore {
  insert(row: SessionRow & { tokenHash: Buffer }, refreshToken: string): Promise<void>;
  byTokenHash(tokenHash: Buffer): Promise<SessionRow | undefined>;
  revoke(userId: string, id: string, at: number): Promise<boolean>;
  touch(userId: string, id: string, at: number): Promise<void>;
}

/** The hub's web sessions: a random token in the cookie, only its hash stored. */
export class WebSessions {
  private readonly store: SessionStore;
  private readonly now: () => number;

  constructor(store: SessionStore, now: () => number = Date.now) {
    this.store = store;
    this.now = now;
  }

  /** A new session for a signed-in user; the returned token goes in the cookie and nowhere else. */
  async create(userId: string, refreshToken: string): Promise<string> {
    const token = b64url(randomBytes(32));
    const id = randomUUID();
    await this.store.insert({ id, userId, tokenHash: sha256(token), createdAt: this.now() }, refreshToken);
    return token;
  }

  /** The user of a live session cookie: unknown, revoked or idle past 30 days is no one. */
  async user(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    const row = await this.store.byTokenHash(sha256(token));
    if (!row || row.revokedAt !== undefined) return undefined;
    const now = this.now();
    if (now - (row.lastUsedAt ?? row.createdAt) > SESSION_IDLE_MS) return undefined;
    // Touch at most once an hour: a busy page must not write on every request.
    if (now - (row.lastUsedAt ?? row.createdAt) > 60 * 60 * 1000) await this.store.touch(row.userId, row.id, now);
    return row.userId;
  }

  async revoke(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const row = await this.store.byTokenHash(sha256(token));
    if (!row || row.revokedAt !== undefined) return false;
    return this.store.revoke(row.userId, row.id, this.now());
  }
}

/** Sessions in memory, or in a JSON file (accounts without a Supabase secret key); refresh tokens sealed by the caller's function. */
export class FileSessionStore implements SessionStore {
  private rows: (SessionRow & { tokenHash: string; refresh: string })[] = [];
  private readonly save: (rows: unknown) => void;
  private readonly sealRefresh: (userId: string, rowId: string, token: string) => Promise<string>;

  constructor(sealRefresh: (userId: string, rowId: string, token: string) => Promise<string>, file?: { read(): unknown; write(rows: unknown): void }) {
    this.sealRefresh = sealRefresh;
    this.rows = (file?.read() as typeof this.rows | undefined) ?? [];
    this.save = (rows) => file?.write(rows);
  }

  async insert(row: SessionRow & { tokenHash: Buffer }, refreshToken: string): Promise<void> {
    this.rows.push({ ...row, tokenHash: row.tokenHash.toString("hex"), refresh: await this.sealRefresh(row.userId, row.id, refreshToken) });
    this.save(this.rows);
  }

  async byTokenHash(tokenHash: Buffer): Promise<SessionRow | undefined> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash.toString("hex"));
    return row && { id: row.id, userId: row.userId, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, revokedAt: row.revokedAt };
  }

  async revoke(userId: string, id: string, at: number): Promise<boolean> {
    const row = this.rows.find((r) => r.userId === userId && r.id === id && r.revokedAt === undefined);
    if (!row) return false;
    row.revokedAt = at;
    this.save(this.rows);
    return true;
  }

  async touch(userId: string, id: string, at: number): Promise<void> {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    if (row) row.lastUsedAt = at;
    this.save(this.rows);
  }
}

/** Cookie headers for the session and the sign-in state. */
export const sessionCookie = (name: string, token: string): string => `${name}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_IDLE_MS / 1000}`;
export const clearCookie = (name: string, path = "/"): string => `${name}=; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=0`;
export const authCookie = (state: string): string => `${AUTH_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${PKCE_TTL_MS / 1000}`;
