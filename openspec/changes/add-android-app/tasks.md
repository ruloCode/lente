# Tasks

## 1. Contract and core

- [x] 1.1 `docs/kb/hub-api.md`: every SSE event and route the phone page uses, with field types, from `src/pilot.ts` and `src/pilot-page.ts`; verify each route against a running stubbed hub
- [x] 1.2 `app.lente.core`: clip frames (hello, audio, commands) checked against `test/fixtures/frames.json`, SSE parser, hub address rules, formatting; JVM unit tests (`./gradlew testDebugUnitTest`)
- [x] 1.3 Event decoding and the `HubState` reducer, tested on an event stream recorded from the stubbed hub (no meeting data: the stub's synthetic dialogue)

## 2. App shell

- [x] 2.1 Gradle project in `android/` (Kotlin, Compose, OkHttp), `pnpm android:build` builds the debug APK, `pnpm android:test` runs the unit tests
- [x] 2.2 Kit tokens as a Compose theme (light and dark), contrast unit test at 7:1 for every pair
- [x] 2.3 Introduction, connect screen (LAN address, cloud pairing), remembered address, events with reconnect, side menu, Pronto screens; verify on the emulator with screenshots in both themes

## 3. Ahora and En vivo

- [x] 3.1 Ahora: status row, listening pill and strip, pause note, assist mode, Dilo card with `/seen`, vibration, read aloud with `/narrated`, meeting start and end, what is happening, photo, timeline with the turn in progress, dock (Mirar, En vivo, Voz, Resumen)
- [x] 3.2 En vivo full screen: elapsed time, card slot, live transcript with "Nuevo ↓", help buttons, pause and stop
- [x] 3.3 `scripts/android-e2e.ts`: stubbed Meta API, hub and clip emulator, the app on the emulator; passes when the app shows the clip connected, the turn and the DILO line, and the hub records the app's acknowledgement

## 4. Memory, devices and settings

- [x] 4.1 Reuniones: briefing, list, search, detail (notes, transcript, share, delete with confirmation, agent trace)
- [x] 4.2 Acciones and Memoria: approve or reject, tasks done, facts keep or discard, remembered facts with search, phrases, vocabulary, counts, empty states
- [x] 4.3 Dispositivos and Ajustes: device stats, today's spend, mode, names, switches, delete all with confirmation, introduction again, hub address; verify against the stubbed hub with a made-up meeting seeded by `scripts/android-e2e.ts` (the stub writes no notes, so a meeting it runs has none to show)

## 5. The phone as the device

- [x] 5.1 Foreground service: microphone at 16 kHz in 80 ms frames over the `/device` WebSocket, notification, paused sends nothing, takeover stops it; verify on the emulator that the hub shows the phone as the device and receives audio
- [x] 5.2 Rear-camera stills on the hub's photo request; verify a photo reaches the hub from the emulator's camera
- [ ] 5.3 On a real Android phone: a meeting with the screen off in a pocket, a DILO card that vibrates and is read aloud with no turn of Lente's own voice coming back (the microphone sends silence while it speaks; the emulator's microphone is silent, so this needs a phone), the clip taking over [phone] [hw]

## 6. Landing

- [ ] 6.1 Decision, architecture table and README (how to build and install the APK, "What was built during the hackathon" row)
