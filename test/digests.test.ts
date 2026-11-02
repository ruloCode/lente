// add-accounts 5.1 with a stubbed model: budgets, the ids each digest keeps, kept facts winning.
// All text here is synthetic.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ChatMessage } from "../src/chat.ts";
import { DIGEST_BUDGET, type Digest, type DigestCall, KEPT_HEADING, digestId, fitBudget, monthStart, weekStart, writeDayDigest, writeProfile, writeRollup } from "../src/digests.ts";
import type { Fact } from "../src/fact-store.ts";
import type { Meeting } from "../src/meetings.ts";
import { newDek } from "../src/seal.ts";
import { FileDigestStore } from "../src/stores.ts";
import { openUserStores } from "../src/supabase-stores.ts";
import { fakePostgrest } from "./fake-postgrest.ts";

const NOW = Date.UTC(2026, 10, 1, 23);
const meeting = (id: string, summary: string): Meeting => ({ id, title: `Reunión ${id}`, startedAt: NOW - 3600_000, status: "done", turns: [], notes: { summary, decisions: [{ text: "Lanzar el piloto", evidence: ["t1"] }], commitments: [], openQuestions: [] } });
const fact = (id: string, text: string): Fact => ({ id, text, status: "kept", meetingId: "m1", evidence: [], createdAt: NOW });

/** A stub that records what it was shown and answers with the given text and sources. */
function stub(text: string, sources: string[]) {
  const seen: { messages: ChatMessage[]; name: string }[] = [];
  const call: DigestCall = async (messages, _schema, name) => {
    seen.push({ messages, name });
    return JSON.stringify({ text, sources });
  };
  return { call, seen };
}

test("the profile keeps the meetings it came from and drops ids it was never shown", async () => {
  const { call, seen } = stub("Trabaja en el piloto de Lente con el equipo de producto.", ["m20261101100000", "m99999999999999", "fact:x"]);
  const profile = await writeProfile({ meetings: [meeting("m20261101100000", "Se revisó el piloto")], keptFacts: [], day: "2026-11-01" }, call, NOW);
  assert.deepEqual(profile.sources, ["m20261101100000"]);
  assert.equal(profile.scope, "profile");
  assert.equal(seen[0]!.name, "profile");
  assert.match(String(seen[0]!.messages[1]!.content), /\[m20261101100000\]/);
});

test("kept facts win: they are in the profile verbatim even when the model contradicts or drops them", async () => {
  const facts = [fact("f1", "El usuario es gerente de producto, no ingeniero."), fact("f2", "Prefiere reuniones antes de las 10.")];
  const { call, seen } = stub("El usuario es ingeniero de backend.", []);
  const profile = await writeProfile({ meetings: [], keptFacts: facts, day: "2026-11-01" }, call, NOW);
  assert.ok(profile.text.endsWith(`${KEPT_HEADING}\n- El usuario es gerente de producto, no ingeniero.\n- Prefiere reuniones antes de las 10.`));
  assert.deepEqual(profile.sources, ["fact:f1", "fact:f2"]);
  assert.match(String(seen[0]!.messages[1]!.content), /mandan sobre todo lo demás/);
});

test("the profile stays within 4,000 characters with the kept facts' room reserved", async () => {
  const facts = Array.from({ length: 10 }, (_, i) => fact(`f${i}`, `Hecho confirmado número ${i} con algo de texto para ocupar espacio.`));
  const { call, seen } = stub("Frase larga sobre el usuario. ".repeat(400), []);
  const profile = await writeProfile({ meetings: [], keptFacts: facts, day: "2026-11-01" }, call, NOW);
  assert.ok(profile.text.length <= DIGEST_BUDGET.profile, `${profile.text.length}`);
  for (const f of facts) assert.ok(profile.text.includes(f.text));
  assert.match(String(seen[0]!.messages[0]!.content), /Máximo \d+ caracteres/);
});

test("the profile rewrite sees the previous profile and may cite it", async () => {
  const previous: Digest = { scope: "profile", periodStart: "2026-10-31", text: "Perfil de ayer.", sources: [], createdAt: NOW - 86400_000 };
  const { call, seen } = stub("Perfil nuevo.", ["profile:2026-10-31"]);
  const profile = await writeProfile({ previous, meetings: [], keptFacts: [], day: "2026-11-01" }, call, NOW);
  assert.deepEqual(profile.sources, ["profile:2026-10-31"]);
  assert.match(String(seen[0]!.messages[1]!.content), /Perfil de ayer/);
});

