// The schema test (add-accounts 1.6): reads every migration and fails if a table lacks Row Level
// Security, keeps grants for the public or signed-in roles, or has any policy at all (the hub is the
// only client, design decision 2). It also holds the content columns to bytea, the user's rows to
// cascade from their sign-in, and rows that name a meeting to one of the same user's meetings.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const DIR = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const migrations = files.map((f) => readFileSync(new URL(f, DIR), "utf8")).join("\n");

/** The tables the design's schema names (search_terms only with group 10). */
const DESIGN_TABLES = ["accounts", "user_keys", "kek_canaries", "sessions", "devices", "meetings", "meeting_turns", "meeting_notes", "day_entries", "facts", "tasks", "agent_actions", "agent_traces", "chat_messages", "memory_digests", "glossary", "usage_daily", "audit_events"];

/** Comments out, whitespace folded, lowercased: the checks read statements, not prose. */
const normalize = (text: string): string => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();

function tablesOf(sql: string): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+) \((.*?)\);/g)) bodies.set(m[1]!, m[2]!);
  return bodies;
}

/** Every way the schema breaks the isolation rules, as readable lines; empty when it holds. */
function problems(raw: string): string[] {
  const sql = normalize(raw);
  const out: string[] = [];
  for (const [table, body] of tablesOf(sql)) {
    if (!sql.includes(`alter table public.${table} enable row level security`)) out.push(`${table}: RLS not enabled`);
    if (!sql.includes(`revoke all on table public.${table} from anon, authenticated`)) out.push(`${table}: not revoked from anon and authenticated`);
    for (const m of body.matchAll(/\b([a-z_]+_enc) ([a-z]+)/g)) if (m[2] !== "bytea") out.push(`${table}.${m[1]}: content column is ${m[2]}, not bytea`);
    if (table === "kek_canaries") {
      if (/\buser_id\b/.test(body)) out.push("kek_canaries: belongs to no user");
    } else if (!/\buser_id uuid (?:primary key|not null) references auth\.users \(id\) on delete cascade/.test(body)) {
      out.push(`${table}: user_id does not cascade from auth.users`);
    }
    if (table !== "meetings" && /\bmeeting_id uuid\b/.test(body) && !/foreign key \(meeting_id, user_id\) references public\.meetings \(id, user_id\)/.test(body)) {
      out.push(`${table}: meeting_id is not tied to the same user's meeting`);
    }
  }
  for (const m of sql.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(/g)) {
    if (!new RegExp(`revoke all on function public\\.${m[1]}\\([^)]*\\) from public, anon, authenticated`).test(sql)) out.push(`${m[1]}: function not revoked from public, anon and authenticated`);
  }
  if (/create policy/.test(sql)) out.push("a policy exists; the hub is the only client");
  if (/grant [^;]* to [^;]*\b(?:anon|authenticated|public)\b/.test(sql)) out.push("a grant to anon, authenticated or public");
  if (/disable row level security/.test(sql)) out.push("RLS is disabled somewhere");
  return out;
}

test("migrations exist, are named by timestamp, and create every table in the design", () => {
  assert.ok(files.length > 0);
  for (const f of files) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/);
  assert.deepEqual([...tablesOf(normalize(migrations)).keys()].sort(), [...DESIGN_TABLES].sort());
});

test("the migrations keep every table isolated: RLS on, no policy, no grants, sealed content, user cascade", () => {
  assert.deepEqual(problems(migrations), []);
});

test("the check fails on a new table without RLS, on a policy, and on a grant", () => {
  const leaky = `${migrations}\ncreate table public.leaky (id int, user_id uuid not null references auth.users (id) on delete cascade);`;
  assert.ok(problems(leaky).includes("leaky: RLS not enabled"));
  const policy = `${migrations}\ncreate policy "read own" on public.facts for select to authenticated using (user_id = auth.uid());`;
  assert.ok(problems(policy).includes("a policy exists; the hub is the only client"));
  const grant = `${migrations}\ngrant select on public.facts to anon;`;
  assert.ok(problems(grant).includes("a grant to anon, authenticated or public"));
  const callable = `${migrations}\ncreate function public.leaky_fn() returns int language sql as $$ select 1 $$;`;
  assert.ok(problems(callable).includes("leaky_fn: function not revoked from public, anon and authenticated"));
  const plain = migrations.replace("text_enc bytea not null,\n  meeting_id uuid,\n  evidence", "text_enc text not null,\n  meeting_id uuid,\n  evidence");
  assert.ok(problems(plain).includes("facts.text_enc: content column is text, not bytea"));
});
