# Design

## Context

See proposal.md for why. This section records what was observed, so the decisions below rest on it.

### What Omi does (observed 2026-11-02 on the owner's Samsung, read-only)

Looked at with `adb` screenshots and `uiautomator` dumps, kept outside the repo. Nothing was recorded, no setting changed, no device connected; screens with personal data were not copied. Labels below are described in English, not quoted.

**Inicio.** Top row: a device pill on the left; four round icons on the right (calendar, search, notifications, settings). Large-title tabs (home, tasks). A "Today" section with one row per conversation (icon, date and time, time · duration, a "new" tag). Bottom: a wide "ask anything" bar and a round record button beside it, nothing else.

**1. The ask bar**

| Step | What is seen | What it does |
|---|---|---|
| Tap the bar | Full-height sheet over Inicio: drag handle, ✕ top-left, the conversation so far | Opens the chat |
| History | One continuous thread, oldest first. The wearer's messages are right-aligned bubbles; answers are plain text on the left with a row of actions: copy, useful, not useful, share | Continues the same thread; no list of past chats |
| Composer | A field; under it an attach button, a chip with the assistant's name and a ▾, and a round mic on the right | |
| Type a letter | The mic becomes send | Sends on tap |
| Attach | A small menu: take a photo, photo library, choose a file | Adds an attachment |
| Assistant chip | A drawer from the right: the assistants (current one ticked), "enable apps ›", and a red "clear chat" pinned at the bottom | Chooses who answers; clears the thread. No model picker |
| Keyboard | The composer rides above the keyboard; the thread shrinks | |
| Leave | ✕, a swipe down on the handle, or back | Inicio, exactly as before, the bar in place |
| States | With content observed. Empty, loading and error not observed (nothing was sent) | |

**2. The round record button** (not touched: its audio goes to Omi's servers; from the owner's description)

| Step | What is seen | What it does |
|---|---|---|
| Tap | A full screen titled "listening now" | Starts recording at the first tap, no sheet |
| Header | A live indicator with the elapsed time and the clock | |
| Body | Two tabs, summary and transcript; a "so far" card that fills after a few minutes | |
| Note | It ends by itself when the wearer moves on to something else | |
| Controls | An "end now" button; a "…" menu with pause | |

**3. The device pill**

| Step | What is seen | What it does |
|---|---|---|
| Inicio, no device | Pill with a spinning dotted icon and "connect" | |
| Tap | A full screen (back arrow, title, gear): the device's render with a pulse ring, "searching for devices" | Scans |
| After ~15 s | "No device found" and a hint to turn it on and keep it close | |
| Bottom | A link to buy the device and a connection guide | |
| Gear | Device settings: name and "disconnected", a "not connected" card, a disabled update row | |
| Back | Inicio | |
| Phone as microphone | Not on this screen: the record button on Inicio uses the phone's microphone when no device is connected | |

**4. The top-right icons**

| Icon | What opens | What it holds | How it closes |
|---|---|---|---|
| Calendar | Bottom sheet "filter by date": handle, ✕, month and year, previous/next month, a month grid with today marked and future days disabled, a "done" button | "Done" opens a day screen: back, the day as title, previous/next day, the calendar again, and that day's conversations | ✕ / swipe; the day screen's back |
| Search | Full screen, the field focused with the keyboard up, a calendar icon, "cancel" | Empty query: tiles for folders and categories with counts, and "new folder". No match: a single "no results" line and a clear button in the field | "Cancel" |
| Notifications | Full screen "activity" with back | Empty state: one line, "no activity yet" | Back |
| Settings | Tall bottom sheet over Inicio: handle, search, ✕ | The account, the plan, then sections: device, recording and transcription, voice, notifications and display, integrations, connect an agent, data and privacy, memories, goals, help, feedback, developer | ✕ / swipe |

### What Lente does today (observed 2026-11-02, the installed debug build against the stub hub of `pnpm android:e2e --no-build --serve`, which passed in 100.1 s; the fake clip connected)

