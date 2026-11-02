# Tasks

Depends on: `add-accounts`

## 1. Import

- [x] 1.1 `src/hermes-import.ts`: map hermes meetings and memories to Lente meetings and kept facts as design decisions 2 and 3 say; tests with synthetic rows for speakers, lines without a speaker, spread times, skipped empty meetings, and ids that are stable across runs (`pnpm test`)
- [x] 1.2 `planDigests` takes `reachDays` (default `CATCH_UP_DAYS`); test that the nightly plan is unchanged and the backfill reaches an old day (`pnpm test`)
- [x] 1.3 `scripts/import-hermes.ts`: `--email`, `--dry-run`, paging through hermes, the account check, the writes, the digest backfill and counts-only output; test against fake PostgRESTs for hermes and Lente: a second run duplicates nothing, a missing account stops before any read (`pnpm test`)
- [ ] 1.4 Dry run on the owner's hermes data: the counts and the number of digests to write [key:HERMES_SUPABASE_SECRET_KEY]
- [ ] 1.5 The import into the owner's account, then a question about an imported meeting answered with its citation [key:HERMES_SUPABASE_SECRET_KEY] [human]
