import assert from "node:assert/strict";
import { test } from "node:test";
import { dayKey } from "../src/day-log.ts";
import { TRANSCRIBE_USD_PER_HOUR, UsageMeter, priceTokens } from "../src/usage-meter.ts";

const MORNING = new Date(2026, 9, 28, 9, 0).getTime();
const NEXT_DAY = new Date(2026, 9, 29, 0, 5).getTime();
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("usage: an hour of audio costs the list price", () => {
  const meter = new UsageMeter(undefined, MORNING);
  for (let i = 0; i < 45_000; i++) meter.addAudio(0.08, MORNING + i * 80);
  const today = meter.today(MORNING + 3_600_000);
  assert.equal(today.audioSeconds, 3600);
  close(today.usd, TRANSCRIBE_USD_PER_HOUR);
});

test("usage: tokens per model, cached input at the cached price", () => {
  const meter = new UsageMeter(undefined, MORNING);
  meter.addCall("muse-spark-1.3", { input: 2132, cached: 2033, output: 40 }, MORNING);
  meter.addCall("muse-spark-1.3", { input: 120, cached: 0, output: 12 }, MORNING);
  const today = meter.today(MORNING);
  assert.deepEqual(today.models["muse-spark-1.3"], { calls: 2, input: 2252, cached: 2033, output: 52 });
  close(today.usd, ((2252 - 2033) * 1.25 + 2033 * 0.15 + 52 * 4.25) / 1e6);
});

test("usage: a ten-minute meeting with two replies", () => {
  const meter = new UsageMeter(undefined, MORNING);
  meter.addAudio(600, MORNING);
  meter.addCall("muse-spark-1.3", { input: 1000, cached: 0, output: 30 }, MORNING);
  meter.addCall("muse-spark-1.3", { input: 1000, cached: 900, output: 30 }, MORNING);
  const today = meter.today(MORNING);
  close(today.usd, (600 / 3600) * 0.18 + (1100 * 1.25 + 900 * 0.15 + 60 * 4.25) / 1e6);
  assert.deepEqual(today.unpriced, []);
});

test("usage: a model with no list price is counted, not priced", () => {
  const meter = new UsageMeter(undefined, MORNING);
  meter.addCall("meta-models/muse-spark-open-1026", { input: 500, output: 20 }, MORNING);
  const today = meter.today(MORNING);
  assert.equal(today.usd, 0);
  assert.deepEqual(today.unpriced, ["meta-models/muse-spark-open-1026"]);
  assert.equal(priceTokens("unknown", { calls: 1, input: 1, cached: 0, output: 1 }), undefined);
});

test("usage: missing or bad counts add nothing", () => {
  const meter = new UsageMeter(undefined, MORNING);
  meter.addAudio(-5, MORNING);
  meter.addAudio(Number.NaN, MORNING);
  meter.addCall("muse-spark-1.3", {}, MORNING);
  assert.deepEqual(meter.snapshot(MORNING), { day: dayKey(MORNING), audioSeconds: 0, models: { "muse-spark-1.3": { calls: 1, input: 0, cached: 0, output: 0 } } });
});

test("usage: today's saved totals survive a restart, another day's do not, and the snapshot is numbers only", () => {
  const saved = { day: dayKey(MORNING), audioSeconds: 90, models: { "muse-spark-1.3": { calls: 3, input: 3000, cached: 1000, output: 90 } } };
  const meter = new UsageMeter(saved, MORNING + 60_000);
  assert.deepEqual(meter.snapshot(MORNING + 60_000), saved);
  assert.equal(new UsageMeter({ ...saved, day: "2026-10-27" }, MORNING).snapshot(MORNING).audioSeconds, 0);
  const leaves = (v: unknown): unknown[] => (v && typeof v === "object" ? Object.values(v).flatMap(leaves) : [v]);
  const { day: _day, ...counts } = meter.snapshot(MORNING);
  assert.ok(leaves(counts).every((v) => typeof v === "number"));
});

test("usage: a new local day starts from zero", () => {
  const meter = new UsageMeter(undefined, MORNING);
  meter.addAudio(30, MORNING);
  meter.addCall("muse-spark-1.3", { input: 100, output: 10 }, MORNING);
  assert.deepEqual(meter.snapshot(NEXT_DAY), { day: dayKey(NEXT_DAY), audioSeconds: 0, models: {} });
});
