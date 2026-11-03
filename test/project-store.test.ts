// add-projects 1.2: the project store, the same checks on the file backend and on Supabase (fake
// PostgREST), plus the Supabase specifics: sealed names and links by meeting row. Synthetic names.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileProjects, type ProjectStore } from "../src/project-store.ts";
import { newDek } from "../src/seal.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const meeting = (id: string) => ({ id, title: "t", startedAt: Date.UTC(2026, 10, 1), status: "done" as const, turns: [] });

async function exercise(store: ProjectStore, addMeeting: (id: string) => Promise<void>) {
  await addMeeting("m1");
  await addMeeting("m2");
  const lente = await store.create("PROBE-PROJ Lente", 1000);
  const other = await store.create("PROBE-PROJ Otro", 2000);
  await store.assign("m1", lente.id);
  await store.assign("m2", other.id);
  assert.deepEqual([...(await store.assignments())].sort(), [["m1", lente.id], ["m2", other.id]]);
  assert.equal(await store.rename(lente.id, "PROBE-PROJ Lente app"), true);
  assert.equal(await store.merge(other.id, lente.id), 1);
  assert.deepEqual([...(await store.assignments())].sort(), [["m1", lente.id], ["m2", lente.id]]);
  assert.deepEqual((await store.list()).map((p) => [p.name, p.status]), [["PROBE-PROJ Lente app", "active"], ["PROBE-PROJ Otro", "archived"]]);
  assert.equal(await store.merge(lente.id, lente.id), 0);
  await store.assign("m2", null);
  assert.deepEqual([...(await store.assignments())], [["m1", lente.id]]);
  await assert.rejects(async () => store.assign("m1", "cccccccc-0000-4000-8000-000000000009"));
}

test("file backend: create, assign, rename, merge, unassign", async () => {
  const store = new FileProjects(join(mkdtempSync(join(tmpdir(), "lente-projects-")), "projects.json"));
  await exercise(store, async () => {});
});

test("Supabase backend: the same, with sealed names and another user's projects out of reach", async () => {
  const fake = fakePostgrest();
  const alice = await openUserStores(fake.rest, ALICE, newDek());
  await exercise(alice.projects, (id) => alice.meetings.save(meeting(id)));
  assert.ok(!fake.dump().includes("PROBE-PROJ"), "names are sealed");
  const bob = await openUserStores(fake.rest, BOB, newDek());
  assert.deepEqual(await bob.projects.list(), []);
  assert.deepEqual([...(await bob.projects.assignments())], []);
  const [aliceProject] = await alice.projects.list();
  assert.equal(await bob.projects.rename(aliceProject!.id, "x"), false, "Bob cannot rename Alice's project");
});
