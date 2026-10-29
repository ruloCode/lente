# Tasks

## 1. Hub and model

- [ ] 1.1 Transcript reducer as a pure module (`src/transcript-view.ts`): snapshot, partial, turn, speaker revision and pause in; rows and the live row out; no duplicates when a turn completes or a snapshot repeats a turn; unit tests (`pnpm test`)
- [ ] 1.2 The hub keeps the latest partial (cleared on turn and on pause) and sends it after the history on connect; the status carries the session start and listening time without pauses; unit tests and a check with `pnpm smoke`
- [ ] 1.3 Help on demand: a POST route with the kind (Aportar, Pregunta, ¿De qué hablan?), refused in Solo grabar and with no turns; prompts and parsing reuse the reply's (meaning in Spanish, 90-character cap); unit tests with a fake model; one real call per kind on a synthetic dialogue, times recorded in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 2. Phone

- [ ] 2.1 Full-screen live view on Ahora while listening in Asistir or Solo grabar: state strip with elapsed time and Detener, the row with collapse, mode and clip state, the transcript through the reducer, the bottom bar with pause, hint and stop; collapse to a compact bar that reopens it; verify with the clip and the phone in both modes using test speech [hw] [phone]
- [ ] 2.2 Reply slot with its placeholder and the newest card (DILO with its meaning, or a help card); Aportar, Pregunta and ¿De qué hablan? in Asistir only; verify a cue from test speech and each action on the phone [hw] [phone]
- [ ] 2.3 Pause (time stops, "En pausa") and two-tap stop that ends an open meeting; follow the newest line with "Nuevo ↓"; catch up on reload without duplicates; verify on the phone during test speech [hw] [phone]
- [ ] 2.4 Measure on the phone, over several test sentences, the time from the hub publishing a completed turn to its row being final on the page, and the interval between partial updates; record both in `docs/benchmarks.md` [hw] [phone]
- [ ] 2.5 README "What was built during the hackathon" row for the day the change lands
