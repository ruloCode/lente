// The user's rights over their memory (add-accounts 9.1, design decision 12): `GET /account/export`
// writes everything Lente keeps about them as readable JSON, section by section; `POST
// /account/delete` deletes their data key first (in the database and in the hub's memory), so any
// copy left behind is unreadable, then their sessions and devices, then every row, then their
// Supabase sign-in. Another user's rows are never touched: every step goes through `forUser`.

import type { Writable } from "node:stream";
import { openUserStores } from "./supabase-stores.ts";
import type { SupabaseRest } from "./supabase-rest.ts";

/** The order rows are deleted in after the key: what grants access first, then content, the account last. */
export const DELETE_ORDER = [
  "sessions",
  "devices",
  "meeting_turns",
  "meeting_notes",
  "day_entries",
  "facts",
  "tasks",
  "agent_actions",
  "agent_traces",
  "chat_messages",
  "memory_digests",
  "glossary",
  "usage_daily",
  "audit_events",
  "meetings",
  "accounts",
] as const;

/** Writes one user's memory as a JSON document, a section at a time, opened with their key. */
export async function exportAccount(rest: SupabaseRest, userId: string, dek: Buffer, out: Writable, now = Date.now()): Promise<void> {
  const stores = await openUserStores(rest, userId, dek, now);
  const db = rest.forUser(userId);
  const write = (text: string) => new Promise<void>((resolve, reject) => out.write(text, (error) => (error ? reject(error) : resolve())));
  const section = async (name: string, value: unknown, first = false) => write(`${first ? "" : ","}\n  ${JSON.stringify(name)}: ${JSON.stringify(value)}`);

  await write(`{\n  "format": "lente-export/v1",\n  "exportedAt": ${JSON.stringify(new Date(now).toISOString())}`);
  await section("profile", { names: stores.profile.names, assistMode: stores.profile.assistMode, everyQuestion: stores.profile.everyQuestion });
  await section("meetings", await stores.meetings.list());
  await section("facts", await stores.facts.list());
  await section("tasks", await stores.tasks.list());
  await section("actions", await stores.actions.list());
  const digests = [];
  for (const scope of ["profile", "day", "week", "month"] as const) digests.push(...(await stores.digests.latest(scope, 10_000)));
  await section("digests", digests);
  await section("glossary", stores.language.glossary);
  await section("day", await stores.day.entriesBetween(0, now + 1));
  const devices = await db.select<Record<string, unknown>>(db.query("devices").order("created_at"), "id,kind,label,created_at,last_seen_at,revoked_at");
  await section("devices", devices);
  await section("usage", await db.select(db.query("usage_daily").order("day"), "day,provider,model,calls,input_tokens,cached_tokens,output_tokens,audio_seconds,cost_micro_usd"));
  await write("\n}\n");
}

export interface DeleteDeps {
  /** Drops the user's key from the hub's memory and closes their runtime. */
  forgetInMemory(userId: string): Promise<void>;
  /** Deletes the user's Supabase sign-in (Auth admin API). */
  deleteSignIn(userId: string): Promise<void>;
}

/** Deletes an account in the order the design sets; returns the steps taken, for the log and the tests. */
export async function deleteAccount(rest: SupabaseRest, userId: string, deps: DeleteDeps): Promise<string[]> {
  const db = rest.forUser(userId);
  const steps: string[] = [];
  await db.remove(db.query("user_keys"));
  steps.push("user_keys");
  await deps.forgetInMemory(userId);
  steps.push("memory");
  for (const table of DELETE_ORDER) {
    await db.remove(db.query(table));
    steps.push(table);
  }
  await deps.deleteSignIn(userId);
  steps.push("auth");
  return steps;
}

/**
 * Supabase's Auth admin call that deletes a user, with the secret key. The exact shape is confirmed
 * on the live project by task 1.1; a missing user (404) counts as deleted.
 */
export async function deleteAuthUser(supabaseUrl: string, secretKey: string, userId: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`deleting the sign-in answered ${res.status}`);
}
