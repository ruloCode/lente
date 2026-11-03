# Proposal

Depends on: `add-accounts`, `add-projects`, `add-task-owners`, `add-record-sheet`

## Why

Lente on a computer today is `/desktop`: a page that captures a tab and shows the last cue. Everything else (the chat with Lente, tasks, projects, the meeting library, memory, devices and the account) lives only in the Android app. A desk worker spends the meeting at the computer, judges will open Lente in a browser before installing an APK, and the cloud hub with accounts already has the web sign-in (`/auth/google`) with no page that uses it. A desktop web app with everything the Android app does makes Lente usable from any laptop, signed in with Google, against the laptop hub or the Modal hub.

## What Changes

- **A desktop web app at `/app`, served by the hub.** Plain ES modules and one stylesheet built from `src/theme.ts`; no build step, no framework and no dependency. Client routes with the history API: Inicio, Tareas, Proyectos (and a project), Reuniones (and a meeting), Memoria, Hoy, Dispositivos and Ajustes.
- **The same hub, the same contract.** One `GET /events` stream feeds an in-memory store; every action posts to the routes the Android app already uses and waits for the event that confirms it. The connection reconnects with exponential backoff and says "Reconectando…".
- **Sign in with Google on the web** (add-accounts 8.1). Without a session on a hub with accounts, `/app` shows a sign-in screen with "Entrar con Google" and comes back to `/app` after Google. A laptop hub without accounts opens with no sign-in, as today.
- **Desktop layout.** A sidebar with the navigation and the device pill, the main area, and a collapsible chat with Lente on the right that is there on every screen (a sheet below 1024 px). Shortcuts: ⌘K searches meetings, tasks and projects; ⌘J opens the chat; R opens Grabar; Esc closes; "?" lists them.
- **Every Android function.** Inicio with projects, the DILO card and the live transcript bar; the chat with scope, suggestions, source chips, a new conversation and dictation; Grabar with a project, a title and a source (microphone, microphone and camera, or a meeting tab or window through the `/desktop` pipeline); Tareas by owner or by project with filters, add, reassign, done and delete with undo, and the closing agent's approvals; Proyectos with rename, merge, archive and restore; Reuniones by date with search, notes, transcript, project, share and delete; Memoria with facts to review, the glossary and the profile; Hoy; Dispositivos with clip tokens; Ajustes with name, mode, voice, every question, theme, notifications and the account.
- **Notifications.** With the user's opt-in, a DILO card or an action waiting for approval while the tab is in the background shows a system notification.
- **Hub additions, read-only.** `GET /app/session` (who the browser is, and the hub's sign-in mode), `GET /tasks` (the task list and approvals without the stream), `GET /day` (today's record), `GET /projects/assignments` (each meeting's project) and `GET /memory/profile` (the profile Lente keeps, accounts only). `/auth/google?next=/app…` returns to the app after sign-in. No existing route changes.

Out of scope: a native desktop app, system-wide audio capture outside the browser, editing an action's draft before approving (Android does not edit either), offline use.

Meta models: unchanged. The web app reaches Muse Spark 1.3 (chat, help) and Muse Voice Transcribe (through the capture) only through the hub.

Privacy: the browser holds no secret. It is signed in only by the hub's `HttpOnly` cookie; nothing is kept in `localStorage` except the theme, the chat panel state and the notification opt-in. Capture starts only after the browser's own permission prompt and shows while it runs.

## Capabilities

### New Capabilities
- `web-desktop`: Lente's full app in a desktop browser, served by the hub.

## Impact

- New: `web/app/` (modules, views, stylesheet), `src/web-app.ts` (serving, the shell, the theme sheet, the generated capture and transcript modules, the safe return path), tests in `test/`.
- Changed: `src/access-gate.ts` (the app's static files are public), `src/pilot.ts` (serving `/app`, the five read-only routes, the return path after sign-in), `tsconfig.json` (`allowJs` so the tests and the typecheck cover the web modules).
- No new dependency in the hub or the web app.
