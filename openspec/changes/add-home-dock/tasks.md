# Tasks

Depends on: `add-record-sheet`, `add-voice-mode`, `add-android-app` (archive the first and last before this one: its MODIFIED deltas need their specs).

Phase 3: start after the hackathon submission (2026-11-04 21:00 ET).

Every UI group is verified with, besides `pnpm typecheck && pnpm test`:
- `cd android && ./gradlew :app:testDebugUnitTest`;
- screenshots on the phone in light and dark (`adb -s <serial> exec-out screencap -p`, kept in `/tmp`), against the stub hub of `pnpm android:e2e --no-build --serve`;
- `pnpm android:e2e` when the group changes its flow.

Each group adds the day's row to "What was built during the hackathon" in `README.md`.

## 1. The dock and the full-screen chat

Note (2026-11-02, at the owner's request, ahead of Phase 3): the dock with two buttons, the chat sheet (✕, swipe down and back close it; the scope chip, starters, Dictar/send and Hablar con Lente inside), share on answers, the round button opening the recording options (mode with Teleprompter as Pronto, capture with the live camera, start), the live view with Transcripción and Resumen tabs, and the flat card look (Tabs, PlainIcon) are built. Verified: `./gradlew :app:testDebugUnitTest` (89 tests, 0 failures, including `ChatSheet.button`, `ChatSheet.shared` and `sessionSummaries`), `pnpm android:e2e` passed in 107.2 s on the owner's Samsung with the one-tap record step, and light-mode screenshots of Inicio and the chat against the production hub. Still open: Compose tests, dark-mode screenshots, the e2e chat step.

- [ ] 1.1 Inicio's dock with only two buttons: the ask bar (a button, full label, no icons) and the record button; the scope chip, the starters, Dictar and Hablar con Lente leave Inicio; an answer no longer replaces the greeting or the projects; verify with a Compose test that the dock has exactly two controls (`./gradlew :app:testDebugUnitTest`)
- [ ] 1.2 The chat sheet: full height, handle and close, the conversation (voice sessions included), the starters while empty, "Nueva conversación"; the composer with dictate/send, Hablar con Lente and the scope chip; opened from the ask bar; closed by ✕, swipe down and back; a pure `ChatComposer.button(text)` (dictate or send) with a unit test
- [ ] 1.3 Answer actions: copy, read aloud and share (Android share intent); source chips open what they cite; unit test for the shared text (answer plus its sources' titles)
- [ ] 1.4 `scripts/android-e2e.ts`: ask through the field and find the answer in the sheet, then close it and find Inicio unchanged; `pnpm android:e2e` passes on the phone [phone]
- [ ] 1.5 Screenshots in light and dark: Inicio, the empty chat, a chat with an answer, after closing by swipe [phone]

- [ ] 1.6 The chat's history: `askLines`, `threadTitle`, `isThreadId` with tests (`pnpm test`); `GET /chat/threads`; the phone's thread id, `ChatHistory` with tests (`./gradlew :app:testDebugUnitTest`), the clock in the header and the list; verify against a stubbed hub that two questions in one thread come back as one conversation, and on the phone after the hub is deployed [phone]
  - 2026-11-02: built; `node --test test/chat-store.test.ts` 4 pass; a throwaway run against a stubbed local hub kept two questions with a `threadId` as one `text` thread titled by the first and did not keep one without it; on the owner's phone against production the history says the hub needs an update (Modal runs `feat/web-desktop`).

- [ ] 1.7 Recuerdos in place of Hoy, on sample moments: `Memories` with tests; the preview and details, the fixed wheel with the card carousel, Revivir with the third-relive summary, no dock on the tab; screenshots in light and dark [phone]
  - 2026-11-02: built; 98 unit tests pass (5 in `MemoriesTest`); on the owner's phone, light mode: turning moved the chosen moment, tapping a card chose it, a relive played with its clock and lines, and the third relive offered the summary. Dark mode not checked.

- [ ] 1.8 Conexiones: `jobList` and `GET /agent/jobs` with a test (`pnpm test`); `Connections` (catalog, setup lines, jobs, connected) with tests; the screen, the three-step connect sheet, agent and job sheets, the menu entry with the waiting count; on the phone, connect Claude Code with a real token and see «Conectado» [phone] [human]
  - 2026-11-03: built; 104 app unit tests and the hub's tests pass; a throwaway run against a stubbed hub created a job and `GET /agent/jobs` listed it as `pending`; on the owner's phone the screen and the first two steps of the sheet render (no token made on the production account). Production runs `feat/web-desktop`, so its jobs list says the hub needs an update.

## 2. Record at the first tap and the live screen

- [ ] 2.1 Pure `RecordChoice.Mode`, `modeNow` and `assistToSet` (Teleprompter not ready) with unit tests
- [ ] 2.2 The round button opens the options (mode, capture, start, title, project); starting sets the mode, records, turns live reads on with the camera, and opens the live screen; the voice agent's request opens the same sheet; while listening the button shows the live colour and opens the live screen; the red "Transcripción en vivo" bar leaves Inicio; Compose test for tap and long press
- [ ] 2.3 Hub check: `POST /meetings/project` on the meeting in progress assigns it and the automatic assignment skips it at the end; a unit test in `test/` (`pnpm test`); if it does not, fix it there with the test
- [ ] 2.4 Live screen: one stop control (second tap ends), a "…" menu with pause or resume and the project (sheet with the active projects and "Que Lente decida"), tabs Transcripción and Resumen (the session's `summary` entries, newest first); the help buttons fit their labels; Compose tests for the menu and the tabs
- [ ] 2.5 `scripts/android-e2e.ts`: the record step opens the options and «Empezar a grabar» opens the live screen with the hub listening, and pause goes through the menu; `pnpm android:e2e` passes on the phone [phone]
- [ ] 2.6 Screenshots in light and dark: the live screen in each tab, the open menu, Inicio with the red record button [phone]
- [ ] 2.7 The owner records a real meeting in each mode from the options, moves one to a project from the menu, and stops it; the meeting shows in that project [human]

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
- [ ] 5.4 One line in the first-run introduction about the round button's options; verify on the phone by replaying the introduction from Ajustes [phone]

## Workflow follow-up

- Proposals of their own: a stored activity feed with read state on the hub; renaming a meeting while it records; a hub-side search across meetings, tasks and facts; the same Inicio for the web `/app`.
- `pnpm exec openspec validate add-home-dock --strict`, then archive once every task is ticked and `add-record-sheet` and `add-android-app` are archived.
