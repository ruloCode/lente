# Proposal

## Why

The companion app is a web page. It works on any phone on the LAN, but a browser cannot keep the microphone open with the screen off, needs HTTPS before it allows the microphone at all, and cannot buzz or speak from the background. The wearer leaves home with the clip and the phone, and the phone is in a pocket most of the meeting. A native Android app removes those limits and makes Lente feel like the product it is: installed, always one tap away, and able to stand in for the clip all day.

## What Changes

- A native Android app in `android/` (Kotlin, Jetpack Compose), talking to the same hub with the same contract as the page: `GET /events` (SSE) down, JSON `POST` up, and the clip protocol v2 over the `/device` WebSocket when the phone is the device. The hub does not change.
- Every section the page has today, natively: Ahora (status, listening pill, assist mode, Dilo card, meeting, what is happening, photo, timeline), En vivo (full screen), Reuniones (briefing, past meetings, search, detail with notes, transcript, share and delete, agent trace), Acciones (approve or reject, task list), Memoria (facts to review, what Lente remembers, phrases, vocabulary), Dispositivos (clip, today's spend, mode, use the phone), Ajustes (names, Solo grabar, read aloud, every question, delete all, introduction). Planned features stay marked "Pronto".
- The phone as the device, natively: a foreground service records 16 kHz mono PCM16 straight from the microphone, keeps going with the screen off, shows a notification while it listens, takes a still with the rear camera when the hub asks, and stops when the clip takes over.
- What only a native app can do: vibrate on a Dilo card, read cards aloud with the phone's own voice while the microphone is muted, and share notes with the Android share sheet.
- The look of the iOS kit, as Compose tokens: light and dark follow the system, one blue accent, red only for recording, measured numbers in muted text with tabular figures, every text pair at 7:1 or more (checked by a unit test, like the page's).
- First run: the introduction, then the hub's address (LAN, or a cloud hub with its pairing code), remembered.

Out of scope: BLE provisioning of the clip, iOS, Play Store publishing, push notifications from a cloud hub.

Meta models: unchanged (the hub calls them; the app calls no model).

Privacy: the app keeps only the hub address, the pairing session and its own settings; audio and photos go to the hub exactly as from the page and are never stored on the phone. Capture starts only after the Android permission prompt and a tap, and the notification is visible for as long as the microphone is open.

## Capabilities

### New Capabilities
- `android-app`: the native Android companion and stand-in device.

### Modified Capabilities
- None. The hub's contract is unchanged; `docs/kb/hub-api.md` records it for any client.

## Impact

- New `android/` Gradle project, `docs/kb/hub-api.md`, `scripts/android-e2e.ts` (emulator against the stubbed hub), `package.json` scripts.
- Runtime dependencies inside the APK only: AndroidX Compose and OkHttp (Android ships no WebSocket client); the hub stays dependency-free.
