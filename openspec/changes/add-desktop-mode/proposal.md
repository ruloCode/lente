# Proposal

## Why

Most second-language meetings happen on Meet, Teams or Zoom, and most people (including judges) will try Lente without the clip. A browser page that captures a meeting tab's audio and screen gives them the full product in a minute, with no install and no hardware.

## What Changes

- A desktop page served by the hub that captures a chosen tab or window (its audio, and its picture when the scene changes) plus, optionally, the microphone.
- The page behaves as one more clip: it speaks the same protocol over WebSocket, so transcription, addressing, cues, memory and agents all work unchanged.
- Cues appear in a small always-visible panel on the desktop page and on the phone.

Out of scope before 2026-11-04: native desktop apps, system-wide audio capture on macOS (only tab audio in the browser), hiding from screen sharing (Lente does not hide).

Meta models: unchanged (Muse Voice Transcribe, Muse Spark 1.3, Muse Spark Open).

Privacy: capture starts only after the browser's own permission prompt; the page shows that it is listening; the same consent rules apply.

## Capabilities

### New Capabilities
- `desktop-capture`: using Lente on a computer by capturing a meeting tab.

### Modified Capabilities
<!-- none -->

## Impact

- A desktop page and its audio pipeline (capture, resample to 16 kHz, protocol v2 frames over WebSocket).
- Depends on `harden-clip-protocol` and the WebSocket transport from `add-cloud-hub` (usable on the LAN hub too).
