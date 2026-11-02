-- Projects (add-projects, design decision 1): a project is a sealed name and a status; a meeting
-- points to at most one project. Tasks and facts belong to a project through their meeting.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name_enc bytea not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index projects_user_idx on public.projects (user_id, status);

create table public.meeting_projects (
  meeting_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
create index meeting_projects_project_idx on public.meeting_projects (project_id, user_id);
create index meeting_projects_user_idx on public.meeting_projects (user_id);

alter table public.projects enable row level security;
alter table public.meeting_projects enable row level security;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.meeting_projects from anon, authenticated;
