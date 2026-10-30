import assert from "node:assert/strict";
import { test } from "node:test";
import { decideUpgrade, decideWeb } from "../src/access-gate.ts";

const web = (method: string, path: string, over: { plainHttp?: boolean; paired?: boolean } = {}) =>
  ({ method, path, plainHttp: false, paired: false, ...over });

test("with auth on, an unpaired browser gets the pairing screen at / and 401-class refusals elsewhere", () => {
  assert.equal(decideWeb(web("GET", "/"), true), "pair-page");
  for (const path of ["/events", "/status", "/meetings", "/session/stop", "/device"]) {
    assert.equal(decideWeb(web("GET", path), true), "deny", path);
  }
  assert.equal(decideWeb(web("POST", "/session/stop"), true), "deny");
  assert.equal(decideWeb(web("POST", "/pair"), true), "pair");
});

test("with auth on, a paired browser reaches the routes", () => {
  assert.equal(decideWeb(web("GET", "/events", { paired: true }), true), "pass");
  assert.equal(decideWeb(web("POST", "/session/stop", { paired: true }), true), "pass");
});

test("with auth on, plain HTTP is redirected to HTTPS before anything else, paired or not", () => {
  assert.equal(decideWeb(web("GET", "/", { plainHttp: true }), true), "redirect-https");
  assert.equal(decideWeb(web("GET", "/events", { plainHttp: true, paired: true }), true), "redirect-https");
});

test("/health stays reachable with or without auth, and only for GET", () => {
  assert.equal(decideWeb(web("GET", "/health"), true), "health");
  assert.equal(decideWeb(web("GET", "/health"), false), "health");
  assert.equal(decideWeb(web("POST", "/health"), true), "deny");
});

test("with auth off nothing changes: every route passes", () => {
  for (const [method, path] of [["GET", "/"], ["GET", "/events"], ["POST", "/session/stop"], ["POST", "/pair"]]) {
    assert.equal(decideWeb(web(method, path, { plainHttp: true }), false), "pass", `${method} ${path}`);
  }
});

const up = (over: Partial<Parameters<typeof decideUpgrade>[0]> = {}) =>
  ({ path: "/device", plainHttp: false, deviceKnown: false, paired: false, ...over });

test("the /device upgrade is refused without a valid token or session when auth is on", () => {
  assert.equal(decideUpgrade(up(), "/device", true), 401);
  assert.equal(decideUpgrade(up({ deviceKnown: true }), "/device", true), 200);
  assert.equal(decideUpgrade(up({ paired: true }), "/device", true), 200);
});

test("the /device upgrade over plain HTTP gets 426 on a cloud hub, and other paths 404", () => {
  assert.equal(decideUpgrade(up({ plainHttp: true, deviceKnown: true }), "/device", true), 426);
  assert.equal(decideUpgrade(up({ path: "/other", deviceKnown: true }), "/device", true), 404);
  assert.equal(decideUpgrade(up({ path: undefined }), "/device", false), 404);
});

test("the /device upgrade with auth off is accepted as before", () => {
  assert.equal(decideUpgrade(up({ plainHttp: true }), "/device", false), 200);
});
