// add-accounts 4.3: the Supabase stores against a fake PostgREST. Everything written is synthetic;
// the probes below must never reach the database in the clear, in text or in hex.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { Accounts, parseAllowList } from "../src/accounts.ts";
import { checkKekAtStart } from "../src/kek-check.ts";
import type { Meeting } from "../src/meetings.ts";
import { newDek, parseKek } from "../src/seal.ts";
import { SupabaseAccounts, SupabaseDevices, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { UserDevices } from "../src/user-devices.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const NOW = Date.UTC(2026, 10, 1, 15);

const PROBES = ["PROBE-TURN-zanahoria", "PROBE-SPEAKER-Ximena", "PROBE-TITLE-cohete", "PROBE-NOTE-acuerdo", "PROBE-DAY-murcielago", "PROBE-FACT-girasol", "PROBE-TASK-tortuga", "PROBE-ACTION-correo", "PROBE-TRACE-pensando", "PROBE-NAME-Rulo", "PROBE-GLOSS-backlog", "PROBE-ERROR-timeout", "PROBE-OUTCOME-enviado"];

function assertNoPlaintext(dump: string): void {
  for (const p of PROBES) {
    assert.ok(!dump.includes(p), `${p} reached the database in the clear`);
    assert.ok(!dump.includes(Buffer.from(p).toString("hex")), `${p} reached the database as hex`);
  }
}

const meeting = (): Meeting => ({
  id: "m20261101150000",
  title: PROBES[2]!,
  startedAt: NOW,
  status: "running",
  turns: [
    { id: "t1", at: NOW + 1000, speaker: PROBES[1], text: `${PROBES[0]} uno` },
    { id: "t2", at: NOW + 2000, wearer: true, addressed: true, startAt: NOW + 1500, text: "dos" },
  ],
});

test("meetings round-trip with their turns and notes, and only ciphertext reaches the content columns", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const m = meeting();
  await s.meetings.save(m);
  m.turns.push({ id: "t3", at: NOW + 3000, text: "tres" });
  m.status = "done";
  m.endedAt = NOW + 4000;
  m.endReason = "manual";
  m.error = PROBES[11];
  m.notes = { summary: PROBES[3]!, decisions: [{ text: "d", evidence: ["t1"] }], commitments: [], openQuestions: [] };
  m.stats = { asked: 2, answered: 1 };
  const saves = () => fake.requests.filter((r) => r.table === "rpc/lente_save_meeting");
  const savesBefore = saves().length;
  await s.meetings.save(m);
  assert.equal(savesBefore, 1);
  assert.equal(saves().length, 2, "each save is one transaction");
  assert.equal((saves().at(-1)!.body as { p_turns: unknown[] }).p_turns.length, 1, "a second save sends only the new turn");
  assert.ok(!fake.requests.some((r) => ["meetings", "meeting_turns", "meeting_notes"].includes(r.table) && r.method === "POST"), "no meeting row is written outside the transaction");

  const [listed] = await s.meetings.list();
  assert.deepEqual(listed, m);
  assertNoPlaintext(fake.dump());
  const row = fake.tables.get("meetings")![0]!;
  assert.equal(row.legacy_id, "m20261101150000");
  assert.equal(row.status, "done");
  assert.match(String(row.title_enc), /^\\x01/);
});

test("uniqueId, delete and deleteAll work on the legacy ids", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  await s.meetings.save(meeting());
  assert.equal(await s.meetings.uniqueId("m20261101150000"), "m20261101150000-2");
  assert.equal(await s.meetings.uniqueId("m20261101160000"), "m20261101160000");
  assert.equal(await s.meetings.delete("m20261101150000"), true);
  assert.equal(await s.meetings.delete("m20261101150000"), false);
  await s.meetings.save(meeting());
  assert.equal(await s.meetings.deleteAll(), 1);
  assert.deepEqual(await s.meetings.list(), []);
});

