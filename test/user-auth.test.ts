import assert from "node:assert/strict";
import { type KeyObject, generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { JWKS_MIN_REFETCH_MS, JWKS_TTL_MS, TokenError, UserAuth } from "../src/user-auth.ts";

const PROJECT = "https://abcdefgh.supabase.co";
const ISSUER = `${PROJECT}/auth/v1`;
const USER = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 1, 12);

const ec = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = () => generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwt(privateKey: KeyObject, header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc(header)}.${enc(payload)}`;
  const sig = header.alg === "ES256" ? sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }) : sign("sha256", Buffer.from(input), privateKey);
  return `${input}.${sig.toString("base64url")}`;
}

const claims = (over: Record<string, unknown> = {}) => ({ iss: ISSUER, aud: "authenticated", sub: USER, email: "owner@example.com", exp: T0 / 1000 + 3600, role: "authenticated", ...over });

function setup() {
  const es = ec();
  const rs = rsa();
  let keys = [
    { ...es.publicKey.export({ format: "jwk" }), kid: "es-1", alg: "ES256" },
    { ...rs.publicKey.export({ format: "jwk" }), kid: "rs-1", alg: "RS256" },
  ];
  let now = T0;
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ keys }) };
  };
  const auth = new UserAuth(PROJECT, fetchFn, () => now);
  return { auth, es, rs, calls, setKeys: (k: typeof keys) => (keys = k), tick: (ms: number) => (now += ms), get now() { return now; } };
}

test("a valid ES256 token and a valid RS256 token give the user id and email", async () => {
  const s = setup();
  assert.deepEqual(await s.auth.verify(jwt(s.es.privateKey, { alg: "ES256", kid: "es-1", typ: "JWT" }, claims())), { userId: USER, email: "owner@example.com", expiresAt: T0 / 1000 + 3600 });
  assert.equal((await s.auth.verify(jwt(s.rs.privateKey, { alg: "RS256", kid: "rs-1" }, claims()))).userId, USER);
  assert.deepEqual(s.calls, [`${ISSUER}/.well-known/jwks.json`]);
});

test("expired, wrong issuer, wrong audience and no subject are refused", async () => {
  const s = setup();
  const h = { alg: "ES256", kid: "es-1" };
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ exp: T0 / 1000 - 1 }))), /expired/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ exp: T0 / 1000 }))), /expired/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ iss: "https://evil.supabase.co/auth/v1" }))), /issuer/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ aud: "anon" }))), /audience/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ sub: undefined }))), /subject/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ exp: undefined }))), /no exp/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, h, claims({ nbf: T0 / 1000 + 60 }))), /not valid yet/);
});

test("a token signed by a key outside the project is refused, even with a known kid", async () => {
  const s = setup();
  const forger = ec();
  await assert.rejects(s.auth.verify(jwt(forger.privateKey, { alg: "ES256", kid: "es-1" }, claims())), /signature/);
});

test("an unknown kid refetches the keys once; a rotated-in key is then accepted", async () => {
  const s = setup();
  const fresh = ec();
  await s.auth.verify(jwt(s.es.privateKey, { alg: "ES256", kid: "es-1" }, claims()));
  await assert.rejects(s.auth.verify(jwt(fresh.privateKey, { alg: "ES256", kid: "es-2" }, claims())), /kid es-2 is not among/);
  assert.equal(s.calls.length, 1, "within the minimum gap, an unknown kid does not refetch");
  s.setKeys([{ ...fresh.publicKey.export({ format: "jwk" }), kid: "es-2", alg: "ES256" }]);
  s.tick(JWKS_MIN_REFETCH_MS);
  assert.equal((await s.auth.verify(jwt(fresh.privateKey, { alg: "ES256", kid: "es-2" }, claims({ exp: s.now / 1000 + 60 })))).userId, USER);
  assert.equal(s.calls.length, 2);
});

test("keys are cached for 10 minutes, then fetched again (a removed key stops working)", async () => {
  const s = setup();
  const token = () => jwt(s.es.privateKey, { alg: "ES256", kid: "es-1" }, claims({ exp: s.now / 1000 + 60 }));
  await s.auth.verify(token());
  s.tick(JWKS_TTL_MS - 1);
  await s.auth.verify(token());
  assert.equal(s.calls.length, 1);
  s.setKeys([]);
  s.tick(1);
  await assert.rejects(s.auth.verify(token()), /not among/);
  assert.equal(s.calls.length, 2);
});

test("malformed tokens and refused algorithms fail with a TokenError", async () => {
  const s = setup();
  for (const bad of ["", "abc", "a.b", "a..c", "!!.!!.!!", `${Buffer.from("[]").toString("base64url")}.e30.c2ln`]) {
    await assert.rejects(s.auth.verify(bad), TokenError, bad);
  }
  const none = `${Buffer.from(JSON.stringify({ alg: "none", kid: "es-1" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.`;
  await assert.rejects(s.auth.verify(none), TokenError);
  const hs = `${Buffer.from(JSON.stringify({ alg: "HS256", kid: "es-1" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.c2ln`;
  await assert.rejects(s.auth.verify(hs), /HS256 is not accepted/);
  await assert.rejects(s.auth.verify(jwt(s.es.privateKey, { alg: "ES256" }, claims())), /no kid/);
});

test("a token whose alg does not match its key is refused (no ES/RS confusion)", async () => {
  const s = setup();
  await assert.rejects(s.auth.verify(jwt(s.rs.privateKey, { alg: "RS256", kid: "es-1" }, claims())), /is ES256/);
});

test("JWKS unreachable or failing is a TokenError, not a crash", async () => {
  const down = new UserAuth(PROJECT, async () => { throw new Error("ECONNREFUSED"); }, () => T0);
  await assert.rejects(down.verify(jwt(ec().privateKey, { alg: "ES256", kid: "k" }, claims())), /could not fetch the signing keys/);
  const err = new UserAuth(PROJECT, async () => ({ ok: false, status: 503, json: async () => ({}) }), () => T0);
  await assert.rejects(err.verify(jwt(ec().privateKey, { alg: "ES256", kid: "k" }, claims())), /answered 503/);
});
