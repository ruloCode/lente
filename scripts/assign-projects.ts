// Puts the meetings that have no project yet into projects (add-projects 1.4, design decision 4),
// oldest first, so later meetings see the projects earlier ones opened. One Muse Spark call per
// meeting, reading only its title, topic and note summary. Prints counts only.
//   node --env-file=.env scripts/assign-projects.ts --email you@example.com --dry-run
//   node --env-file=.env scripts/assign-projects.ts --email you@example.com

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Accounts } from "../src/accounts.ts";
import type { DigestCall } from "../src/digests.ts";
import { checkKekAtStart, keksFromEnv } from "../src/kek-check.ts";
import { assignMessages, assignSchema, parseAssignment } from "../src/projects.ts";
import { chatTargets } from "../src/providers.ts";
import type { Kek } from "../src/seal.ts";
import { SupabaseRest } from "../src/supabase-rest.ts";
import { SupabaseAccounts, openUserStores, supabaseCanaries } from "../src/supabase-stores.ts";
import { sparkCall, userIdByEmail } from "./import-hermes.ts";

export interface AssignReport {
  meetings: number;
  unassigned: number;
  assigned: number;
  none: number;
  newProjects: number;
}

export async function assignProjects(
  email: string,
  deps: { lente: SupabaseRest; keks: readonly Kek[]; userIdFor(email: string): Promise<string | undefined>; call: DigestCall; now(): number },
  dryRun: boolean,
): Promise<AssignReport> {
  const userId = await deps.userIdFor(email);
  const store = new SupabaseAccounts(deps.lente);
  if (!userId || !(await store.get(userId))) throw new Error(`${email} has no Lente account yet: sign in once in the app first`);
  await checkKekAtStart(deps.keks, supabaseCanaries(deps.lente));
  const stores = await openUserStores(deps.lente, userId, await new Accounts(store, deps.keks, new Set()).dek(userId), deps.now());
  const meetings = (await stores.meetings.list()).filter((m) => m.status === "done").sort((a, b) => a.startedAt - b.startedAt);
  const assigned = await stores.projects.assignments();
  const todo = meetings.filter((m) => !assigned.has(m.id));
  const report: AssignReport = { meetings: meetings.length, unassigned: todo.length, assigned: 0, none: 0, newProjects: 0 };
  if (dryRun) return report;
  for (const m of todo) {
    const list = await stores.projects.list();
    const choice = parseAssignment(await deps.call(assignMessages(list, m), assignSchema, "project"), list);
    if (choice.kind === "none") {
      report.none++;
      continue;
    }
    const id = choice.kind === "existing" ? choice.projectId : (await stores.projects.create(choice.name, deps.now())).id;
    if (choice.kind === "new") report.newProjects++;
    await stores.projects.assign(m.id, id);
    report.assigned++;
  }
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  if (!args.includes("--email") || !email || email.startsWith("--")) throw new Error("usage: node --env-file=.env scripts/assign-projects.ts --email you@example.com [--dry-run]");
  const dryRun = args.includes("--dry-run");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  const targets = chatTargets().filter((t) => t.id.startsWith("spark-1.3") && t.apiKey);
  if (!dryRun && targets.length === 0) throw new Error("MODEL_API_KEY is not set");
  const r = await assignProjects(email, { lente: new SupabaseRest({ url, secretKey: key }), keks: keksFromEnv(process.env), userIdFor: (e) => userIdByEmail(url, key, e), call: sparkCall(targets), now: Date.now }, dryRun);
  console.log(`${dryRun ? "Dry run (nothing written)" : "Assigned"}: ${r.meetings} meetings, ${r.unassigned} without a project · ${r.assigned} assigned, ${r.none} left out, ${r.newProjects} new projects`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    console.error(`assignment failed: ${error.message}`);
    process.exit(1);
  });
}
