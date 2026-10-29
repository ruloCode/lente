# Tasks

## 1. Hub and model

- [ ] 1.1 Transcript reducer as a pure module (`src/transcript-view.ts`): snapshot, partial, turn, speaker revision and pause in; rows and the live row out; no duplicates when a turn completes or a snapshot repeats a turn; unit tests (`pnpm test`)
- [ ] 1.2 The hub keeps the latest partial, clears it on turn and on pause, and sends it after the history on connect; unit test for the kept partial and a check with `pnpm smoke`

## 2. Phone

- [ ] 2.1 Live transcript on Ahora above the camera view while listening in Asistir or Solo grabar, using the reducer: turn rows with speaker chips, the live row updating in place, DILO card above it in Asistir, none in Solo grabar, "En pausa" when paused; verify with the clip and the phone: test speech in each mode grows a live row that becomes one turn row, and a cue in Asistir shows above the transcript [hw] [phone]
- [ ] 2.2 Follow the newest line and "Nuevo ↓"; catch up on reopen without duplicates; verify on the phone by scrolling up during test speech and by reloading the page mid-speech [hw] [phone]
- [ ] 2.3 Measure on the phone, over several test sentences, the time from the hub publishing a completed turn to its row being final on the page, and the interval between partial updates; record both in `docs/benchmarks.md` [hw] [phone]
- [ ] 2.4 README "What was built during the hackathon" row for the day the change lands
