# Proposal

## Why

The pilot built on 2026-10-26..28 already works end to end (clip → hub → Meta models → phone), but its behavior lives only in code and chat. Recording it as specs gives every later change a source of truth to modify instead of reinventing, and gives judges a readable contract of what exists.

## What Changes

- Document, as requirements with scenarios, the behavior that the pilot already implements and that was verified on hardware or with the simulated clip.
- No code changes. Every requirement here is observable today with `pnpm pilot`, the clip firmware in `firmware/lente-clip/`, and the tests in `test/`.

Out of scope: anything not yet built (memory, addressed-to-you detection, agents, MCP, cloud hosting, desktop mode). Those arrive as their own changes.

## Capabilities

### New Capabilities
- `clip-device`: what the clip on the glasses does on its own: join Wi-Fi, stream the microphone, take photos, switch the camera off, pause listening, blink for cues.
- `clip-link`: the wire contract between clip and hub: framed uplink, single-byte downlink commands, reconnection, and who owns the settings.
- `live-transcription`: turning clip audio into speaker-labelled turns with Muse Voice Transcribe, at real-time pace, across reconnects and pauses.
- `reply-cues`: the one-line reply the wearer can say when a turn is a question, produced by Muse Spark 1.3.
- `scene-vision`: one-off photo reads (Look) and continuous narration (Live) of what the camera sees, by Muse Spark 1.3.
- `day-record`: the day kept as text only, replayed to the phone, and summarized into "what's happening".
- `voice-narration`: reading cues, summaries and scene changes aloud on the phone, by priority.
- `companion-app`: the phone page: status, controls, the cue card, the camera view and the day timeline.

### Modified Capabilities
<!-- none: the main specs are empty before this change -->

## Impact

- Specs only: `openspec/specs/` gains eight capabilities after archive.
- Meta models in use: Muse Voice Transcribe (DIARIZATION, PCM 16 kHz), Muse Spark 1.3 (Chat Completions, `reasoning_effort: minimal`, text and image input).
- Privacy: documents that only text is stored (`data/days/`, git-ignored) and that photos are never written to disk.
