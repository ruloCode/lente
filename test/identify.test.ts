import assert from "node:assert/strict";
import { test } from "node:test";
import { type IdentitySources, LOCAL_OWNER, identify } from "../src/identify.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const JWT_ALICE = "eyJh.alice.sig";
const JWT_BAD = "eyJh.forged.sig";

const accounts: IdentitySources = {
  mode: "accounts",
  cookieName: "lente_session",
  verifyAccessToken: async (t) => {
    if (t === JWT_ALICE) return ALICE;
    throw new Error("bad signature");
  },
  sessionUser: async (c) => (c === "sess-bob" ? BOB : undefined),
  deviceUser: async (t) => (t === "clipTokenAlice" ? { userId: ALICE, deviceId: "d1" } : undefined),
};

test("open mode: every caller is the local owner", async () => {
  assert.deepEqual(await identify({}, { mode: "open", cookieName: "x" }, "web"), { userId: LOCAL_OWNER, via: "owner" });
});

test("pairing mode keeps today's rules: a paired cookie on the web, a device token only on /device, one owner", async () => {
  const pairing: IdentitySources = { mode: "pairing", cookieName: "lente_session", pairedSession: (c) => c === "paired", knownDevice: (t) => t === "clip" };
  assert.deepEqual(await identify({ cookie: "lente_session=paired" }, pairing, "web"), { userId: LOCAL_OWNER, via: "pairing" });
  assert.deepEqual(await identify({ authorization: "Bearer clip" }, pairing, "device"), { userId: LOCAL_OWNER, via: "device" });
  assert.deepEqual(await identify({ url: "/device?token=clip" }, pairing, "device"), { userId: LOCAL_OWNER, via: "device" });
  assert.equal(await identify({ authorization: "Bearer clip" }, pairing, "web"), undefined);
  assert.equal(await identify({ cookie: "lente_session=other" }, pairing, "web"), undefined);
  assert.equal(await identify({}, pairing, "web"), undefined);
});

test("accounts mode: a valid bearer token acts for its user, on the web and on /device", async () => {
  assert.deepEqual(await identify({ authorization: `Bearer ${JWT_ALICE}` }, accounts, "web"), { userId: ALICE, via: "bearer" });
  assert.deepEqual(await identify({ authorization: `Bearer ${JWT_ALICE}` }, accounts, "device"), { userId: ALICE, via: "bearer" });
});

test("accounts mode: an invalid bearer token is no one, even with a valid session cookie alongside", async () => {
  assert.equal(await identify({ authorization: `Bearer ${JWT_BAD}` }, accounts, "web"), undefined);
  assert.equal(await identify({ authorization: `Bearer ${JWT_BAD}`, cookie: "lente_session=sess-bob" }, accounts, "web"), undefined);
});

test("accounts mode: the web session cookie acts for its user; an unknown one is no one", async () => {
  assert.deepEqual(await identify({ cookie: "a=1; lente_session=sess-bob" }, accounts, "web"), { userId: BOB, via: "cookie" });
  assert.equal(await identify({ cookie: "lente_session=stale" }, accounts, "web"), undefined);
});

test("accounts mode: a device token works only on /device and resolves to its owner and device", async () => {
  assert.deepEqual(await identify({ authorization: "Bearer clipTokenAlice" }, accounts, "device"), { userId: ALICE, via: "device", deviceId: "d1" });
  assert.deepEqual(await identify({ url: "/device?token=clipTokenAlice" }, accounts, "device"), { userId: ALICE, via: "device", deviceId: "d1" });
  assert.equal(await identify({ authorization: "Bearer clipTokenAlice" }, accounts, "web"), undefined);
  assert.equal(await identify({ url: "/events?token=clipTokenAlice" }, accounts, "web"), undefined);
  assert.equal(await identify({ authorization: "Bearer revokedOrUnknown" }, accounts, "device"), undefined);
});

test("accounts mode: no credentials, or a pairing cookie from the old mode, is no one", async () => {
  assert.equal(await identify({}, accounts, "web"), undefined);
  assert.equal(await identify({}, accounts, "device"), undefined);
  assert.equal(await identify({ authorization: "Basic abc" }, accounts, "web"), undefined);
});
