import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionClock, connectEvents } from "../src/live-session.ts";

const T0 = Date.UTC(2026, 9, 28, 15, 0, 0);

test("session: no session until it first runs", () => {
  const clock = new SessionClock();
  assert.equal(clock.view(T0), null);
  clock.hold(T0);
  assert.equal(clock.view(T0), null);
});

test("session: listening time counts while running and stops while held", () => {
  const clock = new SessionClock();
  clock.run(T0);
  assert.deepEqual(clock.view(T0 + 30_000), { startedAt: T0, listenedMs: 30_000, running: true });
  clock.hold(T0 + 30_000);
  assert.deepEqual(clock.view(T0 + 90_000), { startedAt: T0, listenedMs: 30_000, running: false });
  clock.run(T0 + 90_000);
  assert.deepEqual(clock.view(T0 + 100_000), { startedAt: T0, listenedMs: 40_000, running: true });
});

test("session: run and hold are idempotent", () => {
  const clock = new SessionClock();
  clock.run(T0);
  clock.run(T0 + 5000);
  clock.hold(T0 + 10_000);
  clock.hold(T0 + 20_000);
  assert.equal(clock.view(T0 + 30_000)!.listenedMs, 10_000);
});

test("session: two views of one session agree, whenever each phone connected", () => {
  const clock = new SessionClock();
  clock.run(T0);
  // A phone that connected at 10 s and has counted 50 s on its own clock, against one connecting at 60 s.
  const early = clock.view(T0 + 10_000)!.listenedMs + 50_000;
  const late = clock.view(T0 + 60_000)!.listenedMs;
  assert.equal(early, late);
});

test("session: ending it starts the next one fresh", () => {
  const clock = new SessionClock();
  clock.run(T0);
  clock.end(T0 + 60_000);
  assert.equal(clock.view(T0 + 70_000), null);
  clock.run(T0 + 120_000);
  assert.deepEqual(clock.view(T0 + 125_000), { startedAt: T0 + 120_000, listenedMs: 5000, running: true });
});

test("connect: status, history, then the partial in progress, then the rest", () => {
  const events = connectEvents({ status: { kind: "status" }, history: [{ kind: "turn", text: "Hi." }], partial: "Can we", listening: true, rest: [{ kind: "meetings" }] });
  assert.deepEqual(events.map((e) => (e as { kind: string }).kind), ["status", "history", "partial", "meetings"]);
  assert.deepEqual(events[2], { kind: "partial", text: "Can we" });
});

test("connect: no partial while paused or when nobody is speaking", () => {
  const kinds = (partial: string, listening: boolean) => connectEvents({ status: { kind: "status" }, history: [], partial, listening, rest: [] }).map((e) => (e as { kind: string }).kind);
  assert.deepEqual(kinds("Can we", false), ["status", "history"]);
  assert.deepEqual(kinds("", true), ["status", "history"]);
});
