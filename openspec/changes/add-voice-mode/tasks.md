# Tasks

Depends on: `add-accounts`, `add-task-owners`, `add-record-sheet`

## 1. The voice agent

- [x] 1.1 Verify function calling and web search over the Responses API with real calls on synthetic text; record the shapes and the price in `docs/kb/meta-api.md` [key:MODEL_API_KEY]
- [x] 1.2 `src/voice-agent.ts`: instructions, tool specs, sentence splitter, confirmation, the tool loop with cancellation; `src/voice-wire.ts`: the streamed Responses adapter (function calls, commentary, web search sources, usage); unit tests with a fake model and a fake fetch (`pnpm test`)
  - 2026-11-02: the loop also ran against the real API with fake tools on synthetic text: a task added in 2 steps (first sentence 2.2 s), a completion asked for confirmation in 3 steps, a memory question in 2, a web search in 1 (first sentence 2.3 s). The top-level `instructions` field was never cached, so the instructions go as a `developer` message (recorded in `docs/kb/meta-api.md`).
- [x] 1.3 `scripts/stub-meta.ts` answers function calls and web search, and runs endpointing sessions; tests on the stub: a memory question cites its sources, "agrega que llame a Ana el viernes" adds the right task, completing asks first, delegating runs nothing (`pnpm test`)

## 2. The session in the hub

- [ ] 2.1 `AsrSession` takes the mode (`ENDPOINTING` for voice); `src/voice-session.ts`: the session over ASR events, turns, barge-in and the echo guard; unit tests (`pnpm test`)
- [ ] 2.2 The `Chats` store (files and Supabase, sealed) and `GET /chat/voice`; tests on the fake PostgREST (`pnpm test`)
- [ ] 2.3 `/voice` on the hub with the runtime's tools (ask, projects, tasks, record sheet, delegate) and the clip tap; tests on the stubbed hub with synthetic audio: a turn is answered, barge-in cancels the reply, a wrong token is refused, two users' sessions stay apart (`pnpm test`, `pnpm smoke`)

## 3. The app

- [ ] 3.1 `core/VoiceState.kt` (event reducer, sentence queue, states) with JVM tests (`./gradlew :app:testDebugUnitTest`)
- [ ] 3.2 `platform/VoiceClient.kt` (OkHttp WebSocket, `VOICE_COMMUNICATION` microphone, hold-to-talk) and `ui/Voice.kt` with its button beside the ask bar; the record sheet opens from `recordSheet`
- [ ] 3.3 On the phone: a screenshot in each state (escuchando, pensando, hablando) with test speech from the Mac's `say` [phone]

## 4. Measure and write down

- [ ] 4.1 `scripts/bench-voice.ts`: end of speech → first reply text, → first sentence to speak, and cost per turn, over `say` questions; run it against the real API and record the numbers in `docs/benchmarks.md` and the README [key:MODEL_API_KEY]
- [ ] 4.2 Decision in `docs/kb/decisions.md`; README "What was built during the hackathon" row for the day the change lands