test("the day record keeps today in memory, reloads it, and reads earlier days on request", async () => {
  const fake = fakePostgrest();
  const dek = newDek();
  const s = await openUserStores(fake.rest, ALICE, dek, NOW);
  const yesterday = NOW - 24 * 3600 * 1000;
  await s.day.add({ at: yesterday, kind: "turn", text: `${PROBES[4]} ayer` });
  await s.day.add({ at: NOW, kind: "turn", text: `${PROBES[4]} hoy` });
  await s.day.add({ at: NOW + 1, kind: "summary", text: "resumen" });
  assert.equal(s.day.since(NOW).length, 2);
  const reopened = await openUserStores(fake.rest, ALICE, dek, NOW + 10);
  assert.deepEqual(reopened.day.entries.map((e) => e.at), [NOW, NOW + 1]);
  assert.deepEqual((await reopened.day.recent(2, NOW + 10)).map((e) => e.at), [yesterday, NOW, NOW + 1]);
  assertNoPlaintext(fake.dump());
});

test("facts: proposals skip known text, keep only from proposed, removal by meeting", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  await s.meetings.save(meeting());
  const added = await s.facts.propose("m20261101150000", [{ text: PROBES[5]!, evidence: ["t1"] }, { text: PROBES[5]!.toLowerCase(), evidence: [] }], NOW);
  assert.equal(added.length, 1);
  assert.equal((await s.facts.propose("m20261101150000", [{ text: PROBES[5]!, evidence: [] }], NOW)).length, 0);
  assert.ok(await s.facts.keep(added[0]!.id));
  assert.equal(await s.facts.keep(added[0]!.id), false);
  assert.deepEqual((await s.facts.list()).map((f) => [f.text, f.status, f.meetingId, f.evidence]), [[PROBES[5], "kept", "m20261101150000", ["t1"]]]);
  assert.equal(fake.tables.get("facts")![0]!.meeting_id, fake.tables.get("meetings")![0]!.id);
  assertNoPlaintext(fake.dump());
  assert.equal(await s.facts.removeMeeting("m20261101150000"), 1);
  assert.equal(await s.facts.keep("not-a-uuid"), false);
});

test("tasks and actions round-trip sealed, with status and outcome", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const task = await s.tasks.add({ title: PROBES[6]!, due: "viernes", meetingId: "m20261101150000", evidence: ["t2"] }, NOW);
  assert.equal((await s.tasks.setDone(task.id, true))?.done, true);
  assert.deepEqual(await s.tasks.list(), [{ ...task, done: true }]);

  const [action] = await s.actions.addAll("m20261101150000", [{ tool: "draft_email", args: { body: PROBES[7] }, evidence: ["t1"] }], NOW);
  await s.actions.save({ ...action!, status: "approved", decidedAt: NOW + 5, outcome: { sent: PROBES[12] } });
  assert.deepEqual(await s.actions.get(action!.id), { ...action!, status: "approved", decidedAt: NOW + 5, outcome: { sent: PROBES[12] } });
  assert.equal(fake.tables.get("agent_actions")![0]!.kind, "draft_email");
  assertNoPlaintext(fake.dump());
  assert.equal(await s.actions.removeMeeting("m20261101150000"), 1);
});

test("traces append per meeting and read back in order", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  await s.meetings.save(meeting());
  await s.traces.append("m20261101150000", [{ kind: "approval", at: NOW + 1, actionId: "a", tool: "x", decision: "approved", edited: false }, { kind: "action", at: NOW + 2, actionId: "a", tool: "x", ok: true, result: PROBES[8] }]);
  assert.deepEqual((await s.traces.read("m20261101150000")).map((e) => e.at), [NOW + 1, NOW + 2]);
  assertNoPlaintext(fake.dump());
  await s.traces.delete("m20261101150000");
  assert.deepEqual(await s.traces.read("m20261101150000"), []);
});

