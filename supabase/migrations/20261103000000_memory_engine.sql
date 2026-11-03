-- The memory engine (add-memory-engine 7.1, design decisions 3 and 6).
--
-- memory_snapshots: one row per month shard of a user's memory index (terms, postings, units and
-- vectors), sealed with the user's data key; the database sees which month, the format, the encoder's
-- id and up to when it was built, never a term, a vector or a question.
--
-- memory_digests gains two scopes: `brief` (a project's brief; `subject` is the project) and `person`
-- (a person's card; `subject` is a random id and the name stays inside the sealed body).
-- Memory cards need no table: they live in the sealed meeting record (design decision 5).

create table public.memory_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  shard text not null check (shard ~ '^[0-9]{4}-[0-9]{2}$'),
  format_version integer not null check (format_version > 0),
  encoder text not null check (length(encoder) between 1 and 80),
  built_through timestamptz not null,
  blob_enc bytea not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, shard)
);

alter table public.memory_snapshots enable row level security;
revoke all on table public.memory_snapshots from anon, authenticated;

alter table public.memory_digests drop constraint memory_digests_scope_check;
alter table public.memory_digests add constraint memory_digests_scope_check check (scope in ('profile', 'day', 'week', 'month', 'brief', 'person'));
alter table public.memory_digests add column subject uuid;
alter table public.memory_digests add constraint memory_digests_subject_check check ((scope in ('brief', 'person')) = (subject is not null));
-- One digest per scope and period, or per scope and subject.
alter table public.memory_digests drop constraint memory_digests_user_id_scope_period_start_key;
create unique index memory_digests_period_idx on public.memory_digests (user_id, scope, period_start) where subject is null;
create unique index memory_digests_subject_idx on public.memory_digests (user_id, scope, subject) where subject is not null;
