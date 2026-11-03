// add-memory-engine 7.1: the memory engine's storage. Snapshots of the index round-trip through the
// sealed Supabase store and the laptop's files; briefs and people cards round-trip by subject; and none
// of the probes (unit text, a term, a person's name) reaches the database in the clear. The migration
// gives the new table RLS and no grant to anon or authenticated. Synthetic data only.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decodeShard, encodeShard, SNAPSHOT_FORMAT } from "../src/index-snapshot.ts";
import { MemoryIndex } from "../src/memory-index.ts";
import { newDek } from "../src/seal.ts";
import { FileSnapshots } from "../src/stores.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { terms } from "../src/terms.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 10, 3, 15);
const PROBES = ["PROBEzanahoriatexto", "PROBEgirasolvector", "PROBE-Ximena Quintero"];

function shardBytes() {
  const idx = new MemoryIndex(8);
  idx.add({ id: "s2026-11-03:1", kind: "segment", at: NOW, speakers: [PROBES[2]!], text: `${PROBES[0]} dijo algo sobre ${PROBES[1]}` }, Int8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
  const shard = idx.shards.get("2026-11")!;
  shard.sources.set("m20261103150000", "3|PROBE|");
  return encodeShard(shard, { encoder: "probe-encoder", builtThrough: NOW });
}

const assertSealed = (dump: string) => {
  for (const p of PROBES) {
    assert.ok(!dump.includes(p), `${p} reached the database in the clear`);
    assert.ok(!dump.includes(Buffer.from(p).toString("hex")), `${p} reached the database as hex`);
  }
};

test("snapshots: sealed per shard, with only month, format, encoder and time in plain columns", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const bytes = shardBytes();
  await s.snapshots.put({ shard: "2026-11", formatVersion: SNAPSHOT_FORMAT, encoder: "probe-encoder", builtThrough: NOW, bytes });
  await s.snapshots.put({ shard: "2026-11", formatVersion: SNAPSHOT_FORMAT, encoder: "probe-encoder", builtThrough: NOW + 1, bytes });
  assert.equal(fake.tables.get("memory_snapshots")!.length, 1, "one row per shard: the second write replaces the first");
  const row = fake.tables.get("memory_snapshots")![0]!;
  assert.deepEqual(Object.keys(row).sort(), ["blob_enc", "built_through", "encoder", "format_version", "shard", "updated_at", "user_id"]);
  assertSealed(fake.dump());
  const back = await s.snapshots.get("2026-11");
  assert.deepEqual(back && [...back.bytes], [...bytes]);
  assert.equal(back!.builtThrough, NOW + 1);
  const { shard } = decodeShard(back!.bytes);
  assert.equal(shard.sources.get("m20261103150000"), "3|PROBE|");
  const idx = new MemoryIndex(8);
  idx.shards.set(shard.key, shard);
  assert.equal(idx.lexical(terms(PROBES[0]!)).length, 1);
  assert.deepEqual((await s.snapshots.list()).map((m) => m.shard), ["2026-11"]);
  await s.snapshots.remove("2026-11");
  assert.equal(await s.snapshots.get("2026-11"), undefined);
});

test("snapshots on the laptop: data/memory/<shard>.bin and its sidecar, private to the user", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "lente-snapshots-")), "memory");
  const files = new FileSnapshots(dir);
  const bytes = shardBytes();
  files.put({ shard: "2026-11", formatVersion: SNAPSHOT_FORMAT, encoder: "lexical", builtThrough: NOW, bytes });
  assert.deepEqual([...files.get("2026-11")!.bytes], [...bytes]);
  assert.equal(statSync(join(dir, "2026-11.bin")).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "2026-11.json"), "utf8")), { shard: "2026-11", formatVersion: SNAPSHOT_FORMAT, encoder: "lexical", builtThrough: NOW });
  assert.deepEqual(files.list().map((m) => m.shard), ["2026-11"]);
  assert.throws(() => files.get("../etc"), /not a YYYY-MM shard/);
  files.remove("2026-11");
  assert.equal(files.get("2026-11"), undefined);
});

test("briefs and people cards by subject: a person's name is sealed, never a column", async () => {
  const fake = fakePostgrest();
  const s = await openUserStores(fake.rest, ALICE, newDek(), NOW);
  const project = "11111111-0000-4000-8000-000000000001";
  await s.digests.put({ scope: "brief", periodStart: project, text: "PROBE brief uno", sources: ["m1"], createdAt: NOW });
  await s.digests.put({ scope: "brief", periodStart: project, text: "PROBE brief dos", sources: ["m1", "m2"], createdAt: NOW + 1 });
  await s.digests.put({ scope: "person", periodStart: PROBES[2]!.toLowerCase(), text: `${PROBES[2]} lleva marketing`, sources: ["m2"], createdAt: NOW });
  await s.digests.put({ scope: "person", periodStart: PROBES[2]!.toLowerCase(), text: `${PROBES[2]} lleva ventas`, sources: ["m3"], createdAt: NOW + 2 });
  await s.digests.put({ scope: "day", periodStart: "2026-11-03", text: "PROBE día", sources: [], createdAt: NOW });
  const rows = fake.tables.get("memory_digests")!;
  assert.equal(rows.filter((r) => r.scope === "brief").length, 1, "a brief is replaced, not added");
  assert.equal(rows.filter((r) => r.scope === "person").length, 1, "so is a person card");
  assert.equal(rows.find((r) => r.scope === "brief")!.subject, project);
  assert.match(String(rows.find((r) => r.scope === "person")!.subject), /^[0-9a-f-]{36}$/);
  assert.equal(rows.find((r) => r.scope === "day")!.subject, undefined);
  assertSealed(fake.dump());
  assert.equal((await s.digests.get("brief", project))?.text, "PROBE brief dos");
  assert.equal((await s.digests.get("person", PROBES[2]!.toLowerCase()))?.text, `${PROBES[2]} lleva ventas`);
  assert.deepEqual((await s.digests.latest("person", 5)).map((d) => d.periodStart), [PROBES[2]!.toLowerCase()]);
  assert.equal((await s.digests.latest("day", 5)).length, 1);
});

test("the migration: RLS on, no grant to anon or authenticated, the new scopes and the subject rule", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261103000000_memory_engine.sql", import.meta.url), "utf8");
  assert.match(sql, /create table public\.memory_snapshots/);
  assert.match(sql, /alter table public\.memory_snapshots enable row level security;/);
  assert.match(sql, /revoke all on table public\.memory_snapshots from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i, "no policy: only the hub's secret key reads it");
  assert.match(sql, /'brief', 'person'/);
  assert.match(sql, /\(scope in \('brief', 'person'\)\) = \(subject is not null\)/);
  assert.doesNotMatch(sql, /\b(text|varchar)\b[^,\n]*name/i, "no plain name column");
});