test("profile and glossary live in memory, are written behind, and reload sealed", async () => {
  const fake = fakePostgrest();
  const dek = newDek();
  await fake.rest.forUser(ALICE).insert("accounts", [{ locale: "es-CO" }]);
  const s = await openUserStores(fake.rest, ALICE, dek, NOW);
  s.profile.setNames(`${PROBES[9]}, Raúl`);
  s.profile.setAssistMode("record");
  s.profile.setNotifications({ readAt: NOW, prefs: { ...s.profile.notifications.prefs, hideContent: true } });
  s.language.set([{ term: PROBES[10]!, meaning: "lista de pendientes", sightings: [] }]);
  await s.flush();
  const reopened = await openUserStores(fake.rest, ALICE, dek, NOW);
  assert.deepEqual(reopened.profile.names, s.profile.names);
  assert.equal(reopened.profile.assistMode, "record");
  // add-notifications 1.2: the read mark and settings ride in the same sealed blob.
  assert.equal(reopened.profile.notifications.readAt, NOW);
  assert.equal(reopened.profile.notifications.prefs.hideContent, true);
  assert.equal(reopened.language.glossary[0]!.term, PROBES[10]);
  assert.equal(fake.tables.get("accounts")![0]!.assist_mode, "record");
  assertNoPlaintext(fake.dump());
});

test("usage numbers round-trip per model, priced", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const day = new Date(NOW).toISOString().slice(0, 10);
  await s.usage.save({ day, audioSeconds: 61.5, models: { "muse-spark-1.3": { calls: 3, input: 1000, cached: 200, output: 50 } } });
  const loaded = await s.usage.load(NOW);
  assert.equal(loaded?.audioSeconds, 61.5);
  assert.deepEqual(loaded?.models?.["muse-spark-1.3"], { calls: 3, input: 1000, cached: 200, output: 50 });
});

test("devices on Supabase: create, resolve across users by hash, revoke scoped to the owner", async () => {
  const fake = fakePostgrest();
  const devices = new UserDevices(new SupabaseDevices(fake.rest), () => NOW);
  const made = await devices.create(ALICE, "clip", "Clip");
  assert.deepEqual(await devices.resolve(made.token), { userId: ALICE, deviceId: made.id });
  assert.ok(!fake.dump().includes(made.token));
  assert.equal(await devices.revoke(BOB, made.id), false);
  assert.equal(await devices.revoke(ALICE, made.id), true);
  assert.equal(await devices.resolve(made.token), undefined);

  // An agent token keeps its scopes in the row (add-agent-bridge).
  const agent = await devices.create(ALICE, "mcp", "Claude Code", ["read", "tasks.write"]);
  assert.deepEqual(fake.tables.get("devices")!.find((r) => r.id === agent.id)!.scopes, ["read", "tasks.write"]);
  assert.deepEqual((await devices.resolveAgent(agent.token))?.scopes, ["read", "tasks.write"]);
  assert.equal(await devices.resolveAgent(made.token), undefined);
});

test("accounts and the KEK canary on Supabase: the wrapped key and canary open with the KEK only", async () => {
  const fake = fakePostgrest();
  const kek = parseKek(randomBytes(32).toString("base64"), 1);
  assert.deepEqual(await checkKekAtStart([kek], supabaseCanaries(fake.rest)), { 1: "created" });
  assert.deepEqual(await checkKekAtStart([kek], supabaseCanaries(fake.rest)), { 1: "ok" });
  await assert.rejects(checkKekAtStart([parseKek(randomBytes(32).toString("base64"), 1)], supabaseCanaries(fake.rest)), /canary/);
  const accounts = new Accounts(new SupabaseAccounts(fake.rest), [kek], parseAllowList("owner@example.com"));
  assert.deepEqual(await accounts.admit(ALICE, "owner@example.com"), { ok: true, created: true });
  const dek = Buffer.from(await accounts.dek(ALICE));
  const held = await accounts.dek(ALICE);
  accounts.forget(ALICE);
  assert.ok(held.every((b) => b === 0), "forgetting zeroes the key in memory");
  assert.deepEqual(await accounts.dek(ALICE), dek);
  assert.ok(!fake.dump().includes(dek.toString("hex")));
});

