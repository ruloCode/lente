// add-accounts 5.2: the nightly digests and the catch-up, driven by a clock. Synthetic data only.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DigestCall } from "../src/digests.ts";
import { CATCH_UP_DAYS, NIGHTLY_DELAY_MS, NightlyDigests, catchUp, localDay, msToLocalMidnight, planDigests } from "../src/nightly.ts";
import { FileDigestStore } from "../src/stores.ts";

const BOGOTA = "America/Bogota";
const answer: DigestCall = async (_m, _s, name) => JSON.stringify({ text: `resumen ${name}`, sources: [] });

function deps(calls: string[] = []) {
  const digests = new FileDigestStore(join(mkdtempSync(join(tmpdir(), "lente-nightly-")), "digests.json"));
  return {
    digests,
    loadDay: async (day: string) => {
      calls.push(day);
      return { meetings: [], entries: [{ at: Date.parse(`${day}T15:00:00Z`), kind: "summary" as const, text: `día ${day}` }] };
    },
    call: answer,
    now: () => Date.UTC(2026, 10, 1, 12),
  };
}

test("local day and time to midnight follow the user's time zone", () => {
  const at = Date.UTC(2026, 10, 2, 3, 30); // 22:30 on Nov 1 in Bogotá (UTC−5)
  assert.equal(localDay(at, BOGOTA), "2026-11-01");
  assert.equal(localDay(at, "UTC"), "2026-11-02");
  assert.equal(msToLocalMidnight(at, BOGOTA), 90 * 60 * 1000);
});

test("the plan: past days with data and no digest, then finished weeks and months", () => {
  const plan = planDigests({ today: "2026-11-03", daysWithData: ["2026-10-30", "2026-11-01", "2026-11-02", "2026-11-03"], existing: ["day:2026-10-30"] });
  assert.deepEqual(plan, [
    { scope: "day", day: "2026-11-01" },
    { scope: "day", day: "2026-11-02" },
    { scope: "week", periodStart: "2026-10-26" },
    { scope: "month", periodStart: "2026-10-01" },
  ]);
});

test("today is never digested, weeks still running are not rolled up, and nothing is planned twice", () => {
  assert.deepEqual(planDigests({ today: "2026-11-04", daysWithData: ["2026-11-04"], existing: [] }), []);
  assert.deepEqual(planDigests({ today: "2026-11-04", daysWithData: ["2026-11-03"], existing: ["day:2026-11-03"] }), []);
  assert.deepEqual(planDigests({ today: "2026-11-09", daysWithData: [], existing: ["day:2026-11-03", "week:2026-11-02"] }), []);
});

test("a long absence catches up at most 31 days", () => {
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10));
  const dayJobs = planDigests({ today: "2026-11-15", daysWithData: days, existing: [] }).filter((j) => j.scope === "day");
  assert.ok(dayJobs.length <= CATCH_UP_DAYS);
});

test("catch-up with a clock: the hub was down three nights, the next open writes those days and the week", async () => {
  const calls: string[] = [];
  const d = deps(calls);
  const written = await catchUp({ today: "2026-11-03", daysWithData: ["2026-10-31", "2026-11-01", "2026-11-02"] }, d);
  assert.deepEqual(written, ["day:2026-10-31", "day:2026-11-01", "day:2026-11-02", "week:2026-10-26", "month:2026-10-01"]);
  assert.deepEqual(calls, ["2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(await catchUp({ today: "2026-11-03", daysWithData: ["2026-10-31", "2026-11-01", "2026-11-02"] }, d), [], "a second open writes nothing");
});

test("a failing model call stops the run; the next open picks up where it stopped", async () => {
  const d = deps();
  let budget = 1;
  const flaky: DigestCall = async (...args) => {
    if (budget-- <= 0) throw new Error("model unreachable");
    return answer(...args);
  };
  await assert.rejects(catchUp({ today: "2026-11-03", daysWithData: ["2026-11-01", "2026-11-02"] }, { ...d, call: flaky }), /unreachable/);
  // Nov 1 was written before the failure; Nov 2 is next, then the week of Oct 26, which ended on Sunday Nov 1.
  assert.deepEqual(await catchUp({ today: "2026-11-03", daysWithData: ["2026-11-01", "2026-11-02"] }, d), ["day:2026-11-02", "week:2026-10-26"]);
});

test("the nightly timer runs once on start (catch-up) and again after each local midnight", async () => {
  let now = Date.UTC(2026, 11, 1, 3, 0); // 22:00 Nov 30 in Bogotá
  const armed: { fn: () => void; ms: number }[] = [];
  const nightly = new NightlyDigests(() => now, (fn, ms) => {
    armed.push({ fn, ms });
    return { clear: () => {} };
  });
  let runs = 0;
  nightly.start("u1", BOGOTA, async () => void runs++);
  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(armed[0]!.ms, 2 * 3600 * 1000 + NIGHTLY_DELAY_MS);
  now += armed[0]!.ms;
  armed[0]!.fn();
  await Promise.resolve();
  assert.equal(runs, 2);
  assert.equal(armed[1]!.ms, 24 * 3600 * 1000);
  assert.equal(nightly.active, 1);
  nightly.stop("u1");
  assert.equal(nightly.active, 0);
});

test("a local day starts at its own midnight in the user's time zone", async () => {
  const { localDayStart } = await import("../src/nightly.ts");
  assert.equal(new Date(localDayStart("2026-11-01", BOGOTA)).toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(new Date(localDayStart("2026-11-01", "UTC")).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(localDay(localDayStart("2026-11-01", BOGOTA), BOGOTA), "2026-11-01");
});

test("an import backfills past the catch-up window, while the nightly plan still stops at it (add-hermes-import 1.2)", () => {
  const old = "2026-03-10";
  assert.deepEqual(planDigests({ today: "2026-11-03", daysWithData: [old], existing: [] }), [], `the nightly plan ignores days older than ${CATCH_UP_DAYS}`);
  assert.deepEqual(planDigests({ today: "2026-11-03", daysWithData: [old], existing: [], reachDays: 400 }), [
    { scope: "day", day: old },
    { scope: "week", periodStart: "2026-03-09" },
    { scope: "month", periodStart: "2026-03-01" },
  ]);
});
