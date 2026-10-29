# Tasks

## 1. Synthetic set

- [x] 1.1 Ten scripted dialogues (English meetings, a few Spanish lines) with labels in JSON; schema check in a unit test
- [x] 1.2 Renderer to 16 kHz PCM with distinct macOS voices and per-speaker gain; verify each file plays and lengths match the script

## 2. Runner and metrics

- [x] 2.1 Replay through the hub path at real-time pace (reuse the simulated clip); verify one dialogue end to end
- [x] 2.2 Metric functions (percentiles, precision/recall, false cue rate) as pure code with tests
- [x] 2.3 `pnpm eval` writes raw events to `results/` and a dated summary; verify on the full set and paste the table into docs/benchmarks.md

## 3. Stage telemetry

- [x] 3.1 Stage timestamps on cues and scene descriptions, carried to the phone and the day record (plus "reply requested", so addressing waits are not counted as model time); verify one cue shows all stages

## 4. CI

- [ ] 4.1 GitHub Actions workflow: `pnpm typecheck && pnpm test` on Node 22.18; verify a green run on the public repo
- [ ] 4.2 Firmware compile step with arduino-cli and the ESP32 core pinned to 3.3.12; verify it fails on a deliberate syntax error in a branch
- [ ] 4.3 End-to-end smoke: clip emulator (from `harden-clip-protocol`) → hub with a stubbed Meta API → assert status, turn and cue events over SSE; verify it runs in CI under one minute
