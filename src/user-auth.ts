// Who is calling: Supabase Auth access tokens checked in the hub (add-accounts, design decision 3).
// A token is accepted only with a valid ES256 or RS256 signature by a key from the project's JWKS
// (picked by `kid`), `iss` = the project's Auth URL, `aud` = "authenticated" and an `exp` in the
// future; then `sub` is the user id. Pure but for the JWKS fetch, which is injected.

import { type KeyObject, type JsonWebKey, createPublicKey, verify } from "node:crypto";

/** How long fetched public keys are trusted before fetching again. */
export const JWKS_TTL_MS = 10 * 60 * 1000;
/** Least time between refetches caused by an unknown `kid`, so forged tokens cannot hammer Supabase. */
export const JWKS_MIN_REFETCH_MS = 30 * 1000;
/** The audience Supabase puts on signed-in users' tokens. */
export const AUTH_AUDIENCE = "authenticated";

const ALGORITHMS = new Set(["ES256", "RS256"]);

/** Why a token was refused; the hub turns every one into 401 and never logs the token. */
export class TokenError extends Error {
  override name = "TokenError";
}

export interface AccessClaims {
  userId: string;
  email?: string;
  /** Seconds since the epoch. */
  expiresAt: number;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const b64urlJson = (part: string, what: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through to the error below
  }
  throw new TokenError(`token ${what} is not base64url JSON`);
};

/** Public keys of one Supabase project, fetched from its JWKS and cached. */
export class Jwks {
  private keys = new Map<string, { key: KeyObject; alg?: string }>();
  private fetchedAt = -Infinity;
  private pending: Promise<void> | undefined;
  private readonly url: string;
  private readonly fetchFn: Fetch;
  private readonly now: () => number;

  constructor(url: string, fetchFn: Fetch = fetch as unknown as Fetch, now: () => number = Date.now) {
    this.url = url;
    this.fetchFn = fetchFn;
    this.now = now;
  }

  /** The key for a `kid`: from cache while fresh, refetched when stale or (rate-limited) unknown. */
  async key(kid: string): Promise<{ key: KeyObject; alg?: string } | undefined> {
    const age = this.now() - this.fetchedAt;
    if (age >= JWKS_TTL_MS || (!this.keys.has(kid) && age >= JWKS_MIN_REFETCH_MS)) await this.refresh();
    return this.keys.get(kid);
  }

  private refresh(): Promise<void> {
    this.pending ??= this.load().finally(() => (this.pending = undefined));
    return this.pending;
  }

  private async load(): Promise<void> {
    const res = await this.fetchFn(this.url, { signal: AbortSignal.timeout(5000) }).catch((error: Error) => {
      throw new TokenError(`could not fetch the signing keys from ${this.url}: ${error.message}`);
    });
    if (!res.ok) throw new TokenError(`signing keys at ${this.url} answered ${res.status}`);
    const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
    const next = new Map<string, { key: KeyObject; alg?: string }>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || (jwk.kty !== "EC" && jwk.kty !== "RSA")) continue;
      try {
        next.set(jwk.kid, { key: createPublicKey({ key: jwk, format: "jwk" }), alg: jwk.alg });
      } catch {
        // a key Node cannot read is skipped; tokens signed by it fail as an unknown kid
      }
    }
    this.keys = next;
    this.fetchedAt = this.now();
  }
}

export interface VerifyOptions {
  issuer: string;
  audience?: string;
  keyFor: (kid: string) => Promise<{ key: KeyObject; alg?: string } | undefined>;
  /** Milliseconds since the epoch. */
  now?: number;
}

/** Checks one access token and returns who it belongs to, or throws a TokenError saying why not. */
export async function verifyAccessToken(token: string, options: VerifyOptions): Promise<AccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw new TokenError("token is not a JWT (three dot-separated parts)");
  const [h, p, s] = parts as [string, string, string];
  const header = b64urlJson(h, "header");
  const alg = header.alg;
  if (typeof alg !== "string" || !ALGORITHMS.has(alg)) throw new TokenError(`token algorithm ${String(alg)} is not accepted (ES256 or RS256)`);
  if (typeof header.kid !== "string" || !header.kid) throw new TokenError("token header has no kid");
  const payload = b64urlJson(p, "payload");

  const found = await options.keyFor(header.kid);
  if (!found) throw new TokenError(`token kid ${header.kid} is not among the project's signing keys`);
  if (found.alg && found.alg !== alg) throw new TokenError(`token says ${alg} but key ${header.kid} is ${found.alg}`);
  const keyType = found.key.asymmetricKeyType;
  if ((alg === "ES256") !== (keyType === "ec")) throw new TokenError(`key ${header.kid} (${keyType}) cannot verify ${alg}`);
  const signature = Buffer.from(s, "base64url");
  const signed = Buffer.from(`${h}.${p}`, "utf8");
  const ok = alg === "ES256" ? verify("sha256", signed, { key: found.key, dsaEncoding: "ieee-p1363" }, signature) : verify("sha256", signed, found.key, signature);
  if (!ok) throw new TokenError("token signature does not verify");

  if (payload.iss !== options.issuer) throw new TokenError(`token issuer ${String(payload.iss)} is not ${options.issuer}`);
  const audience = options.audience ?? AUTH_AUDIENCE;
  const aud = payload.aud;
  if (!(aud === audience || (Array.isArray(aud) && aud.includes(audience)))) throw new TokenError(`token audience ${JSON.stringify(aud)} is not ${audience}`);
  const exp = payload.exp;
  if (typeof exp !== "number") throw new TokenError("token has no exp");
  const nowS = (options.now ?? Date.now()) / 1000;
  if (nowS >= exp) throw new TokenError("token has expired");
  if (typeof payload.nbf === "number" && nowS < payload.nbf) throw new TokenError("token is not valid yet");
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) throw new TokenError("token has no subject");
  return { userId: sub, email: typeof payload.email === "string" ? payload.email : undefined, expiresAt: exp };
}

/** The issuer and JWKS URL of a Supabase project, from `SUPABASE_URL`. */
export function supabaseAuthUrls(supabaseUrl: string): { issuer: string; jwks: string } {
  const base = supabaseUrl.replace(/\/+$/, "");
  return { issuer: `${base}/auth/v1`, jwks: `${base}/auth/v1/.well-known/jwks.json` };
}

/** Verifies access tokens for one Supabase project. */
export class UserAuth {
  private readonly jwks: Jwks;
  private readonly issuer: string;
  private readonly now: () => number;

  constructor(supabaseUrl: string, fetchFn?: Fetch, now: () => number = Date.now) {
    const urls = supabaseAuthUrls(supabaseUrl);
    this.issuer = urls.issuer;
    this.jwks = new Jwks(urls.jwks, fetchFn, now);
    this.now = now;
  }

  verify(token: string): Promise<AccessClaims> {
    return verifyAccessToken(token, { issuer: this.issuer, keyFor: (kid) => this.jwks.key(kid), now: this.now() });
  }
}
