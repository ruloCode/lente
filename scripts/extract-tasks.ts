// Tasks for meetings that have none (add-task-owners 1.4, design decision 5): the same extraction a
// finished meeting gets, over done meetings from the last `--days` days (30 by default), newest
// first, so year-old commitments do not flood Tareas. Prints counts only.
//   node --env-file=.env scripts/extract-tasks.ts --email you@example.com [--days 30] --dry-run
//   node --env-file=.env scripts/extract-tasks.ts --email you@example.com [--days 30] [--redo]
// --redo removes the open tasks a previous extraction wrote in the window and extracts them again.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Accounts } from "../src/accounts.ts";
import type { DigestCall } from "../src/digests.ts";
import { checkKekAtStart, keksFromEnv } from "../src/kek-check.ts";
import { chatTargets } from "../src/providers.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseRest } from "../src/supabase-rest.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { parseTasks, tasksMessages, tasksSchema } from "../src/task-extract.ts";
import { sparkCall, userIdByEmail } from "./import-hermes.ts";

export const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

export interface ExtractReport {
  meetings: number;
  withoutTasks: number;
  read: number;
  tasks: { me: number; lente: number; other: number };
}

export async function extractTasks(
  email: string,
  deps: { lente: SupabaseRest; keks: readonly Kek[]; userIdFor(email: string): Promise<string | undefined>; call: DigestCall; now(): number },
  opts: { days: number; dryRun: boolean; redo?: boolean },
): Promise<ExtractReport> {
  const userId = await deps.userIdFor(email);
  const store = new SupabaseAccounts(deps.lente);
  if (!userId || !(await store.get(userId))) throw new Error(`${email} has no Lente account yet: sign in once in the app first`);
  await checkKekAtStart(deps.keks, supabaseCanaries(deps.lente));
  const stores = await openUserStores(deps.lente, userId, await new Accounts(store, deps.keks, new Set()).dek(userId), deps.now());
  const since = deps.now() - opts.days * DAY_MS;
  const meetings = (await stores.meetings.list()).filter((m) => m.status === "done" && m.startedAt >= since).sort((a, b) => b.startedAt - a.startedAt);
  let existing = await stores.tasks.list();
  // --redo: the open tasks an extraction wrote for meetings in the window go, so they are extracted
  // again (after the wearer set their name, say); hand-made and finished tasks stay.
  if (opts.redo && !opts.dryRun) {
    const inWindow = new Set(meetings.map((m) => m.id));
    for (const t of existing) if (t.source === "meeting" && !t.done && inWindow.has(t.meetingId)) await stores.tasks.remove(t.id);
    existing = await stores.tasks.list();
  }
  const withTasks = new Set(existing.map((t) => t.meetingId));
  // On a redo every meeting in the window is read again; what it still has (a finished task) only
  // keeps the same title from coming back.
  const todo = meetings.filter((m) => (opts.redo || !withTasks.has(m.id)) && (m.notes?.summary || m.notes?.commitments.length));
  const report: ExtractReport = { meetings: meetings.length, withoutTasks: todo.length, read: 0, tasks: { me: 0, lente: 0, other: 0 } };
  if (opts.dryRun) return report;
  for (const m of todo) {
    const found = parseTasks(await deps.call(tasksMessages(m, stores.profile.names), tasksSchema, "tasks"), existing.filter((t) => t.meetingId === m.id));
    report.read++;
    for (const t of found) {
      await stores.tasks.add({ title: t.title, who: t.who, ...(t.otherName ? { otherName: t.otherName } : {}), ...(t.due ? { due: t.due } : {}), meetingId: m.id, evidence: [], source: "meeting" }, m.endedAt ?? m.startedAt);
      report.tasks[t.who]++;
    }
  }
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const email = arg("--email");
  if (!email || email.startsWith("--")) throw new Error("usage: node --env-file=.env scripts/extract-tasks.ts --email you@example.com [--days 30] [--redo] [--dry-run]");
  const days = Number(arg("--days") ?? DEFAULT_DAYS);
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number");
  const dryRun = args.includes("--dry-run");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  const targets = chatTargets().filter((t) => t.id.startsWith("spark-1.3") && t.apiKey);
  if (!dryRun && targets.length === 0) throw new Error("MODEL_API_KEY is not set");
  const r = await extractTasks(email, { lente: new SupabaseRest({ url, secretKey: key }), keks: keksFromEnv(process.env), userIdFor: (e) => userIdByEmail(url, key, e), call: sparkCall(targets), now: Date.now }, { days, dryRun, redo: args.includes("--redo") });
  console.log(`${dryRun ? "Dry run (nothing written)" : "Extracted"}: ${r.meetings} meetings in the last ${days} days, ${r.withoutTasks} without tasks · ${r.read} read · tasks: ${r.tasks.me} yours, ${r.tasks.lente} for Lente, ${r.tasks.other} waiting on others`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    console.error(`task extraction failed: ${error.message}`);
    process.exit(1);
  });
}
