// add-memory-engine 7.2: a runtime opens its memory index from snapshots. The hot months come from
// their snapshots and only what changed is replayed (a meeting with a new turn, the day record from the
// day it was built through); dirty shards are written back, clean ones are not; older months load when
// a question names a time in them, three at most, the least recently used dropped first (and written
// before it goes); a corrupt snapshot or one built with another encoder is rebuilt from the records.
// Synthetic PROBE- data, the laptop's file store and a fake clock.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DayEntry } from "../src/day-log.ts";
import type { Meeting } from "../src/meetings.ts";
import { COLD_SHARDS, RecallRuntime, type RecallRecords } from "../src/recall-runtime.ts";
import { FileSnapshots, type SnapshotRecord, type SnapshotStore } from "../src/stores.ts";
import { terms } from "../src/terms.ts";

const TZ = "America/Bogota";
const NOW = Date.parse("2026-11-05T15:00:00-05:00");
const DAY = 86_400_000;

const meeting = (id: string, at: number, word: string): Meeting => ({ id, title: `PROBE ${id}`, startedAt: at, endedAt: at + 120_000, status: "done", turns: [{ id: "t1", at: at + 30_000, speaker: "PROBE-Ana", text: `PROBE ${word} uno` }, { id: "t2", at: at + 60_000, speaker: "B", text: `PROBE ${word} dos` }] });

/** Meetings in November, October and September (hot) and in four older months (cold). */
function world() {
  const meetings = [
    meeting("m-nov", NOW - 2 * DAY, "noviembre"),
    meeting("m-oct", Date.parse("2026-10-10T10:00:00-05:00"), "octubre"),
    meeting("m-sep", Date.parse("2026-09-10T10:00:00-05:00"), "septiembre"),
    ...["2026-08", "2026-07", "2026-06", "2026-05"].map((k) => meeting(`m-${k}`, Date.parse(`${k}-10T10:00:00-05:00`), `mes${k.replace("-", "")}`)),
  ];
  const entries: DayEntry[] = [{ at: NOW - 3 * DAY, kind: "live", text: "PROBE pizarra vieja" }];
  const calls = { between: [] as [number, number][] };
  const records: RecallRecords = {
    meetings: () => meetings,
    assignments: () => new Map(),
    today: () => entries.filter((e) => e.at >= Date.parse("2026-11-05T00:00:00-05:00")),
    recent: () => entries,
    between: (from, to) => (calls.between.push([from, to]), entries.filter((e) => e.at >= from && e.at < to)),
    keptFacts: () => [],
  };
  return { meetings, entries, records, calls };
}

/** A store that counts writes and can be told to corrupt or rename the encoder of one shard. */
function counting(inner: SnapshotStore) {
  const puts: string[] = [];
  const store: SnapshotStore = { get: (s) => inner.get(s), put: (r: SnapshotRecord) => (puts.push(r.shard), inner.put(r)), list: () => inner.list(), remove: (s) => inner.remove(s) };
  return { store, puts };
}

const found = (rt: RecallRuntime, word: string) => rt.index.lexical(terms(word)).map((h) => h.unit.id);

