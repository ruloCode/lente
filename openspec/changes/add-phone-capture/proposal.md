# Proposal

## Why

Lente should still work when the clip is not there: not charged, still being printed, left at home, or in the hands of a judge who has no hardware. The phone that already shows the DILO card has a microphone and a camera. Letting the page stand in for the clip makes Lente usable from the first minute and gives the demo a fallback that is a real product path, not a script.

## What Changes

- The phone page can act as the device while no clip is connected: "Usar el teléfono" in Dispositivos, and offered on Ahora whenever the clip is missing.
- The page captures the microphone (echo cancellation and noise suppression on), turns it into 16 kHz mono PCM16 and sends it to the hub with the clip protocol v2 over a WebSocket, so transcription, addressing, cues, memory and agents work unchanged. Mirar and En vivo use the phone's rear camera.
- The WebSocket ingest is the same transport `add-desktop-mode` needs; whichever change lands first builds it, dependency-free (RFC 6455 on `node:http`).
- Browsers only open the microphone and camera in a secure context. The page works over `localhost`, over the cloud hub, and over the LAN when the hub is given a certificate (`PILOT_TLS_CERT`, `PILOT_TLS_KEY`, served with `node:https`); over plain HTTP the page says why the option is unavailable.
- When the clip connects it replaces the phone (the existing one-clip-at-a-time rule), and the page says so and stops capturing.
- Lente never transcribes its own voice: the phone drops its microphone while it is speaking, and the hub drops turns that repeat what was just narrated (seen on 2026-10-28, when a spoken live description came back as a speaker turn through the clip).

Out of scope: background capture with the screen off or the page hidden (browsers stop it; the page keeps the screen on and says when capture paused), a native app.

Meta models: unchanged (Muse Voice Transcribe, Muse Spark 1.3).

Privacy: capture starts only after the browser's permission prompt and a tap; the listening pill and red strip apply exactly as for the clip; audio and photos are still never stored.

## Capabilities

### New Capabilities
- `phone-capture`: the phone page as a stand-in device.

### Modified Capabilities
- `voice-narration`: Lente never transcribes itself.
- `companion-app`: the "Usar el teléfono" control and the device shown in the status row.

## Impact

- `src/pilot.ts` (WebSocket upgrade path, optional HTTPS, self-voice filter), a pure module for resampling and framing in the browser with tests, `src/pilot-page.ts`.
- Shared with `add-desktop-mode` (transport) and `add-cloud-hub` (HTTPS).
