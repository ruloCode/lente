// Imports the owner's hermes-os history into his Lente account (add-hermes-import). Reads hermes's
// `meetings` and `memories` with hermes's secret key, writes them sealed under the owner's data key
// (memories as facts to review), then writes the day, week and month digests for the imported days,
// memories included, and rewrites the profile.
// Prints counts only: never a key, a title, a name or any text.
//   node --env-file=.env scripts/import-hermes.ts --email you@example.com --dry-run
//   node --env-file=.env scripts/import-hermes.ts --email you@example.com

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Accounts } from "../src/accounts.ts";
import { completeChat } from "../src/chat.ts";
import { type DigestCall, digestId, writeProfile } from "../src/digests.ts";
import { keptFacts } from "../src/fact-store.ts";
import { type HermesMeeting, type HermesMemory, factsFromHermes, meetingFromHermes, memoryEntry } from "../src/hermes-import.ts";
import type { DayEntry } from "../src/day-log.ts";
import { checkKekAtStart, keksFromEnv } from "../src/kek-check.ts";
import type { Meeting } from "../src/meetings.ts";
import { localDay, localDayStart, planDigests, runDigests } from "../src/nightly.ts";
import { chatTargets } from "../src/providers.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseRest } from "../src/supabase-rest.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";

const PAGE = 200;
const DAY_MS = 24 * 3600 * 1000;

/** Reads one hermes table, all rows, paged by id. */
export type HermesReader = <T>(table: "meetings" | "memories", columns: string, after: string | number | undefined, limit: number) => Promise<T[]>;

