// add-media-archive 2.1: the media archive's storage. The sealed store keeps a row of ids, times, sizes
// and codec and an object of ciphertext under a key that says nothing; no probe reaches a column, an
// object key or an object in the clear. Removals delete objects before rows (a failure halfway leaves no
// orphan object). The laptop keeps 0600 files. The migration has RLS, no grants and a private bucket.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { newDek } from "../src/seal.ts";
import { FileMedia } from "../src/stores.ts";
import { SupabaseStorage, type StorageFetch } from "../src/supabase-storage.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const T = Date.UTC(2026, 10, 3, 15);
const PROBE = new TextEncoder().encode("PROBE-AUDIO-voz-de-ximena");

function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const log: string[] = [];
  let failDeletes = false;
  const fetch: StorageFetch = async (url, init) => {
    const path = decodeURIComponent(url.split("/storage/v1/object/")[1]!);
    log.push(`${init.method} ${path}`);
    const reply = (status: number, body: Uint8Array | string = "") => ({ status, ok: status < 300, arrayBuffer: async () => new Uint8Array(typeof body === "string" ? new TextEncoder().encode(body) : body).buffer as ArrayBuffer, text: async () => String(body) });
    if (init.method === "POST") return objects.set(path, init.body as Uint8Array), reply(200);
    if (init.method === "GET") return objects.has(path) ? reply(200, objects.get(path)!) : reply(404);
    if (failDeletes) return reply(500);
    for (const p of (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes) objects.delete(`media/${p}`);
    return reply(200);
  };
  return { storage: new SupabaseStorage({ url: "http://probe.local", secretKey: "sb_secret_fake", fetch }), objects, log, failNextDeletes: () => (failDeletes = true) };
}

test("sealed media: a row of ids and sizes, an object of ciphertext under a key that says nothing", async () => {
  const fake = fakePostgrest();
  const st = fakeStorage();
  const s = await openUserStores(fake.rest, ALICE, newDek(), T, st.storage);
  await s.media!.put({ kind: "audio", ref: "sm20261103150000:3", at: T, ms: 1500, bytes: PROBE.length, codec: "adpcm" }, PROBE);
  const row = fake.tables.get("media_chunks")![0]!;
  assert.deepEqual(Object.keys(row).sort(), ["at", "bytes", "codec", "kind", "ms", "object", "ref", "user_id"]);
  assert.match(String(row.object), new RegExp(`^${ALICE}/2026-11-03/[0-9a-f-]{36}$`));
  const stored = [...st.objects.values()][0]!;
  assert.ok(!Buffer.from(stored).includes(Buffer.from(PROBE)), "the object is sealed");
  assert.ok(!fake.dump().includes("PROBE-AUDIO"));
  const back = await s.media!.get("audio", "sm20261103150000:3");
  assert.deepEqual(back && [...back.data], [...PROBE]);
  assert.equal((await s.media!.list(T, T + 1)).length, 1);
  // Replacing the same segment's audio leaves one row and one object.
  await s.media!.put({ kind: "audio", ref: "sm20261103150000:3", at: T, ms: 1600, bytes: 3, codec: "adpcm" }, new Uint8Array([1, 2, 3]));
  assert.equal(fake.tables.get("media_chunks")!.length, 1);
  assert.equal(st.objects.size, 1);
});

test("removals delete objects before rows; a failed delete leaves the rows, never an orphan object", async () => {
  const fake = fakePostgrest();
  const st = fakeStorage();
  const s = await openUserStores(fake.rest, ALICE, newDek(), T, st.storage);
  for (let i = 0; i < 5; i++) await s.media!.put({ kind: i % 2 ? "frame" : "audio", ref: `d2026-11-0${i + 1}:1`, at: T - (5 - i) * 86_400_000, ms: 0, bytes: 1, codec: i % 2 ? "jpeg" : "adpcm" }, new Uint8Array([i]));
  st.failNextDeletes();
  await assert.rejects(s.media!.expire(T - 3 * 86_400_000, 10), /deleting 2 object/);
  assert.equal(fake.tables.get("media_chunks")!.length, 5, "rows stay when the objects could not go");
  const ok = fakeStorage();
  const fresh = await openUserStores(fakePostgrest().rest, ALICE, newDek(), T, ok.storage);
  for (let i = 0; i < 5; i++) await fresh.media!.put({ kind: "audio", ref: `sx:${i}`, at: T - (5 - i) * 86_400_000, ms: 0, bytes: 1, codec: "adpcm" }, new Uint8Array([i]));
  assert.equal(await fresh.media!.expire(T - 2 * 86_400_000, 2), 2, "oldest first, capped");
  assert.equal(await fresh.media!.removeBetween(T - 2 * 86_400_000, T), 2);
  assert.equal(await fresh.media!.remove("audio", ["sx:2"]), 1);
  assert.equal(ok.objects.size, 0);
  const order = ok.log.filter((l) => l.startsWith("DELETE"));
  assert.ok(order.length >= 3);
});

test("laptop media: data/media/<kind>/<ref>.<codec>, private, and the same removals", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "lente-media-")), "media");
  const m = new FileMedia(dir);
  m.put({ kind: "audio", ref: "sm20261103150000:3", at: T, ms: 1500, bytes: 3, codec: "adpcm" }, new Uint8Array([1, 2, 3]));
  assert.equal(statSync(join(dir, "audio", "sm20261103150000_3.adpcm")).mode & 0o777, 0o600);
  assert.deepEqual([...m.get("audio", "sm20261103150000:3")!.data], [1, 2, 3]);
  assert.throws(() => m.put({ kind: "audio", ref: "../../etc", at: T, ms: 0, bytes: 0, codec: "adpcm" }, new Uint8Array()), /not a segment or moment id/);
  assert.equal(m.expire(T + 1, 10), 1);
  assert.equal(m.get("audio", "sm20261103150000:3"), undefined);
});

test("the migration: RLS on, no grants, a private bucket, ids and sizes only", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261103010000_media_archive.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.media_chunks enable row level security;/);
  assert.match(sql, /revoke all on table public\.media_chunks from anon, authenticated;/);
  assert.match(sql, /insert into storage\.buckets \(id, name, public\) values \('media', 'media', false\)/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /_enc\b|text_|transcript|title/i, "no content column");
});
