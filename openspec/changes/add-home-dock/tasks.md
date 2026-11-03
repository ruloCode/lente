# Tasks

Depends on: `add-record-sheet`, `add-voice-mode`, `add-android-app` (archive the first and last before this one: its MODIFIED deltas need their specs).

Phase 3: start after the hackathon submission (2026-11-04 21:00 ET).

Every UI group is verified with, besides `pnpm typecheck && pnpm test`:
- `cd android && ./gradlew :app:testDebugUnitTest`;
- screenshots on the phone in light and dark (`adb -s <serial> exec-out screencap -p`, kept in `/tmp`), against the stub hub of `pnpm android:e2e --no-build --serve`;
- `pnpm android:e2e` when the group changes its flow.

Each group adds the day's row to "What was built during the hackathon" in `README.md`.

## 1. The dock and the full-screen chat

- [ ] 1.1 Inicio's dock with only the field (full placeholder, no icons) and the record button; the scope chip, the starters, Dictar and Hablar con Lente leave Inicio; an answer no longer replaces the greeting or the projects; verify with a Compose test that the dock has exactly two controls (`./gradlew :app:testDebugUnitTest`)
- [ ] 1.2 The chat sheet: full height, handle and close, the conversation (voice sessions included), the starters while empty, "Nueva conversación"; the composer with dictate/send, Hablar con Lente and the scope chip; opened from the field with the keyboard up; closed by ✕, swipe down and back; a pure `ChatComposer.button(text)` (dictate or send) with a unit test
- [ ] 1.3 Answer actions: copy, read aloud and share (Android share intent); source chips open what they cite; unit test for the shared text (answer plus its sources' titles)
- [ ] 1.4 `scripts/android-e2e.ts`: ask through the field and find the answer in the sheet, then close it and find Inicio unchanged; `pnpm android:e2e` passes on the phone [phone]
- [ ] 1.5 Screenshots in light and dark: Inicio, the empty chat, a chat with an answer, after closing by swipe [phone]

## 2. Record at the first tap and the live screen

- [ ] 2.1 Pure `RecordChoice.defaults(status)` (clip if connected, else phone; microphone only; project `null`; no title) with unit tests for clip, phone and none
- [ ] 2.2 Tap records with the defaults and opens the live screen; long press opens the "Grabar" sheet; the voice agent's request still opens the sheet; while listening the button shows the live colour and opens the live screen; the red "Transcripción en vivo" bar leaves Inicio; Compose test for tap and long press
- [ ] 2.3 Hub check: `POST /meetings/project` on the meeting in progress assigns it and the automatic assignment skips it at the end; a unit test in `test/` (`pnpm test`); if it does not, fix it there with the test
- [ ] 2.4 Live screen: one stop control (second tap ends), a "…" menu with pause or resume and the project (sheet with the active projects and "Que Lente decida"), tabs Transcripción and Resumen (the session's `summary` entries, newest first); the help buttons fit their labels; Compose tests for the menu and the tabs
- [ ] 2.5 `scripts/android-e2e.ts`: the record step becomes one tap that opens the live screen with the hub listening, and pause goes through the menu; `pnpm android:e2e` passes on the phone [phone]
- [ ] 2.6 Screenshots in light and dark: the live screen in each tab, the open menu, Inicio with the red record button [phone]
- [ ] 2.7 The owner records a real meeting with one tap, moves it to a project from the menu, and stops it; the meeting shows in that project [human]

## 3. The device pill and Conectar

- [ ] 3.1 Pure `DeviceView.of(status, openedAt, now)`: clip, phone, none, searching (for `SEARCH_MS` after opening with no device) and not found; unit tests for each state and the pill's wording
- [ ] 3.2 Conectar: full screen with back; searching, not found (hint and "Usar el teléfono"), connected (device, mode, a row to the details: lost and late audio, recorded, spend); the pill and the menu's Dispositivos open it; Compose test for the not-found state's button
- [ ] 3.3 `scripts/android-e2e.ts`: with the clip gone, the phone becomes the device through the pill → Conectar → "Usar el teléfono"; `pnpm android:e2e` passes on the phone [phone]
- [ ] 3.4 Screenshots in light and dark: the pill with clip, phone and none; Conectar searching, not found and connected [phone]

## 4. Calendario and Buscar

- [ ] 4.1 Pure `MeetingDays` (days with meetings in a month, today, future days disabled, a day's meetings) and `SearchResults` (hub meetings plus tasks and facts filtered on the phone, accent- and case-insensitive, grouped) with unit tests
- [ ] 4.2 The top bar: Calendario, Buscar, Actividad and the menu to the right of the pill; the gear leaves Inicio (Ajustes stays in the menu); Compose test for the four buttons
- [ ] 4.3 Calendario sheet (month grid, previous and next month, confirm) and the day screen (back, previous and next day, the day's meetings, an empty line); Buscar screen (field focused, cancel, shortcuts with counts on an empty query, groups, no-match line with clear); Compose tests for the empty day and no match
- [ ] 4.4 Screenshots in light and dark: the calendar sheet, a day with the seeded meeting, an empty day, search empty, with a match and with none [phone]

## 5. Actividad

- [ ] 5.1 Pure `Activity.items(actions, facts, meetings)` (actions to approve, memories to review, notes ready, agent jobs done or failed, newest first) and `Activity.waiting` for the dot; unit tests
- [ ] 5.2 The Actividad screen (back, items that open Acciones, Memoria or the meeting, the empty line) and the dot on its button; Compose test for the empty state and for an item opening Acciones
- [ ] 5.3 Screenshots in light and dark: Actividad empty and with the seeded meeting's action and fact, and the dot on Inicio [phone]
- [ ] 5.4 One line in the first-run introduction about the long press on the record button; verify on the phone by replaying the introduction from Ajustes [phone]

## Workflow follow-up

- Proposals of their own: a stored activity feed with read state on the hub; renaming a meeting while it records; a hub-side search across meetings, tasks and facts; the same Inicio for the web `/app`.
- `pnpm exec openspec validate add-home-dock --strict`, then archive once every task is ticked and `add-record-sheet` and `add-android-app` are archived.