- **Inicio** (`ui/Home.kt`). Top row: the device pill ("Clip conectado · 1:25", red while listening), Ajustes and the menu. Tabs Inicio, Tareas, Hoy. Body: a red "Transcripción en vivo · Abrir" bar while listening, notices, the DILO card, the greeting and the projects. Above the dock: the scope chip ("Toda mi memoria ▾") and starter chips ("Resumen de hoy", "¿Qué me falta?", "Mirar"). The dock: the field (placeholder cut to "Pregúntale a") with its own Dictar mic, the round Hablar con Lente button and the round record button.
- **Asking.** A chip or the field posts `/ask`; the answer appears inside Inicio, replacing the greeting and the projects, with a "Recuerdo" source chip, copy, read aloud and "Nueva conversación". The starter chips disappear once the conversation starts.
- **Recording.** The round button opens the "Grabar" sheet ("Grabará el clip.", Solo micrófono / Micrófono y cámara, an optional title, "Empezar a grabar", then the project list with "Que Lente decida"). While listening the same button pauses.
- **Live** (`ui/Live.kt`). Reached from the red bar or the pill. A red strip "Escuchando · 1:50" with level bars and Detener; a row with collapse, "Asistir" and the clip state; the DILO card; the transcript with speaker letters; Aportar / Pregunta / "¿De qué…" (cut); pause, a hint, and a second stop (■).
- **The pill without listening** opens Dispositivos, a section with the menu button (not back): the clip's render, lost and late audio, recorded today, transcribed minutes, tokens and cost, the mode, other ways to use Lente, the hub. "Usar el teléfono" shows only when the clip is absent.
- **Ajustes** (`ui/Sections.kt`) is a section screen (Cuenta, Tú, Apariencia, Lente, Hub). The **menu** lists Ahora, Proyectos, Reuniones, Acciones, Memoria, Dispositivos, Ajustes, two "Pronto" items and recent meetings.
- **Voice** (`ui/Voice.kt`): "Hablar con Lente", a full screen with a state orb, Manos libres / Mantener para hablar, pause and end.

### Gaps

| Piece | Missing in Lente | Extra in Lente | Clashes with a current spec |
|---|---|---|---|
| Ask bar | A full-screen chat that leaves Inicio untouched; a swipe-down close; useful / not useful; attach a photo | Starter chips and scope chip above the dock; a third round button (voice) in the dock; the field's own mic next to it | `ask-lente` "Preguntar screen" (a side-menu entry); `add-projects` "Projects first on the home screen" (chips above the bar); `voice-mode` "Kept as chat" (shows in Inicio's chat) |
| Record button | Start at the first tap; the live screen opening at once | A sheet before anything starts | `record-sheet` "Choosing before recording" |
| Live screen | A summary tab next to the transcript; a "…" menu with pause; one stop | Two stop controls (Detener and ■); the third help button cut | `android-app` "En vivo" (pause and stop as buttons) |
| Device pill | Searching, connected and not-found states; the phone as microphone in plain sight; a back arrow | A statistics screen as the destination; the pill doubling as "open live" | `android-app` "The phone as the device" (where "Usar el teléfono" is offered) and "Devices and settings" |
| Top bar | Calendar, search, activity | The menu button on Inicio (kept, it holds the sections) | `companion-app` "Side menu" covers the web page only; no clash |

