import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DeviceAuth, PAIRING_CODE_TTL_MS, PAIRING_MAX_ATTEMPTS, cookieValue, deviceTokenOf } from "../src/device-auth.ts";
import { HealthTracker, reasonClass } from "../src/health.ts";

const fresh = () => join(mkdtempSync(join(tmpdir(), "lente-auth-")), "devices.json");

test("an issued device token is accepted, an unknown one and an empty one are not", () => {
  const auth = new DeviceAuth(fresh());
  const { token } = auth.issueDevice("clip-1");
  assert.ok(auth.checkDevice(token));
  assert.ok(!auth.checkDevice("not-a-token"));
  assert.ok(!auth.checkDevice(undefined));
});

test("a revoked token is refused, also after a restart; tokens are stored hashed", () => {
  const file = fresh();
  const auth = new DeviceAuth(file);
  const { id, token } = auth.issueDevice("clip-1");
  assert.ok(!readFileSync(file, "utf8").includes(token));
  assert.ok(auth.revokeDevice(id));
  assert.ok(!auth.revokeDevice(id));
  assert.ok(!new DeviceAuth(file).checkDevice(token));
});

test("a hub running while another process adds or revokes a token sees it", () => {
  const file = fresh();
  const hub = new DeviceAuth(file);
  const { id, token } = new DeviceAuth(file).issueDevice("late");
  assert.ok(hub.checkDevice(token));
  assert.ok(new DeviceAuth(file).revokeDevice(id));
  assert.ok(!hub.checkDevice(token));
});

test("pairing: the code works once, then the session is remembered across restarts", () => {
  const file = fresh();
  const auth = new DeviceAuth(file);
  const code = auth.newPairingCode(0);
  assert.match(code, /^\d{6}$/);
  const session = auth.pair(code, 1000);
  assert.ok(session);
  assert.ok(auth.checkSession(session));
  assert.equal(auth.pair(code, 2000), undefined);
  assert.ok(new DeviceAuth(file).checkSession(session));
});

test("an unpaired browser: no cookie, a made-up cookie, a device token used as a session", () => {
  const auth = new DeviceAuth(fresh());
  const { token } = auth.issueDevice("clip-1");
  assert.ok(!auth.checkSession(undefined));
  assert.ok(!auth.checkSession("forged"));
  assert.ok(!auth.checkSession(token));
});

test("wrong, expired and brute-forced codes pair nothing", () => {
  const auth = new DeviceAuth(fresh());
  const code = auth.newPairingCode(0);
  assert.equal(auth.pair("000000" === code ? "111111" : "000000", 1), undefined);
  assert.equal(auth.pair(code, PAIRING_CODE_TTL_MS + 1), undefined);
  const again = auth.newPairingCode(0);
  for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) auth.pair("x", 1);
  assert.equal(auth.pair(again, 2), undefined, "the code is burned after too many wrong tries");
});

test("cookie and token parsing", () => {
  assert.equal(cookieValue("a=1; lente_session=abc=; b=2", "lente_session"), "abc=");
  assert.equal(cookieValue(undefined, "x"), undefined);
  assert.equal(deviceTokenOf({ authorization: "Bearer t1" }, "/device"), "t1");
  assert.equal(deviceTokenOf({}, "/device?token=t2"), "t2");
  assert.equal(deviceTokenOf({}, "/device"), undefined);
});

test("health: a rejected key is reported as a class, without the call's text", () => {
  const h = new HealthTracker();
  assert.equal(h.snapshot().ok, true);
  assert.equal(h.snapshot().model.state, "unknown");
  h.ok("model", 1);
  h.failed("model", "meta: HTTP 401 invalid key sk-SECRET said: the user asked about Monica's salary", 2);
  const snap = h.snapshot();
  assert.equal(snap.ok, false);
  assert.deepEqual(snap.model, { state: "failing", reason: "key rejected", at: 2 });
  assert.ok(!JSON.stringify(snap).includes("SECRET") && !JSON.stringify(snap).includes("salary"));
  h.ok("model", 3);
  assert.equal(h.snapshot().ok, true);
});

test("reasonClass", () => {
  assert.equal(reasonClass("HTTP 429 too many"), "rate limited");
  assert.equal(reasonClass("fetch failed"), "unreachable");
  assert.equal(reasonClass("MODEL_API_KEY is not set"), "key missing");
  assert.equal(reasonClass("weird"), "error");
});
