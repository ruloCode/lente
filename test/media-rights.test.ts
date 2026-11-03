// add-media-archive 3.1 and 3.2: deleting an account removes its media objects (from the keys its rows
// hold) before any row; a database without the newer tables still deletes the account; and the export
// carries the media as files (WAV and JPEG bytes, base64). Synthetic data, fake PostgREST and Storage.

import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { DELETE_ORDER, deleteAccount, exportAccount } from "../src/account-rights.ts";
import { encodeAdpcm } from "../src/media-chunks.ts";
import { newDek } from "../src/seal.ts";
import { SupabaseRest } from "../src/supabase-rest.ts";
import { SupabaseStorage, type StorageFetch } from "../src/supabase-storage.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const T = Date.UTC(2026, 10, 3, 15);

function storage(events: string[]) {
  const objects = new Map<string, Uint8Array>();
  const fetch: StorageFetch = async (url, init) => {
    const path = decodeURIComponent(url.split("/storage/v1/object/")[1]!);
    const reply = (status: number, body?: Uint8Array) => ({ status, ok: status < 300, arrayBuffer: async () => new Uint8Array(body ?? []).buffer as ArrayBuffer, text: async () => "" });
    if (init.method === "POST") return objects.set(path, new Uint8Array(init.body as Uint8Array)), reply(200);
    if (init.method === "GET") return objects.has(path) ? reply(200, objects.get(path)) : reply(404);
    events.push("storage delete");
    for (const p of (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes) objects.delete(`media/${p}`);
    return reply(200);
  };
  return { s: new SupabaseStorage({ url: "http://probe.local", secretKey: "sb_secret_fake", fetch }), objects };
}

test("deleting an account removes its media objects before any row", async () => {
  const fake = fakePostgrest();
  const events: string[] = [];
  const st = storage(events);
  const stores = await openUserStores(fake.rest, ALICE, newDek(), T, st.s);
  await stores.media!.put({ kind: "audio", ref: "sm1:1", at: T, ms: 500, bytes: 3, codec: "adpcm" }, new Uint8Array([1, 2, 3]));
  await stores.media!.put({ kind: "frame", ref: "d2026-11-03:1", at: T, ms: 0, bytes: 2, codec: "jpeg" }, new Uint8Array([0xff, 0xd8]));
  fake.requests.length = 0;
  const steps = await deleteAccount(fake.rest, ALICE, { forgetInMemory: async () => {}, deleteSignIn: async () => {}, storage: st.s });
  assert.deepEqual(steps, ["user_keys", "memory", "media objects", ...DELETE_ORDER, "auth"]);
  assert.equal(st.objects.size, 0);
  const firstRowDelete = fake.requests.findIndex((r) => r.method === "DELETE" && r.table !== "user_keys");
  assert.ok(firstRowDelete > 0 && events.length === 1, "objects went before the first content row");
});

test("a database without the newer tables still deletes the account; another failure still stops it", async () => {
  const missing = (table: string) => async (url: string, init: { method: string }) => {
    const name = new URL(url).pathname.replace("/rest/v1/", "");
    if (name === table && init.method === "DELETE") return { status: 404, ok: false, text: async () => JSON.stringify({ code: "PGRST205", message: "relation does not exist" }) };
    return { status: 204, ok: true, text: async () => "" };
  };
  const rest = new SupabaseRest({ url: "http://probe.local", secretKey: "sb_secret_fake", fetch: missing("media_chunks"), sleep: async () => {} });
  const steps = await deleteAccount(rest, ALICE, { forgetInMemory: async () => {}, deleteSignIn: async () => {} });
  assert.ok(steps.includes("media_chunks (not created yet)"));
  assert.equal(steps.at(-1), "auth");
  const broken = new SupabaseRest({ url: "http://probe.local", secretKey: "sb_secret_fake", fetch: missing("facts"), sleep: async () => {} });
  await assert.rejects(deleteAccount(broken, ALICE, { forgetInMemory: async () => {}, deleteSignIn: async () => {} }));
});

test("the export carries the media as files: WAV for audio, JPEG for frames", async () => {
  const fake = fakePostgrest();
  const st = storage([]);
  const dek = newDek();
  const stores = await openUserStores(fake.rest, ALICE, dek, T, st.s);
  await stores.media!.put({ kind: "audio", ref: "sm1:1", at: T, ms: 500, bytes: 0, codec: "adpcm" }, encodeAdpcm(new Uint8Array(16_000)));
  await stores.media!.put({ kind: "frame", ref: "d2026-11-03:1", at: T, ms: 0, bytes: 2, codec: "jpeg" }, new Uint8Array([0xff, 0xd8]));
  let text = "";
  await exportAccount(fake.rest, ALICE, dek, new Writable({ write: (c, _e, cb) => ((text += c), cb()) }), T, st.s);
  const doc = JSON.parse(text) as { media: { kind: string; file: string; base64: string }[] };
  assert.deepEqual(doc.media.map((m) => m.file), ["audio/sm1_1.wav", "frame/d2026-11-03_1.jpg"]);
  assert.equal(Buffer.from(doc.media[0]!.base64, "base64").subarray(0, 4).toString(), "RIFF");
  assert.deepEqual([...Buffer.from(doc.media[1]!.base64, "base64")], [0xff, 0xd8]);
});
