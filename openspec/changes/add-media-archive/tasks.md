# Tasks

Status: Phase 3 (product), after `add-memory-engine` group 6. On for the owner when group 2 lands; for other accounts only after `add-consent` is done and its terms describe media.

Depends on: `add-consent`, `add-memory-engine`

## 1. Chunks and codec (pure)

- [x] 1.1 `src/media-chunks.ts`: buffer per open segment, cut at segment close, chunk header (codec, rate, ms); IMA ADPCM encode and decode to WAV in TypeScript. Tests: round-trip on a synthetic tone, size per minute, empty and very short segments (`pnpm test`)
- [ ] 1.2 Codec bake-off: ADPCM against an Opus WASM encoder on 1 hour of test speech from `say` (encoder CPU on the Modal container, bytes per hour) plus the owner's listening check; record in `docs/benchmarks.md` and the choice in `docs/kb/decisions.md` [human]. ADPCM measured (28.8 MB/h, 472 ms CPU per audio hour, 28.4 dB); Opus not measured, waiting for the owner
- [x] 1.3 `src/keyframes.ts`: scene-change rule (description overlap, JPEG size and DC signature, 30 s floor). Tests on synthetic description sequences and JPEG fixtures (`pnpm test`)

## 2. Storage and playback

- [x] 2.1 Migration `media_chunks` (ids, times, kind, ms, bytes, codec, object; no content) with RLS and no policy for `anon`/`authenticated`; private bucket; sealed upload and open through `fetch` in `src/supabase-stores.ts`; file store under `data/media/` on the laptop. Tests with the fake PostgREST and a fake Storage that no plain column or object key carries content (`pnpm test`)
- [x] 2.2 Hub taps: audio after the silence gate into the open segment's chunk, frames after description; the gate (switch on by default, owner or accepted terms that describe media, `LENTE_MEDIA` not `off`). Tests: the owner stores by default; an account without media terms stores nothing; turning a switch off mid-segment stores nothing after that moment (`pnpm test`)
- [x] 2.3 `GET /media/audio/<segment>` and `GET /media/frame/<moment>` behind the user gate with `Range`; sources carry `media: { audio?, frame? }`. Hub tests (`pnpm test`)
- [ ] 2.4 Apply the migration and bucket on the project, run the security advisors, check that the publishable key reads nothing [key:SUPABASE_SECRET_KEY]

## 3. Retention and deletion

- [x] 3.1 Media retention setting (7, 30 default, 90) and nightly expiry with a cap per run; forget-a-day, delete-meeting and delete-account cascades remove objects before rows. Tests with a fake clock and a failure halfway (`pnpm test`). Forget-a-day's route is `add-memory-timeline` 1.8, which calls the hub's `forgetMedia` first
- [x] 3.2 Export adds media files to the archive. Test (`pnpm test`)

## 4. Phone, clip and measurements

- [ ] 4.1 Android: switches (on by default) in the options sheet with the one-time explanation, «Guardando audio · fotos» on Ahora, «Escuchar» on chips and in Revivir, the frame of the minute; e2e with the stub hub (`pnpm android:e2e`). Partly built 2026-11-03: the switches and retention in Ajustes (shown when the hub offers media) with the explanation, «Guardando audio · fotos» in the live view, «Escuchar» on chips; JVM tests. Still to do: the switches in the recording sheet with a one-time explanation, the frame of the minute, Revivir (needs `add-memory-timeline`), and `android:e2e` (the only device was the owner's phone)
- [ ] 4.2 Clip: the media light pattern while the hub reports media on; verify on the board [hw]
- [ ] 4.3 Measure storage per recorded hour (2 h of test speech) and battery with frames on and off; record in `docs/benchmarks.md` [hw] [phone]
- [x] 4.4 Retire the text-only promise in the same commit that turns media on: README privacy note, `docs/architecture.md` privacy table and diagram label, `docs/promo/naming-brief.md`, the copy in `src/pilot-page.ts` (two «solo texto» lines), `android/.../ui/Intro.kt` and `android/.../ui/Sections.kt` (two lines), the `memory-timeline` spec in `add-memory-timeline` (Revivir plays audio and frames when kept). Verify: `grep -rniE "solo texto|nunca audio|never stored|text only" README.md docs src android/app/src/main openspec/changes/add-memory-timeline` returns only historical lines (README log rows, decisions)
- [ ] 4.5 The policy pages (`add-consent`) describe media before it is turned on for other accounts; README "What was built" row [human]
