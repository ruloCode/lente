# Design

## Context

hermes-os keeps the owner's history in its own Supabase project:
- `meetings`: `meeting_id` (text, the vault file name), `title`, `meeting_date`, `duration_sec`, `transcript` (one text, `Name: text` per line), `summary`, `participants`.
- `memories`: `content`, `summary`, `type` (`user`, `feedback`, `project`, `reference`, `daily`, `agent`), `tags`, `importance`, `created_at`.

Lente after `add-accounts` keeps per-user sealed rows and answers from a profile, digests and lookups (`src/ask-tiers.ts`).

## Decisions

1. **Read hermes through PostgREST with its secret key**, the same `fetch` client shape as Lente's, paged by `id`. No hermes code is reused (hard rule 1); only its column names are read from its migrations.
2. **Pure mapping** in `src/hermes-import.ts`, tested on synthetic rows:
   - Meeting id `hermes-<meeting_id>` (non-id characters replaced by `-`).
   - Status `done`, `endedAt = meeting_date + duration_sec`.
   - One turn per non-empty transcript line. `Name: text` gives a speaker when the name is short (at most 40 characters, no sentence punctuation); otherwise the whole line is the text. Turn times are spread evenly over the meeting's length (hermes has none per line).
   - Notes: the hermes summary, with no decisions or commitments (hermes never stored them separately).
   - A meeting with neither transcript nor summary is skipped.
3. **Memories become facts to review, and day material.**
   - Each memory is a `proposed` fact. Its text is `summary` if present, else `content` cut to 500 characters. Its `meetingId` is `hermes`, which matches no meeting, so the row's `meeting_id` is null. Duplicates by lowercased text are skipped, so a second run adds nothing.
   - The owner keeps the ones that matter in Memoria; only kept facts go into the profile.
   - The 2026-11-02 dry run showed why: 219 memories as kept facts were 103,733 characters, against a profile budget of 4,000.
   - Each memory also feeds the day digest of the day it was written, as a `Recuerdo (hermes)` line that is not stored in the record, so questions still reach it.
4. **Digest backfill.** `planDigests` gets an optional `reachDays`; the import passes the span from its oldest day, and the nightly default stays `CATCH_UP_DAYS`. Days and rollups are written oldest first and stop at the first failure, so a re-run resumes.
5. **Where it runs.** On the owner's laptop, against the production Supabase project, with `node --env-file=.env scripts/import-hermes.ts --email <owner>`. It loads the KEK like the hub, resolves the user by email through the Auth admin API, and refuses if that user has no Lente account yet (sign in once first).
6. **Dry run first.** `--dry-run` reads hermes and prints what would be written (counts per table and the date range) without touching Lente.

## Risks

- A large history means many digest calls. The dry run prints the number of days, weeks and months to write before any call.
- Speaker parsing is a heuristic. A line it gets wrong still lands as text, so nothing is lost.
