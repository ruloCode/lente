# Tasks

Depends on: `add-accounts`, `add-task-owners`, `add-record-sheet`

## 1. The voice agent

- [x] 1.1 Verify function calling and web search over the Responses API with real calls on synthetic text; record the shapes and the price in `docs/kb/meta-api.md` [key:MODEL_API_KEY]
- [x] 1.2 `src/voice-agent.ts`: instructions, tool specs, sentence splitter, confirmation, the tool loop with cancellation; `src/voice-wire.ts`: the streamed Responses adapter (function calls, commentary, web search sources, usage); unit tests with a fake model and a fake fetch (`pnpm test`)
  - 2026-11-02: the loop also ran against the real API with fake tools on synthetic text: a task added in 2 steps (first sentence 2.2 s), a completion asked for confirmation in 3 steps, a memory question in 2, a web search in 1 (first sentence 2.3 s). The top-level `instructions` field was never cached, so the instructions go as a `developer` message (recorded in `docs/kb/meta-api.md`).
- [x] 1.3 `scripts/stub-meta.ts` answers function calls and web search, and runs endpointing sessions; tests on the stub: a memory question cites its sources, "agrega que llame a Ana el viernes" adds the right task, completing asks first, delegating runs nothing (`pnpm test`)

## 2. The session in the hub

- [x] 2.1 `AsrSession` takes the mode (`ENDPOINTING` for voice); `src/voice-session.ts`: the session over ASR events, turns, barge-in and the echo guard; unit tests (`pnpm test`)
- [x] 2.2 The `Chats` store (files and Supabase, sealed) and `GET /chat/voice`; tests on the fake PostgREST (`pnpm test`)
- [x] 2.3 `/voice` on the hub with the runtime's tools (ask, projects, tasks, record sheet, delegate) and the clip tap; tests on the stubbed hub with synthetic audio: a turn is answered, barge-in cancels the reply, a wrong token is refused, two users' sessions stay apart (`pnpm test`, `pnpm smoke`)
  - 2026-11-02: `test/voice-hub.test.ts` runs the real hub on the stub with tones at real time: the task lands in `tasks.json` with its due hint, barge-in on a long reply stops it after one sentence, the chat keeps the session without the cut reply, no meeting opens; in accounts mode no token, a bad token and a forged signature get 401, and Alice's spoken task never reaches Bob's list or chat. Web searches are priced in today's spend as `web-search` (US$ 2.50 per 1,000). A task added by voice in a project keeps `projectId` inside its sealed body.

## 3. The app

- [x] 3.1 `core/VoiceState.kt` (event reducer, sentence queue, states) with JVM tests (`./gradlew :app:testDebugUnitTest`)
- [x] 3.2 `platform/VoiceClient.kt` (OkHttp WebSocket, `VOICE_COMMUNICATION` microphone, hold-to-talk) and `ui/Voice.kt` with its button beside the ask bar; the record sheet opens from `recordSheet`
  - 2026-11-02: 83 of 83 JVM tests pass (5 new in `VoiceStateTest`); the debug APK builds. No new dependency: OkHttp's WebSocket, `AudioRecord` and `TextToSpeech` are what the app already uses.
- [ ] 3.3 On the phone: a screenshot in each state (escuchando, pensando, hablando) with test speech from the Mac's `say` [phone]
  - 2026-11-02, emulator instead (no phone on adb, only a TV): AVD `lente35` with this branch's APK, and this branch's hub on a scratch folder with the real Meta key and no Supabase.
    - The emulator's microphone gave only zeros (macOS does not grant it the host microphone), so the `say` question was streamed as a clip (`scripts/fake-clip.ts`, `PILOT_MIC_GAIN=1`). That covers the clip path: «Escuchando con el clip», meeting listening paused.
    - Screenshots in order: Te escucho, Pensando…, Hablando (with «Agrega que llame a Ana el viernes.», the reply, and the chip «Tarea agregada: Llamar a Ana»), En pausa, then Inicio's chat with the session.
    - `tasks.json` had «Llamar a Ana», `me`, «viernes». `GET /chat/voice` returned the thread.
    - With the clip gain at 10, the same audio was heard as «Agrega que ya me ama el viernes», and Lente asked to repeat instead of guessing.
  - Left for the phone: the phone's microphone, the echo canceller during barge-in, and the time to the TTS's first audio.

## 4. Measure and write down

- [x] 4.1 `scripts/bench-voice.ts`: end of speech → first reply text, → first sentence to speak, and cost per turn, over `say` questions; run it against the real API and record the numbers in `docs/benchmarks.md` and the README [key:MODEL_API_KEY]
  - 2026-11-02, 10 of 10 turns answered: `speechComplete` 323 ms p50, first sentence 2,150 ms p50 (3,167 p90), first answer sentence 3,207 ms p50 (4,783 p90), US$ 0.0044 per turn p50 (US$ 0.0487 for the run).
- [x] 4.2 Decision in `docs/kb/decisions.md`; README "What was built during the hackathon" row for the day the change lands
