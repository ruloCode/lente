# Spec Delta

## Purpose

Using all of Lente from a desktop browser: the same functions as the Android app, served by the hub and signed in the same way.

## ADDED Requirements

### Requirement: The app served by the hub
The hub SHALL serve the desktop web app at `/app` and its client routes (`/app/tareas`, `/app/proyectos`, `/app/proyectos/<id>`, `/app/reuniones`, `/app/reuniones/<id>`, `/app/memoria`, `/app/hoy`, `/app/dispositivos`, `/app/ajustes`) as static modules with no build step, and SHALL serve only known files under its folder.

#### Scenario: Opening a deep link
- **WHEN** the user opens `/app/reuniones/m123` directly
- **THEN** the hub returns the app's shell and the app opens that meeting

#### Scenario: A path outside the app
- **WHEN** a browser asks for `/app/../.env` or a file that does not exist with a module extension
- **THEN** the hub returns no file content from outside the app's folder

### Requirement: Signing in on the web
On a hub with accounts, the app SHALL show a sign-in screen with "Entrar con Google" when the browser has no session, SHALL come back to `/app` after Google, and SHALL keep no token in the page. On a hub without accounts it SHALL open with no sign-in.

#### Scenario: First visit on the cloud hub
- **WHEN** a person opens `/app` on the hub with accounts without a session and signs in with Google
- **THEN** they come back to `/app` signed in, and the page's storage holds no token

#### Scenario: Laptop hub
- **WHEN** the wearer opens `/app` on the laptop hub with no accounts
- **THEN** Inicio opens with no sign-in

### Requirement: One live stream
The app SHALL follow one `/events` stream for its live state, SHALL post actions to the hub's existing routes, and SHALL reconnect with exponential backoff while saying "Reconectando…".

#### Scenario: Hub restarts
- **WHEN** the hub restarts while the app is open
- **THEN** the app shows "Reconectando…", reconnects without a reload, and shows the state again

### Requirement: Inicio and the chat
Inicio SHALL show a greeting, the active projects with their last activity, open tasks, meetings this week and next task, the newest DILO card and, while recording, the live transcript. The chat with Lente SHALL ask the whole memory or one project, offer suggestions, show each answer's sources as chips that open the meeting at the cited turn, start a new conversation, and offer dictation only when the browser supports it.

#### Scenario: Opening a source
- **WHEN** the user clicks a source chip under an answer
- **THEN** the meeting opens with the cited turn highlighted in its transcript

### Requirement: Tasks and projects
Tareas SHALL group open tasks by owner or by project, filter by project and owner, add a task with its owner, reassign, mark done and delete with undo, list the closing agent's proposals with a preview to approve or reject, and fold the done tasks. Proyectos SHALL list active and archived projects, open one with its tasks and meetings, and rename, merge, archive and restore.

#### Scenario: Reassigning a task
- **WHEN** the user moves a task from "Lente puede hacerlo" to "Te toca"
- **THEN** the hub receives `POST /tasks/update` and the task shows under "Te toca" when the `actions` event arrives

#### Scenario: Deleting with undo
- **WHEN** the user deletes a task and taps "Deshacer" within the toast's time
- **THEN** the task is not deleted on the hub

### Requirement: Meetings, memory and the day
Reuniones SHALL list meetings by date with a search, and a meeting SHALL show its notes, its transcript with speakers, an editable project, share, delete and an "Importada" mark for imported meetings. Memoria SHALL list facts to review and kept ones with keep and discard, one at a time if asked, the glossary and the profile Lente keeps. Hoy SHALL show today's record of what was heard, seen and the cards.

#### Scenario: Reviewing facts one by one
- **WHEN** the user starts "Revisar uno por uno" with three facts to review and keeps or discards each
- **THEN** each decision reaches the hub and the review ends when none is left

### Requirement: Devices and settings
Dispositivos SHALL show the clip's state, offer this computer as the device and, on a hub with accounts, list clip tokens, create one shown once and revoke. Ajustes SHALL change the name, the mode (Asistir or Solo grabar), reading aloud, answering every question, the theme and notifications, and on a hub with accounts show the email and this month's spend, export the data, delete the account after a typed confirmation and sign out.

#### Scenario: Deleting the account
- **WHEN** the user asks to delete the account
- **THEN** nothing is sent until they type the confirmation word, and then the hub receives `{"confirm": true}`

### Requirement: Recording from this computer
Grabar SHALL use the clip when it is connected and otherwise this computer, said plainly, capturing the microphone, the microphone and the camera, or a meeting tab or window through the `/desktop` pipeline, and SHALL start the meeting in the chosen project before listening.

#### Scenario: No clip, a Meet tab
- **WHEN** the clip is not connected and the user records a Meet tab into a project
- **THEN** the browser asks which tab to share, the tab's audio reaches the hub as a clip, a meeting opens in that project, and a red bar shows the time with Pausar and Terminar

### Requirement: Desktop layout and keyboard
The app SHALL keep the chat with Lente within reach on every screen, work from 1024 px wide with the chat as a sheet below that, follow the system theme unless the user picks light or dark, and support ⌘K, ⌘J, R, Esc and a "?" list of shortcuts, with visible focus and labelled controls.

#### Scenario: Search from anywhere
- **WHEN** the user presses ⌘K on any screen and types part of a meeting title
- **THEN** a search lists matching meetings, tasks and projects, and Enter opens the first

### Requirement: Notifications by choice
When the user turns notifications on in Ajustes and the browser allows them, the app SHALL show a system notification for a DILO card or an action waiting for approval that arrives while its tab is in the background, and none otherwise.

#### Scenario: A question while in another tab
- **WHEN** a DILO card arrives while the user is in the Meet tab with notifications on
- **THEN** a notification shows the line to say, and clicking it brings Lente's tab forward
