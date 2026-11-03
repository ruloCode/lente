// The user's rights over their memory (add-accounts 9.1, design decision 12): `GET /account/export`
// writes everything Lente keeps about them as readable JSON, section by section; `POST
// /account/delete` deletes their data key first (in the database and in the hub's memory), so any
// copy left behind is unreadable, then their sessions and devices, then every row, then their
// Supabase sign-in. Another user's rows are never touched: every step goes through `forUser`.

import type { Writable } from "node:stream";
import { openUserStores } from "./supabase-stores.ts";
import { SupabaseError, type SupabaseRest } from "./supabase-rest.ts";
import type { SupabaseStorage } from "./supabase-storage.ts";
import { decodeAdpcm, wav } from "./media-chunks.ts";

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
  "memory_snapshots",
  "media_chunks",
  "meeting_projects",
  "projects",
  "glossary",
  "usage_daily",
  "audit_events",
  "meetings",
  "accounts",
] as const;

/** Tables added by later migrations (add-memory-engine 7.1, add-media-archive 2.1), absent until those are applied. */
const LATER_TABLES: ReadonlySet<string> = new Set(["memory_snapshots", "media_chunks"]);
const isMissingTable = (error: unknown): boolean => error instanceof SupabaseError && (error.code === "PGRST205" || error.code === "42P01");

/** Writes one user's memory as a JSON document, a section at a time, opened with their key. */
export async function exportAccount(rest: SupabaseRest, userId: string, dek: Buffer, out: Writable, now = Date.now(), storage?: SupabaseStorage): Promise<void> {
  const stores = await openUserStores(rest, userId, dek, now, storage);
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
  for (const scope of ["profile", "day", "week", "month", "brief", "person"] as const) digests.push(...(await stores.digests.latest(scope, 10_000)));
  await section("digests", digests);
  await section("glossary", stores.language.glossary);
  await section("chat", await stores.chats.recent(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  const assigned = await stores.projects.assignments();
  await section("projects", (await stores.projects.list()).map((p) => ({ ...p, meetings: [...assigned].filter(([, id]) => id === p.id).map(([m]) => m) })));
  await section("day", await stores.day.entriesBetween(0, now + 1));
  const devices = await db.select<Record<string, unknown>>(db.query("devices").order("created_at"), "id,kind,label,created_at,last_seen_at,revoked_at");
  await section("devices", devices);
  await section("usage", await db.select(db.query("usage_daily").order("day"), "day,provider,model,calls,input_tokens,cached_tokens,output_tokens,audio_seconds,cost_micro_usd"));
  if (stores.media) {
    // Kept media (add-media-archive 3.2): each object opened with the key, one entry at a time, as its file's bytes in base64.
    await write(`,\n  "media": [`);
    let first = true;
    for (const r of await stores.media.list(0, now + 1)) {
      const found = await stores.media.get(r.kind, r.ref);
      if (!found) continue;
      const file = `${r.kind}/${r.ref.replace(/:/g, "_")}.${r.kind === "audio" ? "wav" : "jpg"}`;
      const bytes = r.kind === "audio" && r.codec === "adpcm" ? wav(decodeAdpcm(found.data)) : found.data;
      await write(`${first ? "" : ","}\n    ${JSON.stringify({ ...r, file, base64: Buffer.from(bytes).toString("base64") })}`);
      first = false;
    }
    await write("\n  ]");
  }
  await write("\n}\n");
}

/** What the account screen shows: who, and this month's spend against the cap (US$; the cap may be unset). */
export async function accountSummary(rest: SupabaseRest, userId: string, email: string | undefined, capCents: number | undefined, now = Date.now()) {
  const db = rest.forUser(userId);
  const monthStart = new Date(now).toISOString().slice(0, 8) + "01";
  const rows = await db.select<{ cost_micro_usd: number }>(db.query("usage_daily").gte("day", monthStart), "cost_micro_usd");
  const spentMicro = rows.reduce((sum, r) => sum + Number(r.cost_micro_usd ?? 0), 0);
  return { email: email ?? null, spend: { month: monthStart.slice(0, 7), usd: Math.round(spentMicro / 1e4) / 100, capUsd: capCents === undefined ? null : capCents / 100 } };
}

export interface DeleteDeps {
  /** Drops the user's key from the hub's memory and closes their runtime. */
  forgetInMemory(userId: string): Promise<void>;
  /** Deletes the user's Supabase sign-in (Auth admin API). */
  deleteSignIn(userId: string): Promise<void>;
  /** Media objects (add-media-archive 3.1): removed before their rows, from the keys the rows hold. */
  storage?: SupabaseStorage;
}

/** Deletes an account in the order the design sets; returns the steps taken, for the log and the tests. */
export async function deleteAccount(rest: SupabaseRest, userId: string, deps: DeleteDeps): Promise<string[]> {
  const db = rest.forUser(userId);
  const steps: string[] = [];
  await db.remove(db.query("user_keys"));
  steps.push("user_keys");
  await deps.forgetInMemory(userId);
  steps.push("memory");
  if (deps.storage) {
    // Objects before rows: the rows are the only place their keys are written.
    const objects = (await db.select<{ object: string }>(db.query("media_chunks"), "object")).map((r) => String(r.object));
    await deps.storage.remove("media", objects);
    steps.push("media objects");
  }
  for (const table of DELETE_ORDER) {
    try {
      await db.remove(db.query(table));
      steps.push(table);
    } catch (error) {
      // Tables of a migration not applied yet hold nothing to delete; any other failure stops the deletion.
      if (!LATER_TABLES.has(table) || !isMissingTable(error)) throw error;
      steps.push(`${table} (not created yet)`);
    }
  }
  await deps.deleteSignIn(userId);
  steps.push("auth");
  return steps;
}

/**
 * Supabase's Auth admin call that deletes a user, with the secret key. The key goes in `apikey`
 * only: an `sb_secret_` key is not a JWT, so it cannot be a Bearer token (docs/kb/supabase.md).
 * A missing user (404) counts as deleted.
 */
export async function deleteAuthUser(supabaseUrl: string, secretKey: string, userId: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: secretKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`deleting the sign-in answered ${res.status}`);
}
