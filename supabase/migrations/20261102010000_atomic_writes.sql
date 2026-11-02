-- Atomic writes (add-accounts 4.4): the two writes that must land whole or not at all, each one
-- transaction in a function. Only the hub calls them, with the secret key; execution is revoked from
-- the public and signed-in roles like every table. Content arrives already sealed (bytea as \x hex).

-- An account and its wrapped data key: an account row without its key would be unreadable.
create or replace function public.lente_create_account(
  p_user_id uuid,
  p_kek_version integer,
  p_wrapped_dek bytea,
  p_locale text,
  p_created_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.user_keys (user_id, kek_version, wrapped_dek, created_at)
  values (p_user_id, p_kek_version, p_wrapped_dek, p_created_at);
  insert into public.accounts (user_id, locale, created_at)
  values (p_user_id, coalesce(p_locale, 'es-CO'), p_created_at);
end;
$$;

-- A meeting with the turns and notes that changed since the last save. `p_meeting` and `p_notes`
-- may be null (unchanged); `p_turns` is an array, possibly empty. A row id that belongs to another
-- user is never updated: the meeting upsert skips it and the turns' foreign key then fails, which
-- rolls the whole call back.
create or replace function public.lente_save_meeting(
  p_user_id uuid,
  p_meeting jsonb,
  p_turns jsonb,
  p_notes jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_meeting is not null then
    insert into public.meetings as m (id, user_id, legacy_id, started_at, ended_at, status, end_reason, auto, topic, title_enc, title_generated, asked, answered, dropped_items, error_enc)
    select r.id, p_user_id, r.legacy_id, r.started_at, r.ended_at, r.status, r.end_reason, r.auto, r.topic, r.title_enc, r.title_generated, r.asked, r.answered, r.dropped_items, r.error_enc
    from jsonb_populate_record(null::public.meetings, p_meeting) as r
    on conflict (id) do update set
      legacy_id = excluded.legacy_id, started_at = excluded.started_at, ended_at = excluded.ended_at,
      status = excluded.status, end_reason = excluded.end_reason, auto = excluded.auto, topic = excluded.topic,
      title_enc = excluded.title_enc, title_generated = excluded.title_generated, asked = excluded.asked,
      answered = excluded.answered, dropped_items = excluded.dropped_items, error_enc = excluded.error_enc
    where m.user_id = p_user_id;
  end if;

  insert into public.meeting_turns as t (meeting_id, seq, user_id, at, start_at, addressed, speaker_enc, wearer, text_enc)
  select r.meeting_id, r.seq, p_user_id, r.at, r.start_at, r.addressed, r.speaker_enc, r.wearer, r.text_enc
  from jsonb_populate_recordset(null::public.meeting_turns, coalesce(p_turns, '[]'::jsonb)) as r
  on conflict (meeting_id, seq) do update set
    at = excluded.at, start_at = excluded.start_at, addressed = excluded.addressed,
    speaker_enc = excluded.speaker_enc, wearer = excluded.wearer, text_enc = excluded.text_enc
  where t.user_id = p_user_id;

  if p_notes is not null then
    insert into public.meeting_notes as n (meeting_id, user_id, body_enc, model, created_at)
    select r.meeting_id, p_user_id, r.body_enc, r.model, r.created_at
    from jsonb_populate_record(null::public.meeting_notes, p_notes) as r
    on conflict (meeting_id) do update set body_enc = excluded.body_enc, model = excluded.model, created_at = excluded.created_at
    where n.user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.lente_create_account(uuid, integer, bytea, text, timestamptz) from public, anon, authenticated;
revoke all on function public.lente_save_meeting(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.lente_create_account(uuid, integer, bytea, text, timestamptz) to service_role;
grant execute on function public.lente_save_meeting(uuid, jsonb, jsonb, jsonb) to service_role;
