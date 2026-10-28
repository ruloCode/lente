# Proposal

## Why

The clip-hub protocol works but is implicit: no version, no way to notice lost audio, and no way to run Lente without the hardware. The open-source glasses projects we studied (MentraOS's dependency-free protocol package and audio positions, Omi's codec ids and packet numbers, Brilliant Labs' emulator and protocol docs) all treat the wire contract as a first-class, versioned, tested artifact. Doing the same gives judges a protocol they can read, a demo that cannot be broken by a dead battery, and the audio positions that memory citations and latency measurements need.

## What Changes

- **BREAKING** (firmware `pilot-2` → protocol v2): the hello frame declares protocol version, firmware, codec and sample rate; the hub refuses a mismatched major version with a clear message.
- Audio frames carry a sequence number and the clip's capture time, so the hub counts lost or late frames and every turn can be placed on the audio timeline.
- Turns carry their position in the audio (start and end offsets in the session), the anchor for evidence links.
- A clip emulator that streams a WAV and JPEGs over the real protocol, so anyone can run Lente without hardware.
- `docs/PROTOCOL.md` with byte layouts, command tables and examples; one shared fixtures file of encoded frames used by the TypeScript tests and the firmware self-test.

Out of scope before 2026-11-04: Opus compression (a codec id is reserved; PCM16 at 256 kbps fits Wi-Fi), BLE provisioning, OTA updates.

Meta models: Muse Voice Transcribe (audio positions map onto its `audioProcessedMs`).

Privacy: no change in what is sent or stored.

## Capabilities

### New Capabilities
- `clip-emulator`: running Lente end to end from a computer, without the clip.

### Modified Capabilities
- `clip-link`: versioned handshake, sequenced and timestamped audio, lost-frame accounting.
- `live-transcription`: turns anchored to positions in the session audio.

## Impact

- `src/clip-protocol.ts` (v2 frames, kept dependency-free and pure), `src/pilot.ts`, `firmware/lente-clip/` (hello and audio header), `firmware/selftest/` (decodes fixtures), `scripts/fake-clip.ts`, `test/fixtures/frames.json`, `docs/PROTOCOL.md`.
- The v1 firmware stops working against a v2 hub until reflashed (the hub explains it in its log and on the phone).
