import assert from "node:assert/strict";
import { test } from "node:test";
import { IDLE_PAUSE_MIN, IdleWatch } from "../src/idle-pause.ts";

const MIN = 60_000;
const T0 = new Date(2026, 9, 28, 9, 0).getTime();
const alone = { wearerKnown: true, meetingOpen: false };

test("idle: pauses after the default minutes with the wearer silent", () => {
  const idle = new IdleWatch();
  idle.start(T0);
  idle.heard(T0 + 1 * MIN, true);
  assert.equal(idle.check(T0 + (IDLE_PAUSE_MIN + 1) * MIN - 1, alone), undefined);
  assert.deepEqual(idle.check(T0 + (IDLE_PAUSE_MIN + 1) * MIN, alone), { basis: "wearer", silentMs: IDLE_PAUSE_MIN * MIN });
});

test("idle: a TV talking does not keep it listening once the wearer is known", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  for (let m = 0; m <= 20; m++) idle.heard(T0 + m * MIN, false);
  assert.deepEqual(idle.check(T0 + 20 * MIN, alone), { basis: "wearer", silentMs: 20 * MIN });
});

test("idle: with no wearer label it goes by anyone speaking", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.heard(T0 + 15 * MIN, false);
  const unknown = { wearerKnown: false, meetingOpen: false };
  assert.equal(idle.check(T0 + 30 * MIN, unknown), undefined);
  assert.deepEqual(idle.check(T0 + 35 * MIN, unknown), { basis: "anyone", silentMs: 20 * MIN });
});

test("idle: a meeting open keeps it listening", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  assert.equal(idle.check(T0 + 30 * MIN, { wearerKnown: true, meetingOpen: true }), undefined);
  assert.ok(idle.check(T0 + 30 * MIN, alone), "and pauses once it ends");
});

test("idle: silence counts from the start of listening, not from speech before a pause", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.heard(T0 + MIN, true);
  idle.start(T0 + 60 * MIN);
  assert.equal(idle.check(T0 + 79 * MIN, alone), undefined);
  assert.ok(idle.check(T0 + 80 * MIN, alone));
});

test("idle: a late report of the wearer's turn never moves time back", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.heard(T0 + 10 * MIN, true);
  idle.heard(T0 + 2 * MIN, true);
  assert.equal(idle.check(T0 + 29 * MIN, alone), undefined);
});

test("idle: the minutes are configurable", () => {
  const idle = new IdleWatch(5 * MIN);
  idle.start(T0);
  assert.deepEqual(idle.check(T0 + 5 * MIN, { wearerKnown: false, meetingOpen: false }), { basis: "anyone", silentMs: 5 * MIN });
});

test("idle: a wearer identified before a session reopen still decides, so a TV doesn't keep it listening", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.wearerIdentified();
  idle.heard(T0 + MIN, true);
  // The silence gate reopened the session: labels are gone, only the TV talks.
  const reopened = { wearerKnown: false, meetingOpen: false };
  for (let m = 2; m <= 21; m++) idle.heard(T0 + m * MIN, false);
  assert.equal(idle.check(T0 + 20 * MIN, reopened), undefined);
  assert.deepEqual(idle.check(T0 + 21 * MIN, reopened), { basis: "wearer", silentMs: 20 * MIN });
});

test("idle: a wearer identified without a turn of theirs yet counts from the start of listening", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.wearerIdentified();
  for (let m = 1; m <= 20; m++) idle.heard(T0 + m * MIN, false);
  assert.deepEqual(idle.check(T0 + 20 * MIN, { wearerKnown: false, meetingOpen: false }), { basis: "wearer", silentMs: 20 * MIN });
});

test("idle: starting to listen again forgets the wearer of the last run", () => {
  const idle = new IdleWatch(20 * MIN);
  idle.start(T0);
  idle.heard(T0 + MIN, true);
  idle.start(T0 + 60 * MIN);
  idle.heard(T0 + 75 * MIN, false);
  assert.equal(idle.check(T0 + 85 * MIN, { wearerKnown: false, meetingOpen: false }), undefined, "back to anyone speaking");
});
