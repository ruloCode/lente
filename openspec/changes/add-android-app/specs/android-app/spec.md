# Spec Delta

## ADDED Requirements

### Requirement: Connect to the hub
The app SHALL ask for the hub's address on first run after the introduction, accept an IP address, a host or a full URL (adding `http://` and port 8080 when missing), check it with `GET /health`, and remember it. A cloud hub that answers 401 SHALL be paired with its code through `POST /pair`, and the session SHALL be sent with every request. The address SHALL be changeable from Ajustes.

#### Scenario: LAN hub by IP
- **WHEN** the wearer types `192.168.1.20` and taps Conectar
- **THEN** the app connects to `http://192.168.1.20:8080`, shows Ahora with the hub's live status, and opens there on the next launch

#### Scenario: Hub unreachable
- **WHEN** the address does not answer
- **THEN** the app says in one sentence that it could not reach the hub at that address and keeps the field for another try

### Requirement: Live state from the hub
The app SHALL follow `GET /events` and render the hub's state: the status row (device, mode, audio level), the listening pill and red strip while listening or recording, the pause note with its reason, the timeline of turns with a letter per speaker and the turn in progress. When the stream drops it SHALL reconnect with backoff and say it is reconnecting, and on reconnect it SHALL show the hub's snapshot without duplicates.

#### Scenario: Hub restarts
- **WHEN** the hub stops and starts again while the app is open
- **THEN** the app shows that it is reconnecting, then the hub's current status and history, with no turn shown twice

### Requirement: The Dilo card
A cue SHALL appear as one card: label, the line to say large, the Spanish meaning when present, and the measured time and model in muted text. The app SHALL acknowledge each staged card with `POST /seen` as soon as it is shown, vibrate once, and read it aloud when Leer en voz alta is on, reporting what it read with `POST /narrated`.

#### Scenario: Question for the wearer
- **WHEN** the hub sends a DILO cue
- **THEN** the card shows the line, the phone vibrates, and the hub records the delivery stage from the app's acknowledgement

### Requirement: Controls
The app SHALL offer every control the page offers: listen and pause, Asistir or Solo grabar, start and end a meeting with an optional title, Mirar, En vivo, Resumen, the help buttons of En vivo, camera or microphone-only mode, and testing's every-question switch, each through the hub's existing route.

#### Scenario: Pause from the pill
- **WHEN** the wearer taps the listening pill while listening
- **THEN** the hub pauses and the pill shows the paused state

### Requirement: En vivo
The app SHALL open a full-screen live view with the elapsed time, the card slot, the live transcript that follows new rows unless the wearer scrolled up (then offering "Nuevo"), help buttons, pause and stop.

#### Scenario: Wearer scrolls back
- **WHEN** the wearer scrolls up in the live transcript and a new turn arrives
- **THEN** the view stays where it is and offers "Nuevo ↓"

### Requirement: Camera live view
The app SHALL open a full-screen camera view from the dock's En vivo, and from the photo card while live reads run: the newest frame large, "Lente dice" with the newest description and how long the model took, the session's earlier descriptions with their thumbnail and time since live reads started, a switch to read descriptions aloud apart from Voz, Mirar otra vez, and Detener. Opening it turns live reads on; leaving it keeps them running; Detener turns them off.

#### Scenario: Wearer opens the camera view
- **WHEN** the wearer taps En vivo in the dock with live reads off
- **THEN** the app asks the hub to start live reads and shows each new frame with its description, newest first in the list

#### Scenario: Wearer looks back at an earlier read
- **WHEN** the wearer taps an earlier description
- **THEN** its frame and text replace the newest ones under "Lente dijo" until the wearer taps "Volver a lo último"

### Requirement: Memory sections
Reuniones SHALL prepare a briefing, list and search past meetings and open a meeting's notes and transcript, share its notes through the Android share sheet and delete it after a confirmation. Acciones SHALL show cards to approve or reject and the task list with done toggles. Memoria SHALL show facts to keep or discard, what Lente remembers with a search, the wearer's phrases and vocabulary, and the asked and answered counts. Each section SHALL show the page's empty state when it has nothing.

#### Scenario: Approve an action
- **WHEN** the wearer approves a pending action card
- **THEN** the app sends the decision to `POST /actions/decide` and the card leaves Por aprobar

### Requirement: Devices and settings
Dispositivos SHALL show the device, lost and late audio, recorded time, today's transcribed minutes, tokens and approximate cost, and the clip mode. Ajustes SHALL edit the wearer's names, switch Solo grabar, Leer en voz alta and Contestar todas las preguntas, delete all memory after a confirmation, show the introduction again and change the hub address.

#### Scenario: Delete all memory
- **WHEN** the wearer confirms Borrar toda la memoria
- **THEN** the app calls `POST /meetings/delete-all` and Reuniones, Acciones and Memoria show their empty states

### Requirement: The phone as the device
While no clip is connected the app SHALL offer "Usar el teléfono". After the microphone permission and a tap it SHALL run a foreground service with a visible notification that sends the clip protocol v2 (hello as `lente-phone`, then 80 ms PCM16 frames at 16 kHz) over the `/device` WebSocket, and keeps sending with the screen off.

#### Scenario: Screen off in a pocket
- **WHEN** the phone is the device and its screen turns off
- **THEN** audio keeps reaching the hub and the notification stays visible

### Requirement: The phone obeys the hub
While the phone is the device it SHALL send no audio while the hub has paused listening, answer a photo request with a still from the rear camera, mute its microphone while the app speaks, and stop and release the microphone when the hub says another device took over.

#### Scenario: The clip takes over
- **WHEN** the clip connects while the phone is the device
- **THEN** the service stops, the microphone is released and the app says the clip took over

#### Scenario: Paused
- **WHEN** the wearer pauses while the phone is the device
- **THEN** no audio frames reach the hub until listening resumes

### Requirement: Same look as the kit
The app SHALL use the kit's tokens in light and dark following the system setting, one blue accent, red only for recording, measured numbers in muted text with tabular figures, and every text color pair at a contrast of 7:1 or more in both themes.

#### Scenario: Dark phone
- **WHEN** the phone is in dark mode
- **THEN** the app is dark, and the contrast test passes for every pair it paints

### Requirement: Planned features are marked
Features the hub does not have yet SHALL be listed with "Pronto" and a one-sentence screen, never presented as working.

#### Scenario: Equipo
- **WHEN** the wearer opens Equipo from the menu
- **THEN** a Pronto screen says what it will do, with no controls that pretend to work
