// add-projects 1.4: the backfill against the fake PostgREST, with a stub model. Synthetic names.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { assignProjects } from "../scripts/assign-projects.ts";
import { Accounts } from "../src/accounts.ts";
import type { DigestCall } from "../src/digests.ts";
import { checkKekAtStart } from "../src/kek-check.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const OWNER = "aaaaaaaa-0000-4000-8000-0000000000aa";

test("the backfill goes oldest first, reuses projects it opened, skips what has a project, and a dry run calls nothing", async () => {
  const fake = fakePostgrest();
  const kek: Kek = { version: 1, key: randomBytes(32) };
  await checkKekAtStart([kek], supabaseCanaries(fake.rest));
  const accounts = new Accounts(new SupabaseAccounts(fake.rest), [kek], new Set(["owner@example.com"]));
  await accounts.admit(OWNER, "owner@example.com");
  const stores = await openUserStores(fake.rest, OWNER, await accounts.dek(OWNER));
  const notes = (summary: string) => ({ summary, decisions: [], commitments: [], openQuestions: [] });
  for (const [id, at, summary] of [["m3", 3, "PROBE Beta otra vez"], ["m1", 1, "PROBE Beta arranca"], ["m2", 2, "Charla suelta"]] as const) {
    await stores.meetings.save({ id, title: id, startedAt: at * 1000, status: "done", turns: [], notes: notes(summary) });
  }
  await stores.meetings.save({ id: "m0", title: "running", startedAt: 0, status: "running", turns: [] });

  const seen: string[] = [];
  const call: DigestCall = async (messages) => {
    const input = String(messages[1]!.content);
    seen.push(input.match(/Reunión: «(m\d)»/)![1]!);
    if (input.includes("Charla suelta")) return '{"choice":"none","project":"","name":""}';
    return input.includes("P1: PROBE Beta") ? '{"choice":"existing","project":"P1","name":""}' : '{"choice":"new","project":"","name":"PROBE Beta"}';
  };
  const deps = { lente: fake.rest, keks: [kek], userIdFor: async () => OWNER, call, now: () => 5000 };
  assert.deepEqual(await assignProjects("owner@example.com", deps, true), { meetings: 3, unassigned: 3, assigned: 0, none: 0, newProjects: 0 });
  assert.deepEqual(seen, [], "a dry run calls no model");
  assert.deepEqual(await assignProjects("owner@example.com", deps, false), { meetings: 3, unassigned: 3, assigned: 2, none: 1, newProjects: 1 });
  assert.deepEqual(seen, ["m1", "m2", "m3"], "oldest first");
  const [beta] = await stores.projects.list();
  assert.deepEqual([...(await stores.projects.assignments())].sort(), [["m1", beta!.id], ["m3", beta!.id]]);
  assert.ok(!fake.dump().includes("PROBE Beta"), "the project name is sealed");
  const again = await assignProjects("owner@example.com", deps, false);
  assert.deepEqual([again.unassigned, again.newProjects], [1, 0], "only the left-out meeting is asked again");
});

test("without a Lente account the backfill stops before anything", async () => {
  const fake = fakePostgrest();
  await assert.rejects(assignProjects("x@example.com", { lente: fake.rest, keks: [{ version: 1, key: randomBytes(32) }], userIdFor: async () => undefined, call: async () => "", now: () => 0 }, true), /no Lente account yet/);
});
