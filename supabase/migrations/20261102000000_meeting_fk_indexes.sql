-- Covering indexes for the (meeting_id, user_id) foreign keys, flagged by Supabase's performance
-- advisor on the live project (add-accounts 1.7): without them, deleting a meeting scans each child
-- table to cascade or set null.

create index meeting_turns_meeting_user_idx on public.meeting_turns (meeting_id, user_id);
create index meeting_notes_meeting_user_idx on public.meeting_notes (meeting_id, user_id);
create index meeting_notes_user_idx on public.meeting_notes (user_id);
create index day_entries_meeting_user_idx on public.day_entries (meeting_id, user_id) where meeting_id is not null;
create index facts_meeting_user_idx on public.facts (meeting_id, user_id) where meeting_id is not null;
create index tasks_meeting_user_idx on public.tasks (meeting_id, user_id) where meeting_id is not null;
create index agent_actions_meeting_user_idx on public.agent_actions (meeting_id, user_id) where meeting_id is not null;
create index agent_traces_meeting_user_idx on public.agent_traces (meeting_id, user_id) where meeting_id is not null;
