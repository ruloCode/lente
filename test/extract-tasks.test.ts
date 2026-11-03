// add-task-owners 1.4: the task backfill against the fake PostgREST, with a stub model. Synthetic text.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { extractTasks } from "../scripts/extract-tasks.ts";
import { Accounts } from "../src/accounts.ts";
import type { DigestCall } from "../src/digests.ts";
import { checkKekAtStart } from "../src/kek-check.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const OWNER = "aaaaaaaa-0000-4000-8000-0000000000aa";
const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 2);

test("the backfill reads recent meetings without tasks, newest first, and writes tasks with owners; a dry run calls nothing", async () => {
  const fake = fakePostgrest();
  const kek: Kek = { version: 1, key: randomBytes(32) };
  await checkKekAtStart([kek], supabaseCanaries(fake.rest));
  const accounts = new Accounts(new SupabaseAccounts(fake.rest), [kek], new Set(["owner@example.com"]));
  await accounts.admit(OWNER, "owner@example.com");
  const stores = await openUserStores(fake.rest, OWNER, await accounts.dek(OWNER));
  const notes = (summary: string) => ({ summary, decisions: [], commitments: [], openQuestions: [] });
  await stores.meetings.save({ id: "old", title: "old", startedAt: NOW - 90 * DAY, status: "done", turns: [], notes: notes("PROBE viejo") });
  await stores.meetings.save({ id: "m1", title: "m1", startedAt: NOW - 5 * DAY, status: "done", turns: [], notes: notes("PROBE uno") });
  await stores.meetings.save({ id: "m2", title: "m2", startedAt: NOW - 2 * DAY, status: "done", turns: [], notes: notes("PROBE dos") });
  await stores.meetings.save({ id: "m3", title: "m3", startedAt: NOW - DAY, status: "done", turns: [], notes: notes("PROBE tres") });
  await stores.tasks.add({ title: "ya existe", meetingId: "m3", evidence: [] }, NOW);

  const seen: string[] = [];
  const call: DigestCall = async (messages) => {
    const id = String(messages[1]!.content).match(/Reunión: «(\w+)»/)![1]!;
    seen.push(id);
    return JSON.stringify({ tasks: [{ title: `PROBE enviar ${id}`, who: "me", other: "", due: "" }, { title: `PROBE correo ${id}`, who: "lente", other: "", due: "" }, { title: `PROBE revisar ${id}`, who: "other", other: "Ana", due: "" }] });
  };
  const deps = { lente: fake.rest, keks: [kek], userIdFor: async () => OWNER, call, now: () => NOW };
  assert.deepEqual(await extractTasks("owner@example.com", deps, { days: 30, dryRun: true }), { meetings: 3, withoutTasks: 2, read: 0, tasks: { me: 0, lente: 0, other: 0 } });
  assert.deepEqual(seen, []);
  assert.deepEqual(await extractTasks("owner@example.com", deps, { days: 30, dryRun: false }), { meetings: 3, withoutTasks: 2, read: 2, tasks: { me: 2, lente: 2, other: 2 } });
  assert.deepEqual(seen, ["m2", "m1"], "newest first, within the window, skipping meetings that have tasks");
  const tasks = await stores.tasks.list();
  assert.deepEqual(tasks.filter((t) => t.meetingId === "m2").map((t) => [t.who, t.otherName ?? null, t.source]), [["me", null, "meeting"], ["lente", null, "meeting"], ["other", "Ana", "meeting"]]);
  assert.ok(!fake.dump().includes("PROBE enviar"), "tasks stay sealed");
  assert.equal((await extractTasks("owner@example.com", deps, { days: 30, dryRun: false })).withoutTasks, 0, "a second run adds nothing");

  // --redo: open extracted tasks are written again; a finished one and one the extraction did not write stay.
  const doneOne = (await stores.tasks.list()).find((t) => t.meetingId === "m2" && t.who === "me")!;
  await stores.tasks.setDone(doneOne.id, true);
  const redo = await extractTasks("owner@example.com", deps, { days: 30, dryRun: false, redo: true });
  assert.equal(redo.read, 3, "every meeting in the window is read again");
  const after = await stores.tasks.list();
  assert.ok(after.some((t) => t.id === doneOne.id && t.done), "a finished task stays");
  assert.equal(after.filter((t) => t.title === "ya existe").length, 1, "a task the extraction did not write stays, once");
  assert.deepEqual(after.filter((t) => t.meetingId === "m2").map((t) => [t.who, t.done]).sort(), [["lente", false], ["me", true], ["other", false]], "m2 keeps its finished task and gets the others back, without a duplicate");
  assert.equal(after.filter((t) => t.meetingId === "m1").length, 3, "m1's tasks were extracted again, not duplicated");
});
