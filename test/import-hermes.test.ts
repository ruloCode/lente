// add-hermes-import 1.3: the import end to end against the fake PostgREST (Lente) and an in-memory
// hermes. Synthetic rows only; the model call is a stub.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { type HermesReader, hermesReader, importHermes } from "../scripts/import-hermes.ts";
import { Accounts } from "../src/accounts.ts";
import type { DigestCall } from "../src/digests.ts";
import { checkKekAtStart } from "../src/kek-check.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const OWNER = "aaaaaaaa-0000-4000-8000-0000000000aa";
const NOW = Date.parse("2026-11-02T15:00:00Z");

const hermesRows = {
  meetings: Array.from({ length: 205 }, (_, i) => ({
    id: i + 1,
    meeting_id: `2026-0${(i % 3) + 6}-1${i % 9}-reunion-${i + 1}`,
    title: `PROBE-HERMES reunión ${i + 1}`,
    meeting_date: `2026-0${(i % 3) + 6}-1${i % 9}T15:00:00Z`,
    duration_sec: 600,
    transcript: i === 0 ? null : `Ana: PROBE-HERMES pregunta ${i + 1}\nRulo (yo): respuesta`,
    summary: i === 0 ? null : `PROBE-HERMES resumen ${i + 1}`,
  })),
  memories: [
    { id: "m1", content: "PROBE-HERMES prefiere reuniones cortas", summary: null, created_at: "2026-06-01T10:00:00Z" },
    { id: "m2", content: "PROBE-HERMES trabaja en Lente", summary: null, created_at: "2026-06-02T10:00:00Z" },
  ],
};

const fakeHermes = (): HermesReader & { reads: number } => {
  const reader = (async (table: "meetings" | "memories", _columns: string, after: string | number | undefined, limit: number) => {
    reader.reads++;
    const rows = hermesRows[table] as { id: string | number }[];
    return rows.filter((r) => after === undefined || String(r.id).localeCompare(String(after), undefined, { numeric: true }) > 0).slice(0, limit);
  }) as HermesReader & { reads: number };
  reader.reads = 0;
  return reader;
};

async function setup(withAccount = true) {
  const fake = fakePostgrest();
  const kek: Kek = { version: 1, key: randomBytes(32) };
  await checkKekAtStart([kek], supabaseCanaries(fake.rest));
  if (withAccount) await new Accounts(new SupabaseAccounts(fake.rest), [kek], new Set(["owner@example.com"])).admit(OWNER, "owner@example.com");
  let calls = 0;
  const inputs: string[] = [];
  const call: DigestCall = async (messages) => (calls++, inputs.push(JSON.stringify(messages)), JSON.stringify({ text: "Resumen sintético del periodo.", sources: [] }));
  const hermes = fakeHermes();
  const deps = { lente: fake.rest, keks: [kek], hermes, userIdFor: async (e: string) => (e === "owner@example.com" ? OWNER : undefined), call, timeZone: "America/Bogota", now: () => NOW };
  return { fake, kek, deps, hermes, calls: () => calls, inputs };
}

test("the import writes meetings, kept facts, the digests of the imported days and the profile; a second run duplicates nothing", async () => {
  const { fake, kek, deps, calls, inputs } = await setup();
  const dry = await importHermes("owner@example.com", deps, true);
  assert.deepEqual(dry.meetings, { read: 205, skipped: 1, written: 0 });
  assert.equal(dry.facts.read, 2);
  assert.ok(dry.digests.planned > 0);
  assert.equal(calls(), 0, "a dry run calls no model");
  assert.equal((fake.tables.get("meetings") ?? []).length, 0, "a dry run writes nothing");

  const first = await importHermes("owner@example.com", deps, false);
  assert.equal(first.meetings.written, 204);
  assert.equal(first.facts.written, 2);
  assert.equal(first.digests.written, dry.digests.planned);
  assert.deepEqual(first.range, { from: "2026-06-01", to: "2026-08-18" });

  const stores = await openUserStores(fake.rest, OWNER, await new Accounts(new SupabaseAccounts(fake.rest), [kek], new Set()).dek(OWNER), NOW);
  const meetings = await stores.meetings.list();
  assert.equal(meetings.length, 204);
  assert.ok(meetings.every((m) => m.id.startsWith("hermes-") && m.status === "done"));
  const facts = await stores.facts.list();
  assert.deepEqual(facts.map((f) => [f.status, f.meetingId]), [["proposed", "hermes"], ["proposed", "hermes"]]);
  assert.ok((await stores.digests.latest("month", 10)).length >= 2);
  assert.ok(await stores.digests.get("day", "2026-06-02"), "a day with only a memory gets its digest");
  assert.ok(inputs.some((i) => i.includes("Recuerdo (hermes): PROBE-HERMES trabaja en Lente")), "memories reach their day's digest");
  const [profile] = await stores.digests.latest("profile", 1);
  assert.ok(!profile!.text.includes("PROBE-HERMES trabaja"), "memories wait for review instead of filling the profile");
  assert.ok(!fake.dump().includes("PROBE-HERMES"), "nothing readable reaches the database");

  const turnsBefore = fake.tables.get("meeting_turns")!.length;
  const second = await importHermes("owner@example.com", deps, false);
  assert.equal(second.facts.written, 0);
  assert.equal(second.digests.planned, 0);
  assert.equal(fake.tables.get("meetings")!.length, 204);
  assert.equal(fake.tables.get("meeting_turns")!.length, turnsBefore);
});

test("without a Lente account the import stops before reading hermes", async () => {
  const { deps, hermes } = await setup(false);
  await assert.rejects(importHermes("owner@example.com", deps, true), /no Lente account yet: sign in once/);
  await assert.rejects(importHermes("stranger@example.com", deps, true), /no Lente account yet/);
  assert.equal(hermes.reads, 0);
});

test("the hermes reader pages by id and sends a legacy JWT key as the Bearer, a new key only as apikey", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    return new Response("[]", { status: 200 });
  }) as unknown as typeof fetch;
  await hermesReader("https://h.example.co/", "eyJlegacy", fetchFn)("meetings", "id,title", 200, 200);
  await hermesReader("https://h.example.co", "sb_secret_x", fetchFn)("memories", "id", undefined, 200);
  assert.equal(seen[0]!.url, "https://h.example.co/rest/v1/meetings?select=id,title&order=id.asc&limit=200&id=gt.200");
  assert.equal(seen[0]!.headers.Authorization, "Bearer eyJlegacy");
  assert.equal(seen[1]!.headers.Authorization, undefined);
  assert.equal(seen[1]!.headers.apikey, "sb_secret_x");
});
