# Spec Delta

## ADDED Requirements

### Requirement: Full-screen live view
While Lente is listening in Asistir or Solo grabar, Ahora SHALL open a full-screen live view with, from top to bottom: a strip with the state and the session's elapsed time ("Escuchando · m:ss" in Asistir, "Grabando · m:ss" in Solo grabar) and a Detener button; a row with a collapse control, the mode and the clip state; the reply slot (Asistir only); the live transcript filling the remaining height; the help actions (Asistir only); and a bottom bar with pause, a one-line hint and stop.

#### Scenario: Turning on Solo grabar
- **WHEN** the wearer taps Solo grabar with the clip connected
- **THEN** the live view opens with "Grabando · 0:00" counting up, no reply slot, no help actions, and "Escuchando… lo que se diga aparece aquí." until someone speaks

#### Scenario: Collapse and reopen
- **WHEN** the wearer taps the collapse control
- **THEN** Ahora shows its usual content with a compact bar reading the state and elapsed time, listening continues, and tapping the bar reopens the live view

#### Scenario: Locking the phone
- **WHEN** the clip is the audio source
- **THEN** the hint reads "Puedes bloquear el teléfono: el clip sigue escuchando."

### Requirement: Live transcript rows
The live view's transcript SHALL show one row per completed turn with its speaker chip (the wearer's name when the hub marks the turn as the wearer's), oldest first, and one live row for the turn in progress whose text SHALL update in place as partials arrive and SHALL become that turn's row when the turn completes, never leaving a duplicate. It SHALL show only what was said; summaries, cues and photos stay in the day timeline.

#### Scenario: Speech grows a live row
- **WHEN** someone starts speaking
- **THEN** a live row appears at the bottom of the transcript and its text grows as they speak

#### Scenario: Turn completes
- **WHEN** the turn in progress completes
- **THEN** the live row becomes a turn row with the final text and speaker chip, and there is one row for that turn, not two

#### Scenario: Speaker known late
- **WHEN** a turn's speaker label arrives after the turn row was shown
- **THEN** that row's chip updates in place

### Requirement: Reply slot
In Asistir the live view SHALL keep a reply slot above the transcript: a placeholder reading "Cuando te pregunten algo, aquí aparece qué decir." until a card arrives, then the DILO card (with its Spanish meaning when it has one) or a help card. Only the newest card SHALL be shown.

#### Scenario: Question in Asistir
- **WHEN** a cue arrives while the live view is open
- **THEN** the card fills the reply slot and the transcript keeps updating below it

### Requirement: Help on demand
In Asistir the live view SHALL offer three actions: Aportar (one sentence the wearer could add now), Pregunta (one good question the wearer could ask now) and ¿De qué hablan? (what is being discussed, in Spanish). Each SHALL fill the reply slot with a card labelled with its kind and its measured time. Solo grabar SHALL NOT show them.

#### Scenario: Asking for a question to ask
- **WHEN** the wearer taps Pregunta during an English meeting
- **THEN** a card labelled Pregunta shows one English question with its Spanish meaning and the time it took

### Requirement: Pause and stop
The pause button SHALL pause listening: the transcript stays, the live row goes away, "En pausa" is shown and the elapsed time stops. Stop and Detener SHALL end the session only on a second tap within a few seconds ("Toca otra vez para terminar"): listening pauses, an open meeting ends with its notes, and the live view closes.

#### Scenario: Pause during a turn
- **WHEN** the wearer pauses while a turn is in progress
- **THEN** the live row goes away, the completed turns stay, "En pausa" is shown and the time stops

#### Scenario: Accidental stop
- **WHEN** the wearer taps stop once and does nothing else
- **THEN** the session keeps going and the prompt to confirm goes away

### Requirement: Follow the newest line
The transcript SHALL keep the newest line in view while the wearer is at its bottom. When the wearer has scrolled up, new lines SHALL NOT move the view; a "Nuevo ↓" button SHALL appear and SHALL return to the bottom when tapped.

#### Scenario: Reading back
- **WHEN** the wearer scrolls up to reread a turn while people keep talking
- **THEN** the view stays where they are, "Nuevo ↓" appears, and tapping it shows the newest line

### Requirement: Catch up on connect
When the page opens or reconnects, the live view SHALL show the turns of the current listening session already said, up to the hub's snapshot, the partial in progress and the elapsed time from the hub, with no duplicated rows.

#### Scenario: Phone reopened mid-meeting
- **WHEN** the wearer reopens the page while a meeting is being transcribed
- **THEN** the live view shows the turns said so far and the current partial, each once, and the elapsed time continues from the hub's value
