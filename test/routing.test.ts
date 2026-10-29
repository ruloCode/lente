import { test } from "node:test";
import assert from "node:assert/strict";
import { COOLDOWN_MS, RoutePolicy } from "../src/routing.ts";

const routes = [
  { id: "open", configured: true },
  { id: "fireworks", configured: false },
  { id: "spark", configured: true },
];

function policy() {
  const clock = { t: 1000 };
  return { clock, p: new RoutePolicy(() => clock.t) };
}

test("keeps the order and skips providers without a key", () => {
  const { p } = policy();
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["open", "spark"]);
});

test("three failures in a row cool a provider down for two minutes", () => {
  const { clock, p } = policy();
  p.failed("cue", "open");
  p.failed("cue", "open");
  assert.equal(p.pick("cue", routes)[0].id, "open");
  p.failed("cue", "open");
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["spark"]);
  clock.t += COOLDOWN_MS - 1;
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["spark"]);
  clock.t += 1;
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["open", "spark"]);
});

test("a success resets the strikes", () => {
  const { p } = policy();
  p.failed("cue", "open");
  p.failed("cue", "open");
  p.succeeded("cue", "open");
  p.failed("cue", "open");
  assert.equal(p.pick("cue", routes)[0].id, "open");
});

test("cool-down is per job and starts fresh afterwards", () => {
  const { clock, p } = policy();
  for (let i = 0; i < 3; i++) p.failed("cue", "open");
  assert.equal(p.pick("summary", routes)[0].id, "open");
  clock.t += COOLDOWN_MS;
  p.failed("cue", "open");
  assert.equal(p.pick("cue", routes)[0].id, "open");
});

test("the last-resort route never cools down", () => {
  const { p } = policy();
  for (let i = 0; i < 3; i++) {
    p.failed("cue", "open");
    p.failed("cue", "spark");
  }
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["spark"]);
  p.failed("cue", "spark");
  assert.deepEqual(p.pick("cue", routes).map((r) => r.id), ["spark"]);
});
