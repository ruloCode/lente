import assert from "node:assert/strict";
import { test } from "node:test";
import { decideUpgrade, decideWeb } from "../src/access-gate.ts";

const web = (method: string, path: string, over: { plainHttp?: boolean; identified?: boolean } = {}) =>
  ({ method, path, plainHttp: false, identified: false, ...over });

test("pairing mode: an unpaired browser gets the pairing screen at / and 401-class refusals elsewhere", () => {
  assert.equal(decideWeb(web("GET", "/"), "pairing"), "pair-page");
  for (const path of ["/events", "/status", "/meetings", "/session/stop", "/device", "/auth/google"]) {
    assert.equal(decideWeb(web("GET", path), "pairing"), "deny", path);
  }
  assert.equal(decideWeb(web("POST", "/session/stop"), "pairing"), "deny");
  assert.equal(decideWeb(web("POST", "/pair"), "pairing"), "pair");
});

test("pairing and accounts modes: an identified caller reaches the routes", () => {
  for (const mode of ["pairing", "accounts"] as const) {
    assert.equal(decideWeb(web("GET", "/events", { identified: true }), mode), "pass");
    assert.equal(decideWeb(web("POST", "/session/stop", { identified: true }), mode), "pass");
  }
});

test("accounts mode: no pairing; / shows sign-in, the two sign-in routes are open, everything else is 401", () => {
  assert.equal(decideWeb(web("GET", "/"), "accounts"), "signin-page");
  assert.equal(decideWeb(web("GET", "/auth/google"), "accounts"), "auth");
  assert.equal(decideWeb(web("GET", "/auth/callback"), "accounts"), "auth");
  assert.equal(decideWeb(web("POST", "/pair"), "accounts"), "deny");
  for (const path of ["/events", "/status", "/meetings", "/devices", "/account/export", "/auth/signout"]) {
    assert.equal(decideWeb(web("GET", path), "accounts"), "deny", path);
  }
});

test("pairing and accounts modes: plain HTTP is redirected to HTTPS before anything else, identified or not", () => {
  for (const mode of ["pairing", "accounts"] as const) {
    assert.equal(decideWeb(web("GET", "/", { plainHttp: true }), mode), "redirect-https");
    assert.equal(decideWeb(web("GET", "/events", { plainHttp: true, identified: true }), mode), "redirect-https");
  }
});

test("/health stays reachable in every mode, and only for GET", () => {
  for (const mode of ["open", "pairing", "accounts"] as const) assert.equal(decideWeb(web("GET", "/health"), mode), "health");
  assert.equal(decideWeb(web("POST", "/health"), "pairing"), "deny");
  assert.equal(decideWeb(web("POST", "/health"), "accounts"), "deny");
});

test("open mode (laptop) changes nothing: every route passes", () => {
  for (const [method, path] of [["GET", "/"], ["GET", "/events"], ["POST", "/session/stop"], ["POST", "/pair"]]) {
    assert.equal(decideWeb(web(method, path, { plainHttp: true }), "open"), "pass", `${method} ${path}`);
  }
});

const up = (over: Partial<Parameters<typeof decideUpgrade>[0]> = {}) => ({ path: "/device", plainHttp: false, identified: false, ...over });

test("the /device upgrade is refused unless the caller resolved to someone", () => {
  for (const mode of ["pairing", "accounts"] as const) {
    assert.equal(decideUpgrade(up(), "/device", mode), 401);
    assert.equal(decideUpgrade(up({ identified: true }), "/device", mode), 200);
  }
});

test("the /device upgrade over plain HTTP gets 426 on a cloud hub, and other paths 404", () => {
  assert.equal(decideUpgrade(up({ plainHttp: true, identified: true }), "/device", "pairing"), 426);
  assert.equal(decideUpgrade(up({ plainHttp: true, identified: true }), "/device", "accounts"), 426);
  assert.equal(decideUpgrade(up({ path: "/other", identified: true }), "/device", "accounts"), 404);
  assert.equal(decideUpgrade(up({ path: undefined }), "/device", "open"), 404);
});

test("the /device upgrade in open mode is accepted as before", () => {
  assert.equal(decideUpgrade(up({ plainHttp: true }), "/device", "open"), 200);
});

test("the desktop web app (add-web-desktop): its shell, modules and session answer are open in every mode, over TLS on a cloud hub", () => {
  for (const mode of ["open", "pairing", "accounts"] as const) {
    for (const path of ["/app", "/app/", "/app/main.js", "/app/reuniones/m1", "/app/session"]) {
      assert.equal(decideWeb(web("GET", path), mode), "app", `${mode} ${path}`);
      assert.equal(decideWeb(web("GET", path, { identified: true }), mode), "app", `${mode} ${path} identified`);
    }
    assert.notEqual(decideWeb(web("POST", "/app/session"), mode), "app", "only GET");
    assert.notEqual(decideWeb(web("GET", "/apple"), mode), "app", "a prefix is not the app");
  }
  assert.equal(decideWeb(web("GET", "/app", { plainHttp: true }), "accounts"), "redirect-https");
});
