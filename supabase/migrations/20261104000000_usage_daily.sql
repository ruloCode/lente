-- The daily spend caps (ship-hackathon 2.2, design decision 2). usage_daily already exists since
-- 20261101000000_accounts_schema.sql: one row per user, day, provider and model, numbers only, RLS on
-- with no policy, written only by the hub with the secret key. The caps read it in two ways:
--   - each account's spend today: its rows' cost_micro_usd (transcription priced from audio_seconds);
--   - everyone's spend today, at start: every row of one day, across users.
-- The second read filters on day alone, which the primary key (user_id, day, provider, model) cannot
-- serve, so this adds an index on day. Additive only: no table, column or row changes.

create index if not exists usage_daily_day_idx on public.usage_daily (day);
