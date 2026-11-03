-- The media archive (add-media-archive 2.1, design decision 2): speech audio per segment and keyframes
-- per moment, kept as sealed objects in a private bucket. The row says only which segment or moment,
-- when, how long, how big, which codec and where the object is; the object key holds no content either.

create table public.media_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('audio', 'frame')),
  ref text not null check (ref ~ '^[a-zA-Z0-9:._-]{1,80}$'),
  at timestamptz not null,
  ms integer not null check (ms >= 0),
  bytes integer not null check (bytes >= 0),
  codec text not null check (codec in ('adpcm', 'opus', 'jpeg')),
  object text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index media_chunks_user_at_idx on public.media_chunks (user_id, at);

alter table public.media_chunks enable row level security;
revoke all on table public.media_chunks from anon, authenticated;

-- A private bucket: no policy, so only the hub's secret key reads or writes it.
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;
