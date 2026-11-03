# Proposal

Depends on: `add-record-sheet`, `add-voice-mode`, `add-android-app`

## Why

The owner wants Inicio to be understood at first glance, with the same flow he uses every day in Omi's app (cited in README "Related work"): one bar to ask, one round button to record, the device in the top-left corner, and a few round icons on the top right. Today Lente's Inicio does all of this, but in a way that takes reading:
- the dock holds four controls (the field with its own microphone, Hablar con Lente, record), and the field's placeholder is cut to "Pregúntale a";
- an answer replaces the greeting and the projects on Inicio itself;
- recording needs a sheet before anything starts;
- the live transcript is reached through a red bar on Inicio;
- the device pill leads to a statistics screen.

Only the interaction pattern is taken from Omi: where each control sits, what it opens, its states, and how to leave. The copy, icons, colours, type and code are Lente's, written fresh from the kit (`docs/design/ios-kit/`, `ui/Theme.kt`); nothing reused. Screens of Omi were looked at on the owner's phone for analysis only and are not in the repo.

## What Changes

- **The dock.** Inicio's bottom keeps only two things: the field to ask Lente and the round record button (the owner's call). The field carries no icon of its own: the Dictar mic, the round Hablar con Lente button, the scope chip and the suggestion chips all leave Inicio and move into the chat.
- **The chat opens full screen.** Tapping the bar opens the chat as a full-height sheet over Inicio, with the conversation so far (voice sessions included), the composer (type or dictate), the scope chip (the whole memory or one project) where Omi has its assistant picker, the starter suggestions while the chat is empty, "Nueva conversación", and per-answer actions (copy, read aloud, share). It closes with ✕, a swipe down or back, and Inicio is as it was. "Hablar con Lente" becomes a control inside the composer. The chat stays as `add-ask-lente` defines it: Muse Spark 1.3, answers only from the wearer's memory, no model picker.
- **Record at the first tap.** The round button starts recording at once with defaults (the clip if connected, otherwise the phone; microphone only; Lente picks the project; no title) and opens the live screen. A long press opens today's "Grabar" sheet to choose first. While recording, the button opens the live screen; the red "Transcripción en vivo" bar leaves Inicio. **BREAKING** for `add-record-sheet`: a tap no longer opens the sheet.
- **The live screen.** One stop control instead of two; a "…" menu with pause and the project; a Resumen tab (the summaries the hub already writes during a session) next to the transcript. Stopping still takes a second tap.
- **The device pill.** It says what is connected (clip, phone, nobody) and opens a Conectar screen: searching, connected (with the clip's state), or not found, where "Usar el teléfono" sits in plain sight.
- **The top bar.** Round icons for Calendario (meetings by day), Buscar (meetings through the hub, tasks and memories on the phone) and Actividad (what waits for the wearer and what Lente finished, built from data the app already loads), and the menu, which keeps the sections and Ajustes.

Out of scope for the hackathon (before 2026-11-04): all of it. This is Phase 3 work and starts after the submission. Also out of scope:
- the web `/app` (`add-web-desktop`), which gets its own change;
- general questions, web search or a model picker in the typed chat;
- attachments in the chat (`POST /ask` takes text only);
- a stored activity feed with read state, renaming a meeting while it records, and folders in search, each proposed as its own follow-up;
- ending a recording by itself when the wearer moves on (`add-idle-pause` pauses on silence; that stays).

Meta models: none new. The chat keeps Muse Spark 1.3 through `POST /ask` (and the voice agent's tools when voice mode is used); the Resumen tab shows the summaries the hub already makes with Muse Spark 1.3; transcription stays Muse Voice Transcribe.

Privacy: no new data is stored or sent. A tap now records without a second step, so the live screen opens at once and says which device hears; the first tap on a phone without microphone permission still asks for it. Search and Actividad filter on the phone what the app already holds. Sharing an answer goes through Android's share sheet, only when the wearer chooses it.

## Capabilities

### New Capabilities
- `home-screen`: the Android app's Inicio: the dock (ask bar and record button), the device pill and its Conectar screen, and the top bar's calendar, search and activity.

### Modified Capabilities
- `record-sheet` (from `add-record-sheet`): recording starts at the first tap; the sheet becomes the long press; the project can change while recording.
- `android-app` (from `add-android-app`): the record button while listening, and the live view's controls (one stop, the "…" menu, the Resumen tab).

## Impact

- Android: `ui/Home.kt` (dock, top bar, pill), the full-screen chat (`ui/Chat.kt`), `ui/Live.kt` (menu, tabs), `ui/Sections.kt` (Dispositivos becomes Conectar), new `ui/Calendar.kt`, `ui/Search.kt`, `ui/Activity.kt`; pure helpers in `core/` with unit tests.
- Hub: no new route. It uses `POST /meeting/start`, `POST /meetings/project`, `GET /meetings/search`, `GET /facts`, the `actions` event and the meetings list as they are.
- `scripts/android-e2e.ts`: the record step becomes "tap the button, the live screen opens"; the phone-as-device step goes through Conectar.