test("a day digest keeps its day and meetings, fits 1,500 characters, and bounds its input", async () => {
  const entries = Array.from({ length: 3000 }, (_, i) => ({ at: NOW - i * 1000, kind: "turn" as const, speaker: "A", text: `frase sintética ${i}` }));
  const { call, seen } = stub("Día largo. ".repeat(300), ["d2026-11-01", "m20261101100000", "m-unknown"]);
  const digest = await writeDayDigest({ day: "2026-11-01", meetings: [meeting("m20261101100000", "Revisión")], entries: [{ at: NOW, kind: "summary", text: "resumen de la tarde" }, ...entries] }, call, NOW);
  assert.ok(digest.text.length <= DIGEST_BUDGET.day);
  assert.deepEqual(digest.sources, ["d2026-11-01", "m20261101100000"]);
  const input = String(seen[0]!.messages[1]!.content);
  assert.ok(input.length < 26_000, `${input.length}`);
  assert.ok(input.indexOf("resumen de la tarde") < input.indexOf("frase sintética"), "summaries go first");
});

test("week and month digests are built from the digests below them and keep their ids", async () => {
  const days: Digest[] = ["2026-10-26", "2026-10-27"].map((d) => ({ scope: "day", periodStart: d, text: `Día ${d}.`, sources: [], createdAt: NOW }));
  const { call } = stub("Semana de pruebas del piloto.", ["day:2026-10-26", "day:2026-10-27", "day:2026-01-01"]);
  const week = await writeRollup({ scope: "week", periodStart: "2026-10-26", parts: days }, call, NOW);
  assert.deepEqual(week.sources, ["day:2026-10-26", "day:2026-10-27"]);
  assert.equal(digestId(week), "week:2026-10-26");
  const month = await writeRollup({ scope: "month", periodStart: "2026-10-01", parts: [week] }, stub("x".repeat(5000), []).call, NOW);
  assert.ok(month.text.length <= DIGEST_BUDGET.month);
});

test("a model answer with no JSON is an error, not an empty digest", async () => {
  await assert.rejects(writeRollup({ scope: "week", periodStart: "2026-10-26", parts: [] }, async () => "lo siento", NOW), /no JSON/);
});

test("weeks start on Monday, months on the 1st, and budgets cut at a sentence", () => {
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
  assert.equal(weekStart("2026-10-26"), "2026-10-26");
  assert.equal(monthStart("2026-11-17"), "2026-11-01");
  assert.equal(fitBudget("Una frase completa aquí. Otra frase más larga que no cabe.", 30), "Una frase completa aquí.");
  assert.equal(fitBudget("Corta. Y luego una frase muy larga sin punto final que sigue", 30), "Corta. Y luego una frase muy…");
  assert.equal(fitBudget("corto", 20), "corto");
});

test("digests are stored by scope and period, newest first, in a file or sealed on Supabase", async () => {
  const d = (scope: Digest["scope"], periodStart: string, text: string): Digest => ({ scope, periodStart, text, sources: ["m1"], createdAt: NOW });
  const fake = fakePostgrest();
  const sealed = (await openUserStores(fake.rest, "aaaaaaaa-0000-4000-8000-000000000001", newDek(), NOW)).digests;
  for (const store of [new FileDigestStore(join(mkdtempSync(join(tmpdir(), "lente-digests-")), "digests.json")), sealed]) {
    await store.put(d("day", "2026-10-30", "PROBE-DIGEST-viernes"));
    await store.put(d("day", "2026-10-31", "sábado"));
    await store.put(d("day", "2026-10-31", "sábado, reescrito"));
    assert.deepEqual((await store.latest("day", 5)).map((x) => x.text), ["sábado, reescrito", "PROBE-DIGEST-viernes"]);
    assert.equal((await store.get("day", "2026-10-30"))?.sources[0], "m1");
    assert.equal(await store.get("week", "2026-10-26"), undefined);
  }
  assert.ok(!fake.dump().includes("PROBE-DIGEST"));
  assert.equal(fake.tables.get("memory_digests")!.length, 2);
});