test("open from snapshots: the hot months load, only the changed meeting and the newer days replay; clean shards are not rewritten", async () => {
  const w = world();
  const dir = join(mkdtempSync(join(tmpdir(), "lente-recall-snap-")), "memory");
  const first = counting(new FileSnapshots(dir));
  let clock = NOW;
  const a = new RecallRuntime(w.records, TZ, () => clock, { snapshots: first.store });
  await a.ready;
  assert.deepEqual(a.opened, { fromSnapshot: 0, rebuilt: 3, meetingsReplayed: 3, daysReplayed: 1 });
  assert.equal(await a.persist(), 3, "three hot months written");
  assert.deepEqual(first.puts.sort(), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(await a.persist(), 0, "nothing changed: nothing written");

  // Later: a new turn in November's meeting and something seen today.
  clock = NOW + 3_600_000;
  w.meetings[0]!.turns.push({ id: "t3", at: clock - 1000, speaker: "PROBE-Ana", text: "PROBE añadido tarde" });
  w.entries.push({ at: clock - 500, kind: "live", text: "PROBE pizarra nueva" });
  const second = counting(new FileSnapshots(dir));
  const b = new RecallRuntime(w.records, TZ, () => clock, { snapshots: second.store });
  await b.ready;
  assert.equal(b.opened.fromSnapshot, 3);
  assert.equal(b.opened.rebuilt, 0);
  assert.equal(b.opened.meetingsReplayed, 1, "only the meeting that changed");
  assert.equal(b.opened.daysReplayed, 1, "only today, the day the snapshot was built through");
  assert.equal(w.calls.between.at(-1)![0], Date.parse("2026-11-05T00:00:00-05:00"));
  assert.deepEqual(found(b, "añadido"), ["sm-nov:3"]);
  assert.ok(found(b, "octubre").length > 0, "October came from its snapshot");
  assert.equal(found(b, "nueva").length, 1);
  assert.equal(await b.persist(), 1, "only November changed");
  assert.deepEqual(second.puts, ["2026-11"]);
});

test("older months load for a question that names them, three at most, the least recently used dropped and written first", async () => {
  const w = world();
  const { store, puts } = counting(new FileSnapshots(join(mkdtempSync(join(tmpdir(), "lente-recall-cold-")), "memory")));
  const rt = new RecallRuntime(w.records, TZ, () => NOW, { snapshots: store });
  await rt.ready;
  assert.deepEqual(found(rt, "mes202608"), [], "August is cold until asked");
  const month = (k: string) => [Date.parse(`${k}-01T00:00:00Z`), Date.parse(`${k}-28T00:00:00Z`)] as const;
  await rt.ensureRange(...month("2026-08"));
  await rt.ensureRange(...month("2026-07"));
  await rt.ensureRange(...month("2026-06"));
  assert.ok(found(rt, "mes202608").length > 0);
  await rt.ensureRange(...month("2026-08")); // touched: now the most recent
  await rt.ensureRange(...month("2026-05")); // a fourth: July, the least recently used, goes
  const months = [...rt.index.shards.keys()].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  assert.deepEqual(months, ["2026-05", "2026-06", "2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(months.length, 3 + COLD_SHARDS);
  assert.deepEqual(found(rt, "mes202607"), []);
  assert.ok(puts.includes("2026-07"), "July was written before it was dropped");
  await rt.ensureRange(...month("2026-07"));
  assert.ok(found(rt, "mes202607").length > 0, "and comes back from its snapshot");
});

test("a corrupt snapshot is rebuilt from the records; one from another encoder keeps its words and is re-embedded; both answer the same", async () => {
  const w = world();
  const dir = join(mkdtempSync(join(tmpdir(), "lente-recall-bad-")), "memory");
  const files = new FileSnapshots(dir);
  const a = new RecallRuntime(w.records, TZ, () => NOW, { snapshots: files });
  await a.ready;
  await a.persist();
  const nov = files.get("2026-11")!;
  files.put({ ...nov, bytes: nov.bytes.map((b, i) => (i === 40 ? b ^ 0xff : b)) });
  const oct = files.get("2026-10")!;
  files.put({ ...oct, encoder: "an-older-encoder" });
  const log: string[] = [];
  const b = new RecallRuntime(w.records, TZ, () => NOW, { snapshots: files, log: (l) => log.push(l) });
  await b.ready;
  assert.deepEqual([b.opened.fromSnapshot, b.opened.rebuilt], [2, 1]);
  assert.ok(log.some((l) => /rebuilding 2026-11 .*checksum/.test(l)));
  assert.ok(log.some((l) => /re-embedding 2026-10 \(built with an-older-encoder, now lexical\)/.test(l)));
  for (const word of ["noviembre", "octubre", "septiembre", "vieja"]) assert.deepEqual(found(b, word), found(a, word), word);
  assert.equal(await b.persist(), 2, "the rebuilt months are written again");
});

test("7.3: forgetting a day and a meeting removes their segments, moments, cards and facts from the index and the snapshots", async () => {
  const w = world();
  const m = w.meetings[0]!; // November, two days ago
  m.cards = [{ from: m.startedAt, to: m.endedAt!, window: false, people: [{ name: "PROBE-Lucía", role: "" }], facts: [{ id: `c${m.id}:1`, text: "PROBE dato secreto", about: [], evidence: ["t1"], validFrom: m.startedAt }], keysEs: [], keysEn: [] }];
  const kept = [{ id: "f1", text: "PROBE recuerdo del día", status: "kept" as const, meetingId: m.id, evidence: ["t1"], createdAt: NOW }];
  const records: RecallRecords = { ...w.records, keptFacts: () => kept, assignments: () => new Map([[m.id, "p-atlas"]]) };
  const files = new FileSnapshots(join(mkdtempSync(join(tmpdir(), "lente-recall-forget-")), "memory"));
  const rt = new RecallRuntime(records, TZ, () => NOW, { snapshots: files });
  await rt.ready;
  await rt.persist();
  const day = "2026-11-02"; // the day of the "pizarra vieja" moment
  assert.ok(found(rt, "vieja").length && found(rt, "noviembre").length && found(rt, "secreto").length && found(rt, "recuerdo").length);

  // The hub removes the records first (meeting, facts), then forgets them in memory.
  w.meetings.splice(0, 1);
  kept.length = 0;
  const affected = await rt.forget({ day, meetings: [m] });
  assert.deepEqual(affected, { projects: ["p-atlas"], people: ["PROBE-Ana", "PROBE-Lucía"] });
  await rt.flush();
  for (const word of ["vieja", "noviembre", "secreto", "recuerdo"]) assert.deepEqual(found(rt, word), [], word);
  const bytes = Buffer.from(files.get("2026-11")!.bytes).toString("latin1");
  assert.ok(!bytes.includes("secreto") && !bytes.includes("noviembre") && !bytes.includes("vieja"), "the November snapshot was rewritten without them");
  const reopened = new RecallRuntime(records, TZ, () => NOW, { snapshots: files });
  await reopened.ready;
  for (const word of ["vieja", "noviembre", "secreto"]) assert.deepEqual(found(reopened, word), [], `${word} after reopening`);
});
