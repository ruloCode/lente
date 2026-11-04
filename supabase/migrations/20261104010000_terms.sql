-- The preview terms (ship-hackathon 2.3, design decision 4): which version an account accepted and
-- when. Until it has accepted the current one, the hub answers its data routes with 428. Additive
-- only: two nullable columns, so existing accounts read as "not accepted yet" and nothing else changes.
-- The table keeps its RLS on, no policy and no grants (20261101000000_accounts_schema.sql).

alter table public.accounts
  add column if not exists terms_version text check (terms_version is null or length(terms_version) <= 64),
  add column if not exists terms_accepted_at timestamptz;
