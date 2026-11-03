# Tasks

Status: post-hackathon (Could). Group 2.3 (Revivir from a meeting's detail) is the slice that may enter the video if there is time before 2026-11-04 21:00 ET.

## 1. Hub: moments and highlights

- [ ] 1.1 `src/moments.ts`: `momentsOf` (meeting, heard grouped by `MOMENT_GAP_MS`, seen, fact, note) and `replayOf` (offsets from `at`, silences over `REPLAY_MAX_GAP_MS` compressed and marked); tests on PROBE- synthetic days, including a day with no meetings and a meeting that crosses midnight (`pnpm test`)
- [ ] 1.2 `GET /moments?day=YYYY-MM-DD` (moments without lines, highlights, relive counts) and `GET /moments/<id>/replay`, on file and Supabase stores behind the user gate; tests with the fake PostgREST that no content reaches a plain column or a log line (`pnpm test`)
- [ ] 1.3 Relive counter: `POST /moments/<id>/relived`, `relive_counts` migration with RLS and no policy for `anon`/`authenticated`, `data/relive.json` on the laptop; `nudge` from `RELIVE_NUDGE_AT`; tests (`pnpm test`)
- [ ] 1.4 Apply the `relive_counts` migration on the project, run the security advisors, check with the publishable key that it returns no rows [key:SUPABASE_SECRET_KEY]
- [ ] 1.5 Notes: `POST /moments/<id>/note` writes a kept fact with `moment` in its sealed JSON; the chat cites it; tests (`pnpm test`)
- [ ] 1.6 Highlights in the day digest schema, ids validated against the day's moments, at most 5; tests with a fake model that returns a made-up id (`pnpm test`)
- [ ] 1.7 One real nightly run on a synthetic day returns grounded highlights; record the extra tokens per day in `docs/benchmarks.md` [key:MODEL_API_KEY]
- [ ] 1.8 Forget a day: `POST /days/<day>/forget` with `confirm`, the cascade in design.md as one RPC in accounts mode, week and month digests rebuilt by the catch-up; tests for the order and for a failure halfway (`pnpm test`), then verify on the project with a test account [key:SUPABASE_SECRET_KEY]

## 2. App: Tu historia and Revivir

- [ ] 2.1 Kotlin core: moments and replay models, the replay clock (play, pause, scrub, back to start, gap compression) as pure code with JVM tests
- [ ] 2.2 Tu historia: rings (days, hours, minutes) with drag, fling, step haptics and dimmed empty steps; the fan of cards; centre with relative day, time and «Revivido N veces»; highlights as marks; menu entry; e2e with the stub hub (`pnpm android:e2e`)
- [ ] 2.3 Revivir: subtitles at their pace, the camera line of that minute, source chips to the meeting at the turn, the nudge at the third time; also reachable from a meeting's detail («Revivir»); e2e with the stub hub (`pnpm android:e2e`)
- [ ] 2.4 Notes on a moment and «Olvidar este día» with the confirmation that names what goes; e2e with the stub hub (`pnpm android:e2e`)
- [ ] 2.5 On the phone against a hub with synthetic meetings from test speech: rings, a replay, a note, the nudge and forgetting a day; screenshots in light and dark [phone]
- [ ] 2.6 The feel of the turn (drag, fling, haptic step) and the nudge's tone checked by the owner [human]

## 3. Voice

- [ ] 3.1 Pure time-phrase parser («hoy», «ayer», weekdays, «esta mañana/tarde», «la reunión de/con …») with tests in Spanish and English (`pnpm test`)
- [ ] 3.2 `relive_moment` tool in `src/voice-agent.ts`, the `relive` event and the phone opening the moment; tests with the stub that answers tool calls (`pnpm test`)
- [ ] 3.3 «Lente, revive la reunión del martes» on the phone with test speech from the Mac's `say` [phone]

## 4. Bench

- [ ] 4.1 `scripts/bench-moments.ts`: `GET /moments` and replay latency p50/p95 on a synthetic history of 60 meetings over 3 months, against the laptop hub and the Modal hub; record in `docs/benchmarks.md` [key:MODAL_TOKEN_ID]

## 5. Docs

- [ ] 5.1 Regenerate `docs/design/image-ref/bm-01-recuerdos-anillos.png` without real company or client names and with day → hour → minute rings, and remove «Compartir» from `bm-04-tu-historia.png`; commit the three concept images only after that [human]
- [ ] 5.2 README "Related work": one line citing the episode (the shape of the timeline and re-watching; nothing copied); privacy note: relive counter, forgetting, backups rolling over after 7 days
- [ ] 5.3 `docs/kb/decisions.md`: computed moments with shared ids, highlights inside the day digest, the count in words, forgetting as a cascade
- [ ] 5.4 README "What was built during the hackathon" row for the day the change lands
