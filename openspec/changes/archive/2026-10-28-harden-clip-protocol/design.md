# Design

## Context

`src/clip-protocol.ts` already isolates parsing as pure code with tests. The firmware writes frames with a mutex shared by the audio task and the main loop. Prior art studied (ideas only, no code reused): MentraOS keeps its wire protocol in a dependency-free package with fixtures and a major-version check, and tags transcript tokens with audio positions; Omi's devices declare codec ids and number their packets; Brilliant Labs ships an emulator and a `PROTOCOL.md`.

## Goals / Non-Goals

**Goals:**
- A protocol a judge can read in five minutes and verify with one test file.
- Lost audio is counted, not silently skipped.

**Non-Goals:**
- Compression, encryption on the LAN, or multi-clip sessions.

## Decisions

1. **Two layers in one module.** Transport (framing, reassembly) and messages (hello, audio header, JPEG, commands) are separate functions in `src/clip-protocol.ts`, so the WebSocket transport in `add-cloud-hub` reuses the message layer unchanged.
2. **Eight-byte audio header** (u32 sequence, u32 capture ms). Alternative: timestamps only; rejected because sequence numbers make loss detection trivial even when clocks drift.
3. **Hello as JSON** (`{proto:"2.0", fw, codec:"pcm16", rate:16000, device}`), small and human-readable in logs. The major/minor rule follows semantic versioning.
4. **Fixtures as data.** `test/fixtures/frames.json` holds base64 frames plus expected decodes; the firmware self-test embeds the same bytes (generated header) and checks its own encoder produces them.
5. **Audio positions** come from sequence × 80 ms on the hub, mapped to Muse Voice Transcribe's `audioProcessedMs`; a turn's start is taken at `speechStart` and its end at `speechComplete`.

## Risks / Trade-offs

- [Breaking change during the hackathon] → the hub prints and shows a clear "update the clip firmware" message; flashing takes under a minute.
- [Clock wrap after 49 days] → irrelevant for sessions; documented in PROTOCOL.md.
- [Silence insertion hides real problems] → gaps are counted and reported in status and evals.
