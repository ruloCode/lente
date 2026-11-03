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

1. **Two buttons in the dock (owner).** A wide button shaped like a bar ("Pregúntale a Lente", Lente's own label) and the round record button. The bar is a button, as in the reference: tapping it opens the chat sheet without the keyboard, and the wearer taps the composer to type. Alternative rejected: a real field on Inicio that answers inline, which is what pushes the projects off Inicio today.
2. **The round button opens the recording options (owner, revised 2026-11-02).** First decided as "record at the first tap"; the owner then asked for the options on the tap: mode, capture, then start. `RecordChoice.Mode` (pure, tested) lists Asistir, Solo grabar and Teleprompter (`ready = false`, shown as Pronto: Lente has no teleprompter and the clip no display; a script on the phone is its own change). `assistToSet` posts `/assist-mode/<mode>` only when it differs from the hub's. "Micrófono y cámara en vivo" records with the camera and turns on `/live/on`. `record()` ends in `openLive()`. The voice agent's `start_recording` opens the same sheet, so nothing records without a tap.
3. **The project changes in the live screen, the title does not.** `POST /meetings/project` already moves a meeting; the task checks it on the meeting in progress and that the automatic assignment skips it. Renaming a running meeting has no route, so it stays in the sheet and is a follow-up.
4. **While recording, the record button opens the live screen.** Pause moves to the live screen's "…" menu (and stays on the section top bars' pill). This removes the red "Transcripción en vivo" bar and the pill's double role.
5a. **The chat's look follows the Claude Android app (owner, 2026-11-02; pattern only, nothing reused).** Looked at read-only on the owner's phone, without sending anything or copying a conversation: an empty state with a mark and one centred sentence; a composer card with the field on top and a row under it (a chip for the current choice, a microphone, and a dark round button for voice that becomes send with text); answers at full width with no avatar and a row of actions; a header with plain icons, not circles; the placeholder naming the project. Lente keeps its own copy, glyphs and colours from the kit; its chip is the scope, not a model.
5b. **Visual language for Inicio and the chat (owner, 2026-11-02).** From screenshots the owner shared of a smart-glasses companion app: flat white cards with small radii on a grey ground, no shadows; small centred titles and bare outline icons in headers; the chosen tab as a solid ink pill on a quiet track (`Tabs`, also in the live view); grouped list rows with a leading glyph and a chevron; primary actions in ink. Taken as a style, not copied: no icon, typeface, text or layout is reproduced; Lente keeps the kit's tokens (ink and bg invert in dark mode), its own glyphs and copy. A pixel-perfect copy was declined under hard rule 1. On 2026-11-03 the owner asked for the whole app in this look: the shared components carry it (`Card` flat at 12 dp, `SectionTitle` as a sentence-case caption, `Segmented` drawn like `Tabs`, `Button` primary in ink and secondary in grey, `Tag`, `Field` as a grey well, `Notice`, `SwitchRow` in ink), the section top bar is back · centred title · menu, the menu opens from the right as grouped cards, and the live view, voice, camera, introduction, Ahora, Reuniones, Proyectos and the settings sections follow. The record button keeps the kit's blue accent at the owner's request.
5. **Typed chat: memory only, no picker (owner).** `POST /ask` stays as `add-ask-lente` defines it (Muse Spark 1.3, decline outside the memory). Where the reference has its assistant picker, Lente puts the scope chip ("Toda mi memoria" / a project); where it has "clear chat", Lente has "Nueva conversación". Hablar con Lente moves into the composer. No `ask-lente` requirement changes.
5c. **History from the chat store that voice mode already has.** `Chats` (files and sealed Supabase) already groups lines into threads; typed questions were never kept. The phone now names a thread (a uuid in `chatThread`, new on "Nueva conversación"), `POST /ask` keeps the pair with `via: "text"`, and `GET /chat/threads` lists 30 threads with their lines, so opening one needs no second call. Alternative rejected: keeping the history on the phone, which would lose it on a reinstall or a second device and skip the sealing. The production hub needs a redeploy before the phone sees it; until then the history says so.
5d. **Recuerdos as a mock of add-memory-timeline (owner, 2026-11-02).** Adapted from the owner's own concept page for Lente ("Recuerdos en Lente", a Claude artifact made in an earlier session), written fresh in Compose: `core/Memories.kt` (sample moments and pure helpers, tested) and `ui/Recuerdos.kt`. Changed for the phone at the owner's request: the details on top and the wheel below; the wheel at a fixed size with the cards as a carousel on its arc; the app's light (and dark) tokens instead of a separate dark world; no share action on anything relived. Real moments, highlights, the hub's relive counter and "Olvidar este día" stay in `add-memory-timeline`.
5e. **Conexiones replaces its Pronto (owner, 2026-11-03).** The agents that use Lente (Claude Code, Codex, Cursor, Muse Code, any MCP client) and the job bridge, on what `add-agent-bridge` built: agent tokens with scopes, `/mcp`, jobs as `run_agent` actions. The app adds a screen in the menu's General group with the connected agents and their jobs, and a sheet that connects in three steps (which agent, what it may do, the line to paste with the hub and the token filled in), watching for the agent's first call to say «Conectado». Setup lines: Claude Code's and the bridge's as run in `docs/kb/agents.md`; Codex's and Cursor's from their docs, unrun; Muse Code's (`mcpServers` with `type`, `url`, `headers` in `~/.config/muse/settings.json`) accepted by Muse Code's settings loader, unrun against a hub. The screen says which are untested. Agents show as two-letter marks, no brand logos. The hub gains `GET /agent/jobs` (`jobList`, pure, tested). Other models stay outside Lente's own answers: they connect as tools.
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