Data the hub already has for the top bar: the meetings list with start times (calendar), `GET /meetings/search` (search over meetings), the `actions` event (tasks, approvals and the agent jobs' state, also as `GET /tasks`) and `GET /facts` (search and activity on the phone). There is no notification feed with read state.

## Goals / Non-Goals

**Goals:**
- The same flow as the reference on the four pieces: what is tapped, what opens (full screen, sheet or menu), the states and how to leave.
- Inicio with two controls at the bottom; everything else one tap away and back with one gesture.
- No new hub route: every screen reads what the hub already serves.

**Non-Goals:**
- Copying any text, icon, illustration, colour, type or code from the reference app; the copy is new Spanish for Lente and the look comes from `docs/design/ios-kit/` and `ui/Theme.kt`.
- The web `/app` (its own change), the typed chat answering general questions, a model picker, attachments, a stored activity feed.

## Decisions

The owner answered the open questions on 2026-11-02; the rest are design choices that follow from them.

1. **Two controls in the dock (owner).** Only the field and the round record button. The field is drawn as a field (placeholder, no icons) but works as the door to the chat: tapping it opens the sheet with the field focused and the keyboard up, so it feels like typing on Inicio. The reference opens its chat without the keyboard; focusing it here saves a tap and is the closest reading of "keep the input". Alternative rejected: a real field on Inicio that answers inline, which is what pushes the projects off Inicio today.
2. **Record at the first tap, sheet on a long press (owner).** Defaults come from a pure `RecordChoice.defaults(status)`: the clip if connected, otherwise the phone; microphone only; project `null` (Lente decides); no title. The tap calls the same path as "Empezar a grabar" and then `openLive()`. The voice agent's `start_recording` keeps opening the sheet, so nothing records without a tap. Alternative rejected: removing the sheet, which would leave the camera and the title with no place before recording.
3. **The project changes in the live screen, the title does not.** `POST /meetings/project` already moves a meeting; the task checks it on the meeting in progress and that the automatic assignment skips it. Renaming a running meeting has no route, so it stays in the sheet and is a follow-up.
4. **While recording, the record button opens the live screen.** Pause moves to the live screen's "…" menu (and stays on the section top bars' pill). This removes the red "Transcripción en vivo" bar and the pill's double role.
5. **Typed chat: memory only, no picker (owner).** `POST /ask` stays as `add-ask-lente` defines it (Muse Spark 1.3, decline outside the memory). Where the reference has its assistant picker, Lente puts the scope chip ("Toda mi memoria" / a project); where it has "clear chat", Lente has "Nueva conversación". Hablar con Lente moves into the composer. No `ask-lente` requirement changes.
6. **Answer actions: copy, read aloud, share.** Useful / not useful are left out: no route stores them and nothing would learn from them yet. Share uses Android's share intent.
7. **Conectar replaces Dispositivos.** The menu's Dispositivos entry opens Conectar too. Its states come from the hub's status plus a local timer: "searching" for `SEARCH_MS` after opening with no clip, then "not found". The clip connects to the hub over Wi-Fi, so the phone does not scan; "searching" means waiting for the hub to report it. The old statistics become Conectar's details.
8. **Top bar: Calendario, Buscar, Actividad, menu.** Five round buttons and the pill do not fit 411 dp; Ajustes is already in the menu, so the gear leaves Inicio. The menu stays because it holds the sections.
9. **Top bar from existing data (owner).**
   - Calendario: days with meetings from the meetings list the app already loads (`MeetingDays`, pure).
   - Buscar: meetings through `GET /meetings/search`; tasks and memories filtered on the phone from the `actions` event and `GET /facts` (`SearchResults`, pure, accent- and case-insensitive).
   - Actividad: `Activity.items(actions, facts, meetings)`, pure, newest first, with the agent jobs' state read from the actions; the dot shows while actions or facts wait. A stored feed with read state is a follow-up.
10. **Android only (owner).** The web `/app` gets the same pattern in its own change.

## Risks / Trade-offs

- [A tap records at once, so an accidental tap records the room] → The live screen opens immediately and names the device; stopping is two taps away; the phone asks for the microphone the first time.
- [The long press is invisible] → The live screen's menu reaches the project; the first-run introduction (`companion-app` "First-run introduction") gets one line about it.
- [`add-record-sheet` and `add-android-app` are not archived yet, so this change's MODIFIED deltas cannot archive] → Archive those two first (both wait only on checks); validation passes now with an info note.
- [Searching tasks and memories on the phone covers only what the app loaded] → The app holds the whole `actions` event and `GET /facts`; a hub-side search is a follow-up if those grow past what a phone should hold.
- [The e2e flow changes] → `scripts/android-e2e.ts` is updated in the groups that change it (record, Conectar).

## Migration Plan

App-only, shipped with the next debug build; no data migration. Rollback is reinstalling the previous build. The hub is unchanged.
