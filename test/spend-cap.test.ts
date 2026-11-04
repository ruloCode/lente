import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LIMIT_MESSAGES, MeterDelta, SpendCapError, SpendLedger, capCheck, cappedRoute, dayIn, parseCapUsd } from "../src/spend-cap.ts";
import { FileDaySpend } from "../src/stores.ts";
import { SupabaseDaySpend, SupabaseUsage } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const caps = { userCapUsd: 1, globalCapUsd: 12, isOwner: false };
const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";

test("capCheck: the user's cap first, then everyone's; the owner is never capped", () => {
  assert.equal(capCheck({ ...caps, userTodayUsd: 0.99, allTodayUsd: 11.99 }), "ok");
  assert.deepEqual(capCheck({ ...caps, userTodayUsd: 1, allTodayUsd: 3 }), { blocked: "user" });
  assert.deepEqual(capCheck({ ...caps, userTodayUsd: 1.2, allTodayUsd: 12 }), { blocked: "user" });
  assert.deepEqual(capCheck({ ...caps, userTodayUsd: 0.1, allTodayUsd: 12 }), { blocked: "global" });
  assert.equal(capCheck({ ...caps, isOwner: true, userTodayUsd: 40, allTodayUsd: 400 }), "ok");
});

test("the limit lines are short Spanish, and the error carries them", () => {
  assert.equal(LIMIT_MESSAGES.user, "Por hoy llegaste al límite de la prueba. Vuelve mañana.");
  assert.equal(LIMIT_MESSAGES.global, "La demo llegó a su límite de hoy. Vuelve mañana.");
  const e = new SpendCapError("global");
  assert.equal(e.message, LIMIT_MESSAGES.global);
  assert.equal(e.blocked, "global");
});

test("the day turns at midnight in Bogotá, not UTC", () => {
  assert.equal(dayIn(Date.parse("2026-11-04T23:59:00-05:00")), "2026-11-04");
  assert.equal(dayIn(Date.parse("2026-11-05T04:59:00Z")), "2026-11-04");
  assert.equal(dayIn(Date.parse("2026-11-05T05:00:00Z")), "2026-11-05");
});

test("the ledger sums per user and in all, and starts over the next day in Bogotá", () => {
  const evening = Date.parse("2026-11-04T20:00:00-05:00");
  const ledger = new SpendLedger({ day: "2026-11-04", users: { [ALICE]: 0.4 } }, evening);
  ledger.add(ALICE, 0.25, evening);
  ledger.add(BOB, 0.1, evening);
  ledger.add(BOB, -5, evening);
  ledger.add(BOB, Number.NaN, evening);
  assert.equal(ledger.user(ALICE, evening), 0.65);
  assert.ok(Math.abs(ledger.all(evening) - 0.75) < 1e-9);
  // 19:30 in Bogotá is already the next day in UTC: still the same day for the caps.
  assert.equal(ledger.user(ALICE, Date.parse("2026-11-05T01:00:00Z")), 0.65);
  const nextDay = Date.parse("2026-11-05T00:01:00-05:00");
  assert.equal(ledger.user(ALICE, nextDay), 0);
  assert.equal(ledger.all(nextDay), 0);
  assert.deepEqual(new SpendLedger({ day: "2026-11-03", users: { [ALICE]: 3 } }, evening).snapshot(evening), { day: "2026-11-04", users: {} });
});

test("a meter's running total becomes new spend; a lower total is a meter that rolled over", () => {
  const d = new MeterDelta(0.5);
  assert.equal(d.next(0.5), 0);
  assert.ok(Math.abs(d.next(0.75) - 0.25) < 1e-9);
  assert.equal(d.next(0.1), 0.1);
});

test("caps from the environment: a number ≥ 0, else the default", () => {
  assert.equal(parseCapUsd(undefined, 1), 1);
  assert.equal(parseCapUsd("", 1), 1);
  assert.equal(parseCapUsd("2.50", 1), 2.5);
  assert.equal(parseCapUsd("0", 1), 0);
  assert.equal(parseCapUsd("-1", 1), 1);
  assert.equal(parseCapUsd("mucho", 12), 12);
});

test("the routes that would spend", () => {
  assert.equal(cappedRoute("POST", "/ask"), "ask");
  assert.equal(cappedRoute("POST", "/listen/on"), "listen");
  assert.equal(cappedRoute("POST", "/tts"), "tts");
  for (const path of ["/help", "/briefing", "/look", "/summary", "/live/on"]) assert.equal(cappedRoute("POST", path), "model", path);
  for (const [method, path] of [["GET", "/ask"], ["POST", "/listen/off"], ["POST", "/meeting/end"], ["GET", "/tasks"]] as const) assert.equal(cappedRoute(method, path), undefined, `${method} ${path}`);
});

test("usage_daily on the fake PostgREST: each runtime's rows read back as every account's spend today, transcription priced by the second", async () => {
  const fake = fakePostgrest();
  await new SupabaseUsage(fake.rest.forUser(ALICE)).save({ day: "2026-11-04", audioSeconds: 3600, models: { "muse-spark-1.3": { calls: 2, input: 1_000_000, cached: 0, output: 0 } } });
  await new SupabaseUsage(fake.rest.forUser(BOB)).save({ day: "2026-11-04", audioSeconds: 0, models: { "muse-spark-1.3": { calls: 1, input: 0, cached: 0, output: 1_000_000 } } });
  await new SupabaseUsage(fake.rest.forUser(BOB)).save({ day: "2026-11-03", audioSeconds: 7200, models: {} });
  const transcription = fake.tables.get("usage_daily")!.find((r) => r.user_id === ALICE && r.model === "transcription");
  assert.equal(transcription!.cost_micro_usd, 180_000, "the transcription row carries its cost");
  // A row written before transcription carried a cost is still priced from its seconds.
  transcription!.cost_micro_usd = 0;
  const spent = await new SupabaseDaySpend(fake.rest).load("2026-11-04");
  assert.deepEqual(Object.keys(spent).sort(), [ALICE, BOB]);
  assert.ok(Math.abs(spent[ALICE]! - (0.18 + 1.25)) < 1e-9);
  assert.ok(Math.abs(spent[BOB]! - 4.25) < 1e-9);
  const read = fake.requests.at(-1)!;
  assert.equal(read.table, "usage_daily");
  assert.equal(read.search.get("day"), "eq.2026-11-04");
  assert.equal(read.search.get("select"), "user_id,model,audio_seconds,cost_micro_usd", "numbers only");
  // A restart: the ledger opened from what was read holds the caps.
  const ledger = new SpendLedger({ day: "2026-11-04", users: spent }, Date.parse("2026-11-04T12:00:00-05:00"));
  assert.deepEqual(capCheck({ ...caps, userTodayUsd: ledger.user(BOB, Date.parse("2026-11-04T12:00:00-05:00")), allTodayUsd: 0 }), { blocked: "user" });
});

test("the laptop hub's file keeps the day's spend across a restart, and forgets another day's", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "lente-spend-")), "usage-daily.json");
  const store = new FileDaySpend(file);
  assert.deepEqual(await store.load("2026-11-04"), {});
  await store.save({ day: "2026-11-04", users: { [ALICE]: 0.3 } });
  assert.deepEqual(await new FileDaySpend(file).load("2026-11-04"), { [ALICE]: 0.3 });
  assert.deepEqual(await new FileDaySpend(file).load("2026-11-05"), {});
});
