# Tasks

Depends on: `add-accounts`

## 1. Import

- [x] 1.1 `src/hermes-import.ts`: map hermes meetings and memories to Lente meetings and facts to review as design decisions 2 and 3 say; tests with synthetic rows for speakers, lines without a speaker, spread times, skipped empty meetings, and ids that are stable across runs (`pnpm test`)
- [x] 1.2 `planDigests` takes `reachDays` (default `CATCH_UP_DAYS`); test that the nightly plan is unchanged and the backfill reaches an old day (`pnpm test`)
- [x] 1.3 `scripts/import-hermes.ts`: `--email`, `--dry-run`, paging through hermes, the account check, the writes, the digest backfill and counts-only output; test against fake PostgRESTs for hermes and Lente: a second run duplicates nothing, a missing account stops before any read (`pnpm test`)
- [x] 1.4 Dry run on the owner's hermes data: the counts and the number of digests to write [key:HERMES_SUPABASE_SECRET_KEY]
  - 2026-11-02 dry run: 119 meetings and 219 memories, 2025-02-02 to 2026-10-29. As kept facts the memories came to 103,733 characters against the profile's 4,000, so they became facts to review and day material (design decision 3). With that change: 115 digests planned.
- [ ] 1.5 The import into the owner's account, then a question about an imported meeting answered with its citation [key:HERMES_SUPABASE_SECRET_KEY] [human]
  - 2026-11-02 the owner ran the import. The first run stopped at a digest reply without JSON (default effort, 1,500 tokens); the call now starts at minimal effort with 4,000 tokens and falls back to the next Spark target. The second run finished.
  - The project now holds 119 meetings (13,143 turns, 119 notes), 219 facts to review, and 116 digests (83 day, 25 week, 7 month, 1 profile).
  - Left: the question on the phone.