test("two users on one database: each sees only their own rows, and a row copied across does not open", async () => {
  const fake = fakePostgrest();
  const alice = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const bob = await openUserStores(fake.rest, BOB, newDek(), NOW);
  await alice.meetings.save(meeting());
  await alice.facts.propose("m20261101150000", [{ text: PROBES[5]!, evidence: [] }], NOW);
  assert.deepEqual(await bob.meetings.list(), []);
  assert.deepEqual(await bob.facts.list(), []);
  const stolen = { ...fake.tables.get("facts")![0]!, user_id: BOB };
  fake.tables.get("facts")!.push(stolen);
  await assert.rejects(bob.facts.list(), /does not open/);
  for (const r of fake.requests) {
    if (["devices", "kek_canaries", "sessions"].includes(r.table) && r.method === "GET") continue;
    const scoped = r.search.get("user_id")?.startsWith("eq.") || (Array.isArray(r.body) && r.body.every((row) => (row as { user_id?: string }).user_id)) || (r.table.startsWith("rpc/") && Boolean((r.body as { p_user_id?: string }).p_user_id));
    assert.ok(scoped || r.table === "kek_canaries", `${r.method} ${r.table} went out without a user`);
  }
});

test("atomic writes (4.4): a save that fails halfway leaves nothing, and an account never lands without its key", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const m = meeting();
  m.turns.push({ id: "t-bad", at: NOW, text: "x" });
  const db = fake.rest.forUser(ALICE);
  // A turn the database refuses (a negative seq) after a valid meeting row: the call fails whole.
  await assert.rejects(db.rpc("lente_save_meeting", { p_meeting: { id: "11111111-0000-4000-8000-000000000001", legacy_id: "m1", title_enc: "\\x01" }, p_turns: [{ meeting_id: "11111111-0000-4000-8000-000000000001", seq: -1, text_enc: "\\x01" }], p_notes: null }), /rpc\/lente_save_meeting/);
  assert.equal((fake.tables.get("meetings") ?? []).length, 0, "no meeting row without its turns");
  // Another user's meeting id is not taken over, and its turns are not written.
  await s.meetings.save(meeting());
  const theirs = fake.tables.get("meetings")![0]!.id;
  await assert.rejects(fake.rest.forUser(BOB).rpc("lente_save_meeting", { p_meeting: { id: theirs, legacy_id: "m2", title_enc: "\\x01" }, p_turns: [{ meeting_id: theirs, seq: 9, text_enc: "\\x01" }], p_notes: null }));
  assert.ok(fake.tables.get("meetings")!.every((r) => r.user_id === ALICE));
  assert.ok(!fake.tables.get("meeting_turns")!.some((r) => r.seq === 9));
  // An account with a malformed key is refused whole: no account row without a key row.
  await assert.rejects(fake.rest.forUser(BOB).rpc("lente_create_account", { p_kek_version: 1, p_wrapped_dek: "plain", p_locale: "es-CO", p_created_at: new Date(NOW).toISOString() }));
  assert.ok(!(fake.tables.get("accounts") ?? []).some((r) => r.user_id === BOB));
  await new SupabaseAccounts(fake.rest).create({ userId: BOB, createdAt: NOW, locale: "es-CO", kekVersion: 1, wrappedDek: randomBytes(60).toString("base64") });
  assert.equal(fake.requests.filter((r) => r.table === "rpc/lente_create_account").length, 2, "account creation is one call");
  assert.ok(!fake.requests.some((r) => ["accounts", "user_keys"].includes(r.table) && r.method === "POST"));
});
