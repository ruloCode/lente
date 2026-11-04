# Tasks

Depends on: `add-voice-mode`, `add-android-app`

Deadline: the INCI session needs groups 1–4 on the owner's Samsung by **2026-11-04 12:30 Bogotá** (INCI closes at 16:00). Order of priority if time runs short: 1 → 2 → 3 → 4.1–4.3 → 5 → 6. Group 7 is the session itself.

## 1. Measure what exists (before changing anything)

- [x] 1.1 `scripts/bench-sight.ts` per design decision 7, live part only, against a running hub's `/events`; prints n, p50, p90 for frame → description and for the interval between descriptions; raw events to `results/sight-<date>/`; a unit test for its percentile and stage parsing on a recorded event fixture (`pnpm test`)
  - 2026-11-04: `scripts/bench-sight.ts` reads a hub log (local `pnpm pilot` or `modal app logs -f`) instead of `/events`: the hub already prints every stage, and on Modal `/events` needs the owner's session. Pure parsing in `src/stage-log.ts`, 6 tests on lines in the hub's exact format.
- [x] 1.2 Baseline run with today's `LIVE_PROMPT`: the clip on the glasses, 120 s looking around the desk; record the numbers in `docs/benchmarks.md` under «Sight mode (add-sight-mode)» [hw] [key:MODEL_API_KEY]
  - 2026-11-04: baseline in `docs/benchmarks.md`: 36 live calls in 125 s, model 2.30 s p50 / 5.82 s p90, frame → phone 3.36 s p50 / 6.84 s p90, max 12.1 s. Under the 4 s p50 stop rule; the tail led to `SIGHT_STALE_MS`.

## 2. The hub

- [x] 2.1 `src/sight.ts` (pure): the three prompts, `parseSight`, `spokenChunks`, `movementGuard`, with `SIGHT_LIVE_MAX_CHARS = 300`, `LOOK_READ_MAX_CHARS = 1_500`; unit tests: `=` and empty give nothing, sentence-safe trimming, chunks ≤ 200 characters, the guard on «¿puedo cruzar?», «¿es seguro bajar?», «¿hay carros?» and not on «¿qué dice el letrero?» (`pnpm test`)
  - 2026-11-04: `src/sight.ts` with 7 tests; also `SIGHT_STALE_MS = 6_000` (a description later than that after its frame is not said).
- [x] 2.2 `AssistMode` gains `"sight"` (`src/profile.ts`); in `src/pilot.ts`, `describeLive` picks the prompt by mode and drops `parseSight` → `undefined`; entering `sight` turns on camera and live, and skips reply cues; leaving restores the previous live state; hub tests on the stub (`scripts/stub-meta.ts` answering `=` and a description): `=` publishes nothing, a description publishes one `live` entry, no `cue` while in sight (`pnpm test`)
  - 2026-11-04: `test/sight-hub.test.ts` runs the real hub on the stub with the clip emulator: Ver turns camera and live on, the first frame is described, the next frames come back `=` and publish nothing, a tap gives a `VER` card while live runs, no other card appears, leaving Ver stops live. A failed look (no camera) is still said as a `VER` card.
- [x] 2.3 Guest session (design decision 6): a profile flag with its expiry, the media gate closed, no day entry and no index unit for live descriptions while on; tests (`pnpm test`)
  - 2026-11-04: hub side: `/guest/on|off`, `status.guest`, 3 h expiry; while on, no day entries (record and staged cards), no media, no voice chat lines. The hub test checks a guest look never reaches the day file. The phone switch is 4.4.
- [ ] 2.4 `pnpm smoke` still passes and gains one step: Ver on, a stub frame, one spoken-able `live` entry (`pnpm smoke`)

## 3. Looking by voice

- [x] 3.1 `look` in `src/voice-agent.ts` (tool spec, one line in the instructions) and `src/voice-tools.ts` (`VoiceBackend.look(question, mode)`); fake-backend tests: «¿qué tengo en la mano?» calls `look` describe, «léeme este papel» calls `look` read, «¿puedo cruzar?» answers with no movement instruction (`pnpm test`)
  - 2026-11-04: `look` tool and two instruction lines (look and read whole; never guide movement or identify people); tests in `test/voice-tools.test.ts` and `test/voice-agent.test.ts`; the stub agent calls `look` for «en la mano», «léeme», «qué hay frente».
