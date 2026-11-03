# Design

## Context

The day record (`src/day-log.ts`) holds `DayEntry` items, each with `at` in ms: `turn`, `cue`, `live`, `summary`. A meeting (`src/meetings.ts`) has `startedAt`, `endedAt` and `turns`, each with `at`. Kept facts come from `add-memory-review`. With `add-accounts`, all of these live sealed in Supabase and are opened in the hub's memory by the user's runtime (`src/cached-stores.ts`). The nightly digests (`src/digests.ts`, `src/nightly.ts`) already read a whole day once per user, and `src/ask-tiers.ts` already names moments of a day as `d<day>:<n>` and meeting turns as `m…:t<n>`.

## Decisions

- **Moments are computed, not stored.** `src/moments.ts` is pure: `momentsOf(day, entries, meetings, facts) → Moment[]`. Kinds: `meeting`, `heard`, `seen`, `fact`, `note`.
  - A `heard` moment groups consecutive `turn` entries outside a meeting. A gap of more than `MOMENT_GAP_MS` (5 min) starts a new one.
  - A `seen` moment is one `live` or Look description.
  - Ids reuse the ones `ask-tiers` already cites, so chat chips, highlights and Revivir point at the same things. Nothing new to migrate, nothing to keep in sync.
- **Replay is a timeline of lines.** `replayOf(moment) → { startAt, lines: { offsetMs, kind, speaker?, text, sourceId }[] }`. Offsets come from the stored `at`, so subtitles play at the real pace. The player compresses silences longer than `REPLAY_MAX_GAP_MS` (8 s) so a quiet stretch doesn't look frozen, and it shows that it skipped.
- **Highlights ride on the day digest.** The day digest schema gains `highlights: { id, why }[]` (at most `MAX_HIGHLIGHTS` = 5, `why` at most 80 characters). The writer keeps only ids that exist among that day's moments. A laptop hub without digests shows rings without marks. No extra model call.
- **Relive counter.** `POST /moments/<id>/relived` increments `relive_counts` (accounts) or `data/relive.json` (laptop). Both hold numbers only. At `RELIVE_NUDGE_AT` (3), the replay response carries `nudge: true` and the app offers «Ver el resumen» and «¿Lo anoto como tarea?» (through the existing task add) before it plays. «Revivir igual» always plays. Nothing is blocked.
- **The centre shows the count in words.** The centre of the rings reads «Revivido 3 veces» rather than a symbolic counter. That keeps the meaning plain and keeps Lente visually apart from the series' interface.
- **Notes are kept facts.** A note is a fact the wearer wrote, already confirmed, with `moment: <id>` in its sealed JSON. The chat and the profile pick it up as they do any kept fact.
- **Forget a day is a cascade the hub runs in order:**
  1. the day digest;
  2. week and month digests whose `sources` name that day (deleted, then rebuilt by the catch-up of `src/nightly.ts` without it);
  3. facts and notes whose source is in that day;
  4. meetings started that day;
  5. the day record.

  It needs `{"confirm": true}` and is written as one RPC in accounts mode so a failure halfway leaves the day whole. The profile is rewritten on the next meeting close as today.
- **Rings on Android.** A Compose `Canvas` with three rings: days (the last 30, newest at the top), hours of the selected day, and minutes of the selected hour. Rotation follows the drag angle with a fling and settles on a step with a light haptic tick. Hours and minutes without moments are drawn dimmer and skipped by the fling. The fan of cards lists the moments that start inside the selected step.
- **Voice opens, the phone plays.** `relive_moment({ when, about? })` resolves the time phrase on the hub with a pure parser for «hoy», «ayer», weekdays, «esta mañana/tarde» and «la reunión de/con …» (matched against meeting titles and project names). It emits a `relive` event to the phone with the moment id and says one sentence aloud («Abro la reunión del martes con Ana»). The subtitles stay on the screen rather than read aloud, so the wearer isn't talked over in a meeting.

## Risks

- **Looping.** The episode's harm. The counter and nudge are mild by design. The behaviour and copy are checked with the owner on the phone (`[human]`) before release.
- **Forgetting is irreversible.** A confirmation names what will go (N meetings, N notes). There is no undo. Backups (`add-accounts` 4.6) roll over after 7 days, which the privacy note must say.
- **Long days.** A day with hundreds of turns builds hundreds of `heard` lines. `GET /moments` returns moments without lines; replay loads one moment's lines at a time.
- **Similarity to the series.** Only the idea of rings and re-watching is taken. The concept images in `docs/design/image-ref/bm-*` were generated for Lente, and one needs regenerating before it is committed (task 5.1).
