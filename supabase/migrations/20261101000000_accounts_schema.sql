-- Lente accounts: one structured, per-user memory (add-accounts, design "Schema").
-- Every table is in public, has Row Level Security enabled with no policy, and is revoked from the
-- anon and authenticated roles: only the hub, with the secret key, reads or writes. Every *_enc
-- column is bytea sealed by the hub (AES-256-GCM under the user's data key, src/seal.ts); the
-- database never sees content in the clear. Child rows carry (meeting_id, user_id) foreign keys so a
-- row can never point at another user's meeting.

-- Accounts and keys ---------------------------------------------------------------------------------

create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name_enc bytea,
  locale text not null default 'es-CO',
  time_zone text,
  assist_mode text not null default 'assist' check (assist_mode in ('assist', 'record')),
  monthly_cap_cents integer check (monthly_cap_cents >= 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kek_version integer not null check (kek_version between 1 and 65535),
  wrapped_dek bytea not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- No user_id: a fixed value sealed under each KEK version, opened at start (design decision 5).
create table public.kek_canaries (
  kek_version integer primary key check (kek_version between 1 and 65535),
  sealed bytea not null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique,
  refresh_enc bytea not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index sessions_user_idx on public.sessions (user_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('clip', 'desktop', 'mcp')),
  label text not null check (char_length(label) between 1 and 40),
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index devices_user_idx on public.devices (user_id);

-- Meetings ------------------------------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'running' check (status in ('running', 'extracting', 'done', 'too-short', 'failed')),
  end_reason text check (end_reason in ('manual', 'silence', 'restart', 'max-length', 'mode')),
  auto boolean not null default false,
  topic text,
  title_enc bytea,
  title_generated boolean not null default false,
  asked integer not null default 0 check (asked >= 0),
  answered integer not null default 0 check (answered >= 0),
  dropped_items integer not null default 0 check (dropped_items >= 0),
  error_enc bytea,
  -- The id the hub and the phone use (m20261101120000); file ids keep it on import.
  legacy_id text not null,
  unique (id, user_id),
  unique (user_id, legacy_id)
);
create index meetings_user_started_idx on public.meetings (user_id, started_at desc);

create table public.meeting_turns (
  meeting_id uuid not null,
  seq integer not null check (seq >= 0),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null,
  start_at timestamptz,
  addressed boolean not null default false,
  speaker_enc bytea,
  wearer boolean not null default false,
  text_enc bytea not null,
  primary key (meeting_id, seq),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade
);
create index meeting_turns_user_at_idx on public.meeting_turns (user_id, at);

create table public.meeting_notes (
  meeting_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  body_enc bytea not null,
  model text,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade
);

-- The day record ------------------------------------------------------------------------------------

create table public.day_entries (
  -- Chosen by the hub, so the sealed body can be bound to its row before the insert.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null,
  kind text not null,
  label text,
  meeting_id uuid,
  body_enc bytea not null,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete set null (meeting_id)
);
create index day_entries_user_at_idx on public.day_entries (user_id, at);

-- What Lente learned and did ------------------------------------------------------------------------

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'kept')),
  text_enc bytea not null,
  meeting_id uuid,
  evidence text[] not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete set null (meeting_id)
);
create index facts_user_idx on public.facts (user_id, created_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title_enc bytea not null,
  due date,
  done_at timestamptz,
  meeting_id uuid,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete set null (meeting_id)
);
create index tasks_user_done_idx on public.tasks (user_id, done_at nulls first);

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'failed')),
  payload_enc bytea not null,
  outcome_enc bytea,
  meeting_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete set null (meeting_id)
);
create index agent_actions_user_idx on public.agent_actions (user_id, created_at desc);

create table public.agent_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meeting_id uuid,
  body_enc bytea not null,
  created_at timestamptz not null default now(),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete set null (meeting_id)
);
create index agent_traces_user_idx on public.agent_traces (user_id, created_at desc);

-- Chat and the tiered memory ------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'lente')),
  text_enc bytea not null,
  refs jsonb not null default '[]', -- kinds and ids only, never labels or text
  found boolean,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (user_id, thread_id, created_at);

create table public.memory_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('profile', 'day', 'week', 'month')),
  period_start date not null,
  body_enc bytea not null,
  source_count integer not null default 0 check (source_count >= 0),
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, scope, period_start)
);

create table public.glossary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body_enc bytea not null,
  created_at timestamptz not null default now()
);
create index glossary_user_idx on public.glossary (user_id);

-- Numbers only --------------------------------------------------------------------------------------

create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  provider text not null,
  model text not null,
  calls bigint not null default 0 check (calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_tokens bigint not null default 0 check (cached_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  audio_seconds numeric(12, 3) not null default 0 check (audio_seconds >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  primary key (user_id, day, provider, model)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null check (actor ~ '^(wearer|agent|device:[0-9a-f-]+|mcp:[A-Za-z0-9._-]+)$'),
  action text not null,
  target_kind text,
  target_id text
);
create index audit_events_user_at_idx on public.audit_events (user_id, at desc);

-- Isolation: RLS on, no policy, no grants to the public or signed-in roles --------------------------

alter table public.accounts enable row level security;
alter table public.user_keys enable row level security;
alter table public.kek_canaries enable row level security;
alter table public.sessions enable row level security;
alter table public.devices enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_turns enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.day_entries enable row level security;
alter table public.facts enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_actions enable row level security;
alter table public.agent_traces enable row level security;
alter table public.chat_messages enable row level security;
alter table public.memory_digests enable row level security;
alter table public.glossary enable row level security;
alter table public.usage_daily enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.accounts from anon, authenticated;
revoke all on table public.user_keys from anon, authenticated;
revoke all on table public.kek_canaries from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
revoke all on table public.meetings from anon, authenticated;
revoke all on table public.meeting_turns from anon, authenticated;
revoke all on table public.meeting_notes from anon, authenticated;
revoke all on table public.day_entries from anon, authenticated;
revoke all on table public.facts from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.agent_actions from anon, authenticated;
revoke all on table public.agent_traces from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;
revoke all on table public.memory_digests from anon, authenticated;
revoke all on table public.glossary from anon, authenticated;
revoke all on table public.usage_daily from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