- [x] 3.2 The backend in `src/pilot.ts`: newest live frame if < 1.5 s old, else `P` to the clip or the phone camera's still request, `LOOK_TIMEOUT_MS = 8_000`, one streamed Muse Spark 1.3 vision call with the sight prompt, timed in the voice trace; tests on the stubbed hub with the clip emulator: a look returns text, no device returns «No hay cámara conectada», a silent device times out with «No pude ver…» (`pnpm test`)
  - 2026-11-04: `look()` in `src/pilot.ts`: newest frame if ≤ 1.5 s old, else the next live frame or a `P` still, 8 s timeout, one streamed Spark call (300 tokens describe, 900 read), a staged `VER` card; covered by the hub test above. 734 of 734 tests, smoke 14.4 s.
- [ ] 3.3 Real calls on a synthetic image (a rendered page of public text and a rendered sign, made by the script, no photo of a person): describe and read both answer in Spanish; record time and cost in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 4. Android

- [x] 4.1 «Ver» in the recording options and `ui/Sight.kt` per design decision 4 (tap: look, long press: voice, two-finger tap: pause narration; TalkBack custom actions; live-region state); JVM tests for the state reducer (`pnpm android:test`)
  - 2026-11-04: «Ver» tile and «Empezar a ver» in the recording options; `ui/Sight.kt` (white on black, state in yellow, text that shrinks and scrolls, screen kept on; tap = look, long press = voice, two-finger tap = pause narration; one TalkBack node with actions Mirar, Hablar con Lente, Pausar/Seguir narrando, Repetir, Salir; polite live region); pure `core/Sight.kt` with 7 JVM tests. Ver keeps its own narration switch instead of flipping «Narrar». Salir returns to the mode the hub had before (assist or record). 130 of 130 JVM tests.
- [x] 4.2 `platform/Speech.kt` per design decision 5: TalkBack routing, locale preference `es-CO` → `es-US` → `es-ES`, `Prefs.speechRate` with a slider in Ajustes (0.8–2.0); every control on the Ver and voice screens has a content description; `pnpm android:test` and `pnpm android:apk`
  - 2026-11-04: `platform/Speech.kt`: with TalkBack on, text is announced through the accessibility service and the app's own voice stays silent (the hub still gets `/narrated`); otherwise `core/SpeechVoice.kt` picks es-CO → es-US → es-ES at the speed from Ajustes («Velocidad de la voz», 0.8–2.0); long text is queued in pieces. APK 4.4 MB.
- [ ] 4.3 On the Samsung with the clip on the glasses: Ver narrates, a tap looks, a long press opens voice and «¿qué tengo en la mano?» is answered out loud; then the same with TalkBack on (no double voice, actions reachable from the TalkBack menu); screenshots of each state [phone] [hw]
- [ ] 4.4 «Sesión de invitado» in Ajustes, with its status line; checked on the phone: after ten minutes of Ver as guest, the day shows no new entries and Recuerdos no new photos [phone]

## 5. How good is it

- [x] 5.1 `scripts/eval/sight-set.ts` per design decision 7 (guided, owner scores y/n, no images saved); unit test for the scoring summary (`pnpm test`)
  - 2026-11-04: automatic instead of y/n by hand: `src/sight-eval.ts` holds the set and a scorer (a banknote is right with its value in digits or words and wrong if another value appears; texts and objects by keyword, accents ignored), 4 tests; `scripts/eval/sight-set.ts` taps the Ver screen over adb, reads the answer off the screen with uiautomator, times tap → answer, and lets the owner override each score.
- [ ] 5.2 Run the set with the clip on the glasses in the owner's room light; record accuracy per kind and time p50 in `docs/benchmarks.md`; anything under 4 of 6 for banknotes, or a page not read, is left out of the video [hw] [human] [key:MODEL_API_KEY]
- [ ] 5.3 Sight bench (1.1) again with the sight prompt and with looks; record against the baseline from 1.2 [hw] [key:MODEL_API_KEY]

## 6. Docs

- [x] 6.1 `docs/kb/decisions.md`: «2026-11-04 · Ver describes and never guides movement» (with the rejected alternatives: obstacle warnings, face recognition) and «Sight is an assist mode, not a pipeline»
  - 2026-11-04: both entries written, with the measured baseline behind the "late is dropped" rule.
- [ ] 6.2 README: a «Ver» bullet in What runs today, its measured numbers in the Measured table (only from 1.2, 3.3, 5.2, 5.3), the no-guidance and no-identity rules under Privacy, and the day's row in What was built

## 7. The INCI session

- [ ] 7.1 Appointment and consent per `docs/kb/inci-session.md`; signed forms stay on paper with the owner, never in the repo [human]
- [ ] 7.2 Session: guest mode on, «Guardar audio» and «Guardar fotos» off, the scenes in `docs/kb/inci-session.md` only; footage stays off the repo [human] [phone] [hw]
