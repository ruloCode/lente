# Tasks

## 1. Protocol v2 on the hub

- [ ] 1.1 Hello parsing and major-version check, audio header with sequence and capture time, loss accounting with silence fill; unit tests for each (`pnpm test`)
- [ ] 1.2 Shared fixtures file `test/fixtures/frames.json` decoded by the tests
- [ ] 1.3 Turns carry start/end offsets in the session audio; unit test on the offset mapping

## 2. Firmware

- [ ] 2.1 Firmware sends hello v2 and the eight-byte audio header; verify against the hub log and a deliberate frame drop
- [ ] 2.2 Self-test encodes the fixture frames and compares bytes; verify over serial

## 3. Emulator and docs

- [ ] 3.1 `scripts/fake-clip.ts` (WAV + JPEG folder, real-time pace, obeys commands, reproducible); verify the phone shows a transcript and a cue with no hardware
- [ ] 3.2 `docs/PROTOCOL.md` with frame layouts, command table, handshake, versioning rules and an annotated hex example; verify every example decodes in a test
- [ ] 3.3 Old-firmware message on the phone when a v1 clip connects; verify with the current `pilot-2` firmware before reflashing
