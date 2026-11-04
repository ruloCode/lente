# Tasks

Depends on: `add-voice-mode`, `add-android-app`

Deadline: the INCI session needs groups 1–4 on the owner's Samsung by **2026-11-04 12:30 Bogotá** (INCI closes at 16:00). Order of priority if time runs short: 1 → 2 → 3 → 4.1–4.3 → 5 → 6. Group 7 is the session itself.

## 1. Measure what exists (before changing anything)

- [ ] 1.1 `scripts/bench-sight.ts` per design decision 7, live part only, against a running hub's `/events`; prints n, p50, p90 for frame → description and for the interval between descriptions; raw events to `results/sight-<date>/`; a unit test for its percentile and stage parsing on a recorded event fixture (`pnpm test`)
- [ ] 1.2 Baseline run with today's `LIVE_PROMPT`: the clip on the glasses, 120 s looking around the desk; record the numbers in `docs/benchmarks.md` under «Sight mode (add-sight-mode)» [hw] [key:MODEL_API_KEY]

## 2. The hub

- [ ] 2.1 `src/sight.ts` (pure): the three prompts, `parseSight`, `spokenChunks`, `movementGuard`, with `SIGHT_LIVE_MAX_CHARS = 300`, `LOOK_READ_MAX_CHARS = 1_500`; unit tests: `=` and empty give nothing, sentence-safe trimming, chunks ≤ 200 characters, the guard on «¿puedo cruzar?», «¿es seguro bajar?», «¿hay carros?» and not on «¿qué dice el letrero?» (`pnpm test`)
- [ ] 2.2 `AssistMode` gains `"sight"` (`src/profile.ts`); in `src/pilot.ts`, `describeLive` picks the prompt by mode and drops `parseSight` → `undefined`; entering `sight` turns on camera and live, and skips reply cues; leaving restores the previous live state; hub tests on the stub (`scripts/stub-meta.ts` answering `=` and a description): `=` publishes nothing, a description publishes one `live` entry, no `cue` while in sight (`pnpm test`)
- [ ] 2.3 Guest session (design decision 6): a profile flag with its expiry, the media gate closed, no day entry and no index unit for live descriptions while on; tests (`pnpm test`)
- [ ] 2.4 `pnpm smoke` still passes and gains one step: Ver on, a stub frame, one spoken-able `live` entry (`pnpm smoke`)

## 3. Looking by voice

- [ ] 3.1 `look` in `src/voice-agent.ts` (tool spec, one line in the instructions) and `src/voice-tools.ts` (`VoiceBackend.look(question, mode)`); fake-backend tests: «¿qué tengo en la mano?» calls `look` describe, «léeme este papel» calls `look` read, «¿puedo cruzar?» answers with no movement instruction (`pnpm test`)
- [ ] 3.2 The backend in `src/pilot.ts`: newest live frame if < 1.5 s old, else `P` to the clip or the phone camera's still request, `LOOK_TIMEOUT_MS = 8_000`, one streamed Muse Spark 1.3 vision call with the sight prompt, timed in the voice trace; tests on the stubbed hub with the clip emulator: a look returns text, no device returns «No hay cámara conectada», a silent device times out with «No pude ver…» (`pnpm test`)
- [ ] 3.3 Real calls on a synthetic image (a rendered page of public text and a rendered sign, made by the script, no photo of a person): describe and read both answer in Spanish; record time and cost in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 4. Android

- [ ] 4.1 «Ver» in the recording options and `ui/Sight.kt` per design decision 4 (tap: look, long press: voice, two-finger tap: pause narration; TalkBack custom actions; live-region state); JVM tests for the state reducer (`pnpm android:test`)
- [ ] 4.2 `platform/Speech.kt` per design decision 5: TalkBack routing, locale preference `es-CO` → `es-US` → `es-ES`, `Prefs.speechRate` with a slider in Ajustes (0.8–2.0); every control on the Ver and voice screens has a content description; `pnpm android:test` and `pnpm android:apk`
- [ ] 4.3 On the Samsung with the clip on the glasses: Ver narrates, a tap looks, a long press opens voice and «¿qué tengo en la mano?» is answered out loud; then the same with TalkBack on (no double voice, actions reachable from the TalkBack menu); screenshots of each state [phone] [hw]
- [ ] 4.4 «Sesión de invitado» in Ajustes, with its status line; checked on the phone: after ten minutes of Ver as guest, the day shows no new entries and Recuerdos no new photos [phone]

## 5. How good is it

- [ ] 5.1 `scripts/eval/sight-set.ts` per design decision 7 (guided, owner scores y/n, no images saved); unit test for the scoring summary (`pnpm test`)
- [ ] 5.2 Run the set with the clip on the glasses in the owner's room light; record accuracy per kind and time p50 in `docs/benchmarks.md`; anything under 4 of 6 for banknotes, or a page not read, is left out of the video [hw] [human] [key:MODEL_API_KEY]
- [ ] 5.3 Sight bench (1.1) again with the sight prompt and with looks; record against the baseline from 1.2 [hw] [key:MODEL_API_KEY]

## 6. Docs

- [ ] 6.1 `docs/kb/decisions.md`: «2026-11-04 · Ver describes and never guides movement» (with the rejected alternatives: obstacle warnings, face recognition) and «Sight is an assist mode, not a pipeline»
- [ ] 6.2 README: a «Ver» bullet in What runs today, its measured numbers in the Measured table (only from 1.2, 3.3, 5.2, 5.3), the no-guidance and no-identity rules under Privacy, and the day's row in What was built

## 7. The INCI session

- [ ] 7.1 Appointment and consent per `docs/kb/inci-session.md`; signed forms stay on paper with the owner, never in the repo [human]
- [ ] 7.2 Session: guest mode on, «Guardar audio» and «Guardar fotos» off, the scenes in `docs/kb/inci-session.md` only; footage stays off the repo [human] [phone] [hw]
