# Tasks

## 1. Transport

- [ ] 1.1 WebSocket upgrade on the hub's HTTP server carrying clip protocol v2 messages, dependency-free (reuse the RFC 6455 framing in `src/websocket.ts`, built with tests for the `add-evals` smoke test); shared with `add-desktop-mode`; verify with a Node client sending the emulator's frames
- [ ] 1.2 Optional HTTPS with `PILOT_TLS_CERT` / `PILOT_TLS_KEY` and a short guide to make a local certificate; verify the phone opens the page over the LAN with the microphone allowed

## 2. Phone capture

- [ ] 2.1 Microphone → 16 kHz mono PCM16 frames in the page (resampler and framing as a pure module with tests); verify a transcript and a DILO on the phone with the clip off
- [ ] 2.2 Rear camera stills for Mirar and En vivo; verify a description from the phone camera
- [ ] 2.3 Clip takes over: phone stops and releases the microphone; verify by powering the clip on mid-capture
- [ ] 2.4 Hidden page: capture paused note and resume; secure-context check with a one-line reason; verify both on the phone

## 3. Self-voice guard

- [ ] 3.1 Mute phone capture while the phone speaks; hub drops turns that repeat recent narration (pure matcher with tests); verify with voice on that no turn of Lente's own voice appears, with the clip and with the phone

## 4. Phone UI

- [ ] 4.1 "Usar el teléfono" in Dispositivos and on Ahora when no clip; status row names the device; verify both states
