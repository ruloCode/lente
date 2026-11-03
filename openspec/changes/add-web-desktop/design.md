# Design

## Context

- The hub serves the phone page (`src/pilot-page.ts`, one HTML string at `/`) and the capture page (`src/desktop-page.ts`, `/desktop`). Both follow `GET /events` (SSE) and post to JSON routes. The Android app uses the same contract.
- On connect, `/events` sends `status`, `history` (the last 80 entries of the day), the partial in progress, `meetings` (every meeting's summary and notes, plus the glossary), `actions` (pending approvals, recent decisions, every task with `who`, `otherName`, `meetingTitle` and `projectName`), `recorded` and `spend`. Live events follow: `turn`, `partial`, `speaker`, `cue`, `live`, `summary`, `level`, `frame`, `stages`, `usage`.
- Accounts mode (`add-accounts`): every request resolves to a user from a bearer token, the web session cookie or a device token, or is refused; `GET /` without a session is the sign-in page. Pairing mode (cloud hub without accounts) pairs a browser with a code at `/`. Open mode (the laptop) has no checks.
- The `/desktop` pipeline is tested pure code carried into the page as strings: `PHONE_AUDIO_PAGE_SCRIPT` (resampler, framer, hello and audio frames) and `DESKTOP_CAPTURE_PAGE_SCRIPT` (downmix, scene detection). The live transcript reducer is carried the same way (`TRANSCRIPT_PAGE_SCRIPT`).

## Decisions

### 1. Plain ES modules from `web/app/`, no build

The app is JavaScript modules in `web/app/` served as they are at `/app/…`, and one stylesheet. Node has no bundler and the hub has no dependency, and the browser loads modules natively. The pure modules (`web/app/lib/`) carry `// @ts-check` and JSDoc types; `tsconfig.json` gains `allowJs` and the `web` folder, so `pnpm typecheck` checks them and `node --test` imports them from `test/`. Views are small modules, one per screen, that build DOM with a tiny element helper; no virtual DOM.

**Rejected.** A framework (React, Preact, Lit): a dependency and, in practice, a build. TypeScript served through `stripTypeScriptTypes`: still experimental in Node 22 and it prints a warning at start.

### 2. What the hub generates instead of copying

`src/web-app.ts` builds three files from the hub's own modules, so the browser runs the code the tests cover:
- `/app/theme.css`: `THEME_TOKENS` plus the same values under `:root[data-theme="light"|"dark"]`, so the user's choice (Sistema, Claro, Oscuro) overrides the system's.
- `/app/lib/capture-pipeline.js`: the two page scripts of `/desktop` with an `export` line.
- `/app/lib/transcript-view.js`: the transcript reducer with an `export` line.

The app's static files are read from `web/app/` once and served with a strict Content-Security-Policy (`default-src 'self'`, images also from `data:` and `blob:`, no inline script). A path is served only if it is a known file under `web/app/` with an allowed extension; anything else under `/app` is the shell (client routes).

### 3. Who the browser is

- `/app` and its files are public: they are code, not data. `decideWeb` returns `app` for them in every mode.
- `GET /app/session` answers `{ mode, signedIn, email }`. The app shows the sign-in screen in accounts mode without a session, a "pair this browser" screen in pairing mode, and the app otherwise.
- "Entrar con Google" goes to `/auth/google?next=/app`. The hub keeps `next` in a short `HttpOnly` cookie on `/auth` only if it is `/app` or a path under it made of safe characters, and the callback returns there; without it the callback goes to `/` as before. No open redirect.
- No token ever reaches the page: the hub's session cookie is `HttpOnly`. `localStorage` keeps only the theme, the chat panel's state and the notification opt-in.

### 4. One stream, one store

`store.js` opens one `EventSource('/events')` and reduces every event into one state object with a pure reducer (`lib/events.js`, tested): status, history and the transcript, meetings, glossary, actions and tasks, the newest cue, spend and recorded time. Views subscribe to the keys they read and re-render when those change; a re-render keeps the focused input and its selection. On an error the stream is closed and reopened after 1, 2, 4… up to 30 s (`lib/backoff.js`), and the app says "Reconectando…" until it opens. `level` events update only the level meter.

Actions post to the existing routes and wait for the confirming event (`actions` after a task change, `meetings` after a meeting change, `status` after listening or mode). Read-only data that the stream does not carry is fetched: projects, a project, a meeting with its turns, facts, today's record, the account and devices.

### 5. The new read-only routes

| Route | Answer | Why |
|---|---|---|
| `GET /app/session` | `{ mode, signedIn, email }` | the app must know whether to show sign-in |
| `GET /tasks` | `{ pending, decided, tasks }` (the `actions` event) | lists and tests without the stream |
| `GET /day` | `{ entries }`, today's record | Hoy shows the whole day, the stream only the last 80 |
| `GET /projects/assignments` | `{ assignments: { <meetingId>: <projectId> } }` | a meeting shows and changes its project without one request per project |
| `GET /memory/profile` | `{ profile: { text, at } \| null }` | Memoria shows the profile Lente keeps (accounts); the laptop has none |

They read what the runtime already holds and change nothing.

### 6. Grabar from this computer

The record dialog picks the project (or "Que Lente decida"), an optional title and the source. With the clip connected it records with the clip. Otherwise it records with this computer and says so:
- **Micrófono**: `getUserMedia({ audio })`.
- **Micrófono y cámara**: also the camera; a picture is sent when the scene changes and when the hub asks (`P`).
- **Pestaña o ventana de una reunión**: `getDisplayMedia` (tab audio and picture) plus the microphone, as `/desktop`.

The capture speaks protocol v2 over `/device` as `lente-desktop`, with the generated pipeline (decision 2) and an AudioWorklet served as a file (the CSP allows no `blob:` script). Then `POST /meeting/start {title, project?}` and `POST /listen/on`. While recording a red bar shows the time, Pausar (`/listen/off`, `/listen/on`) and Terminar (`/meeting/end`, `/listen/off`, the capture stops). Stopping the share in the browser ends the capture as on `/desktop`.

### 7. Layout and keyboard

- Grid of three columns: the sidebar (240 px), the main area, and the chat (360 px) that collapses to a button. Below 1024 px the chat is a sheet over the main area.
- Shortcuts are one table (`lib/shortcuts.js`, tested): ⌘K or Ctrl+K, ⌘J or Ctrl+J, R, Esc and "?". Letters are ignored while typing in a field.
- Dialogs use `<dialog>` with `showModal()`, so focus is trapped and Esc closes. Every control is a button or a link with a visible focus ring; lists use `role="list"`; live regions announce "Reconectando…" and new DILO cards.
- Colors come only from `theme.css`; text pairs keep the 7:1 the theme already measures (`test/contrast.test.ts`).

### 8. Spanish words in one place

Copy is Spanish; plurals, dates ("Hoy", "Ayer", "lun 3 nov"), durations ("12 min"), money ("US$ 0,42") and the groups' names live in `lib/format.js` and `lib/words.js` and are tested.

## Risks

- The `actions` event carries every task: fine for hundreds, heavy for thousands. The Android app has the same cost; paging waits until it is measured.
- `getDisplayMedia` gives tab audio only in Chromium; Safari and Firefox share the picture without audio. The dialog says so when the shared source has no audio.
- Without TLS a browser opens the microphone only on `localhost`: the dialog says it needs HTTPS when `isSecureContext` is false.
