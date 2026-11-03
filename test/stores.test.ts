// add-accounts 4.1: today's file stores satisfy the store interfaces as they are, so the Supabase
// stores can stand in for them. The assignments below are checked by `pnpm typecheck`; the tests
// run each file store through its interface.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ActionStore } from "../src/action-store.ts";
import { TraceWriter } from "../src/agent-trace.ts";
import { TaskStore } from "../src/agent-tools.ts";
import { DayLog } from "../src/day-log.ts";
import { FactStore } from "../src/fact-store.ts";
import { LanguageStore } from "../src/language-store.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { ProfileStore } from "../src/profile.ts";
import { type Actions, type DayRecord, type DeviceStore, type Facts, FileUsageStore, type Language, type Meetings, type Profile, type Tasks, type Traces, type UsageStore } from "../src/stores.ts";
import { UsageMeter } from "../src/usage-meter.ts";
import { FileDeviceStore } from "../src/user-devices.ts";

const dir = () => mkdtempSync(join(tmpdir(), "lente-stores-"));

function fileBackend(root: string) {
  return {
    meetings: new MeetingStore(join(root, "meetings")) satisfies Meetings,
    day: new DayLog(join(root, "days")) satisfies DayRecord,
    facts: new FactStore(join(root, "facts.json")) satisfies Facts,
    tasks: new TaskStore(join(root, "tasks.json")) satisfies Tasks,
    actions: new ActionStore(join(root, "actions.json")) satisfies Actions,
    traces: new TraceWriter(join(root, "traces")) satisfies Traces,
    profile: new ProfileStore(join(root, "profile.json")) satisfies Profile,
    language: new LanguageStore(join(root, "language.json")) satisfies Language,
    usage: new FileUsageStore(join(root, "usage.json")) satisfies UsageStore,
    devices: new FileDeviceStore(join(root, "user-devices.json")) satisfies DeviceStore,
  };
}

test("every file store is usable through its interface (awaited, as the Supabase stores will be)", async () => {
  const s = fileBackend(dir());
  const meetings: Meetings = s.meetings;
  assert.deepEqual(await meetings.list(), []);
  assert.equal(await meetings.uniqueId("m20261101120000"), "m20261101120000");
  assert.equal(await meetings.deleteAll(), 0);

  const day: DayRecord = s.day;
  await day.add({ kind: "cue", at: Date.now(), text: "synthetic" } as never);
  assert.equal(day.entries.length, 1);
  assert.equal((await day.recent(1)).length, 1);

  const tasks: Tasks = s.tasks;
  const task = await tasks.add({ title: "synthetic task", meetingId: "m20261101120000" } as never, 1);
  assert.equal((await tasks.setDone(task.id, true))?.done, true);

  const facts: Facts = s.facts;
  assert.deepEqual(await facts.list(), []);
  const actions: Actions = s.actions;
  assert.equal(await actions.get("none"), undefined);
  const traces: Traces = s.traces;
  assert.deepEqual(await traces.read("m20261101120000"), []);

  const profile: Profile = s.profile;
  profile.setAssistMode("record");
  assert.equal(profile.assistMode, "record");
  const language: Language = s.language;
  language.set([]);
  assert.deepEqual(language.glossary, []);
});

test("the usage file store round-trips today's snapshot", async () => {
  const usage: UsageStore = new FileUsageStore(join(dir(), "usage.json"));
  assert.equal(await usage.load(), undefined);
  const meter = new UsageMeter(undefined);
  meter.addAudio(12);
  await usage.save(meter.snapshot());
  assert.equal(new UsageMeter(await usage.load()).snapshot().audioSeconds, 12);
});