export function hermesReader(url: string, key: string, fetchFn: typeof fetch = fetch): HermesReader {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;
  // A legacy JWT key also goes as the Bearer token; an `sb_secret_` key only in `apikey`.
  const headers: Record<string, string> = { apikey: key, Accept: "application/json", ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  return async <T,>(table: string, columns: string, after: string | number | undefined, limit: number) => {
    const filter = after === undefined ? "" : `&id=gt.${encodeURIComponent(String(after))}`;
    const res = await fetchFn(`${base}/${table}?select=${columns}&order=id.asc&limit=${limit}${filter}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`reading hermes ${table} answered ${res.status}`);
    return (await res.json()) as T[];
  };
}

async function readAll<T extends { id: string | number }>(read: HermesReader, table: "meetings" | "memories", columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let after: string | number | undefined; ; ) {
    const page = await read<T>(table, columns, after, PAGE);
    out.push(...page);
    if (page.length < PAGE) return out;
    after = page.at(-1)!.id;
  }
}

export interface ImportDeps {
  lente: SupabaseRest;
  keks: readonly Kek[];
  hermes: HermesReader;
  /** The Lente user id for the owner's email, or undefined when that email never signed in. */
  userIdFor(email: string): Promise<string | undefined>;
  call: DigestCall;
  timeZone: string;
  now(): number;
}

export interface ImportReport {
  meetings: { read: number; skipped: number; written: number };
  facts: { read: number; written: number; keptChars: number };
  digests: { planned: number; written: number };
  range?: { from: string; to: string };
}

/** The whole import; `dryRun` reads and plans but writes nothing to Lente and calls no model. */
export async function importHermes(email: string, deps: ImportDeps, dryRun: boolean): Promise<ImportReport> {
  const userId = await deps.userIdFor(email);
  const store = new SupabaseAccounts(deps.lente);
  if (!userId || !(await store.get(userId))) throw new Error(`${email} has no Lente account yet: sign in once in the app, then run the import`);
  await checkKekAtStart(deps.keks, supabaseCanaries(deps.lente));
  const dek = await new Accounts(store, deps.keks, new Set()).dek(userId);
  const stores = await openUserStores(deps.lente, userId, dek, deps.now());

  const hermesMeetings = await readAll<HermesMeeting>(deps.hermes, "meetings", "id,meeting_id,title,meeting_date,duration_sec,transcript,summary");
  const hermesMemories = await readAll<HermesMemory>(deps.hermes, "memories", "id,content,summary,created_at");
  const meetings = hermesMeetings.map(meetingFromHermes).filter((m): m is Meeting => m !== undefined);
  const facts = factsFromHermes(hermesMemories, await stores.facts.list(), randomUUID);
  const memoryEntries = hermesMemories.map(memoryEntry).filter((e): e is NonNullable<typeof e> => e !== undefined);
  const days = [...meetings.map((m) => m.startedAt), ...memoryEntries.map((e) => e.at)].map((at) => localDay(at, deps.timeZone)).sort();
  const today = localDay(deps.now(), deps.timeZone);
  const existing: string[] = [];
  for (const scope of ["day", "week", "month"] as const) existing.push(...(await stores.digests.latest(scope, 100_000)).map(digestId));
  const reachDays = days.length ? Math.ceil((deps.now() - localDayStart(days[0]!, deps.timeZone)) / DAY_MS) + 1 : 0;
  const jobs = planDigests({ today, daysWithData: days, existing, reachDays });
  const report: ImportReport = {
    meetings: { read: hermesMeetings.length, skipped: hermesMeetings.length - meetings.length, written: 0 },
    facts: { read: hermesMemories.length, written: 0, keptChars: keptFacts([...(await stores.facts.list()), ...facts]).reduce((n, f) => n + f.text.length + 3, 0) },
    digests: { planned: jobs.length, written: 0 },
    ...(days.length ? { range: { from: days[0]!, to: days.at(-1)! } } : {}),
  };
  if (dryRun) return report;

  for (const m of meetings) {
    await stores.meetings.save(m);
    report.meetings.written++;
  }
  await stores.facts.insert(facts);
  report.facts.written = facts.length;

  const meetingsOn = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const d = localDay(m.startedAt, deps.timeZone);
    meetingsOn.set(d, [...(meetingsOn.get(d) ?? []), m]);
  }
  const memoriesOn = new Map<string, DayEntry[]>();
  for (const e of memoryEntries) {
    const d = localDay(e.at, deps.timeZone);
    memoriesOn.set(d, [...(memoriesOn.get(d) ?? []), e]);
  }
  const written = await runDigests(jobs, { digests: stores.digests, loadDay: async (d) => ({ meetings: meetingsOn.get(d) ?? [], entries: memoriesOn.get(d) ?? [] }), call: deps.call, now: deps.now });
  report.digests.written = written.length;

  // The profile takes the kept facts verbatim and the newest imported meetings' notes.
  const [previous] = await stores.digests.latest("profile", 1);
  const newest = [...meetings].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  await stores.digests.put(await writeProfile({ previous, meetings: newest, keptFacts: keptFacts(await stores.facts.list()), day: today }, deps.call, deps.now()));
  return report;
}

async function userIdByEmail(url: string, key: string, email: string): Promise<string | undefined> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: { apikey: key } });
    if (!res.ok) throw new Error(`listing Lente users answered ${res.status}`);
    const users = ((await res.json()) as { users: { id: string; email?: string }[] }).users;
    const hit = users.find((u) => u.email?.toLowerCase() === want);
    if (hit) return hit.id;
    if (users.length < 200) return undefined;
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  if (!args.includes("--email") || !email || email.startsWith("--")) throw new Error("usage: node --env-file=.env scripts/import-hermes.ts --email you@example.com [--dry-run]");
  const dryRun = args.includes("--dry-run");
  const need = (name: string) => process.env[name] || (() => { throw new Error(`${name} is not set in .env`); })();
  const url = need("SUPABASE_URL");
  const secret = need("SUPABASE_SECRET_KEY");
  const target = chatTargets().find((t) => t.id === "spark-1.3-default" && t.apiKey);
  if (!dryRun && !target) throw new Error("MODEL_API_KEY is not set: the digests need Muse Spark");
  const report = await importHermes(email, {
    lente: new SupabaseRest({ url, secretKey: secret }),
    keks: keksFromEnv(process.env),
    hermes: hermesReader(need("HERMES_SUPABASE_URL"), need("HERMES_SUPABASE_SECRET_KEY")),
    userIdFor: (e) => userIdByEmail(url, secret, e),
    call: async (messages, schema, name) => (await completeChat(target!, messages, { maxTokens: 1500, extra: { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } })).text,
    timeZone: process.env.LENTE_TIME_ZONE ?? "America/Bogota",
    now: Date.now,
  }, dryRun);
  const r = report;
  console.log(`${dryRun ? "Dry run (nothing written)" : "Imported"}: meetings ${r.meetings.read} read, ${r.meetings.skipped} empty, ${r.meetings.written} written · memories ${r.facts.read} read, ${r.facts.written} facts to review written · digests ${r.digests.planned} planned, ${r.digests.written} written${r.range ? ` · days ${r.range.from} to ${r.range.to}` : ""}`);
  console.log(`Kept facts in the profile: ${r.facts.keptChars} characters (the profile's own budget is 4000); imported memories wait for review in Memoria.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    console.error(`import failed: ${error.message}`);
    process.exit(1);
  });
}
