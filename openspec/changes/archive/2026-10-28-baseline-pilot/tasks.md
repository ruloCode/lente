# Tasks

The behavior in this change already exists. Each task records how it was verified on 2026-10-28.

## 1. Device and link

- [x] 1.1 Clip joins Wi-Fi and reports a 5 GHz-only network: verified on the XIAO serial log ("bambu not visible on 2.4 GHz", then "Bambu visible: channel 8, -44 dBm")
- [x] 1.2 Audio, photo, camera mode, pause and blink commands: verified with firmware `pilot-2` against `pnpm pilot` (hello frame, live photos, mode changes in the hub log)
- [x] 1.3 Frame parsing, oversize rejection and audio conditioning: `node --test test/clip-protocol.test.ts` passes

## 2. Transcription and cues

- [x] 2.1 Real-time pacing and turn id 0: simulated clip via `scripts`-style replay produced "[turn] A: … can you ship the beta by Friday?" and a cue in 1,498 ms
- [x] 2.2 `turnIdOf` keeps turn 0: covered by `test/clip-protocol.test.ts`
- [x] 2.3 Question detection and one-line cues: covered by `isQuestion` and `toCue` tests

## 3. Vision, day record, voice and app

- [x] 3.1 Look and Live with the real clip: hub log "[live] 1353 ms · 22 KB · …"
- [x] 3.2 Day record, rollover and history replay: `node --test test/day-log.test.ts` passes; `data/days/2026-10-28.jsonl` holds text only
- [x] 3.3 ElevenLabs voice through the hub: `POST /tts` returned audio (HTTP 200) in 0.57 s
- [x] 3.4 Phone page at 390 px without horizontal overflow: verified with a headless phone screenshot

## Workflow follow-up

- Archive this change so its specs become the baseline in `openspec/specs/`.
