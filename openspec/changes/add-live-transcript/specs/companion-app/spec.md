# Spec Delta

## ADDED Requirements

### Requirement: Live transcript while listening
While Lente is listening in Asistir or Solo grabar, Ahora SHALL show the live transcript as its main view, above the camera view: one row per completed turn with its speaker chip (the wearer's name when the hub marks the turn as the wearer's), oldest first, and one live row for the turn in progress whose text SHALL update in place as partials arrive and SHALL become that turn's row when the turn completes, never leaving a duplicate.

#### Scenario: Turning on Solo grabar
- **WHEN** the wearer taps Solo grabar and someone starts speaking
- **THEN** a live row appears at the bottom of the transcript and its text grows as they speak

#### Scenario: Turn completes
- **WHEN** the turn in progress completes
- **THEN** the live row becomes a turn row with the final text and speaker chip, and there is one row for that turn, not two

#### Scenario: Speaker known late
- **WHEN** a turn's speaker label arrives after the turn row was shown
- **THEN** that row's chip updates in place

### Requirement: Transcript and card share Ahora
In Asistir the DILO card SHALL stay above the live transcript; in Solo grabar no card SHALL appear. The live transcript SHALL show only what was said; summaries, cues and photos stay in the day timeline.

#### Scenario: Asistir with a question
- **WHEN** the mode is Asistir and a cue arrives
- **THEN** the DILO card shows above the transcript and the transcript keeps updating below it

#### Scenario: Solo grabar shows only words
- **WHEN** the mode is Solo grabar and a five-minute summary is published
- **THEN** the summary goes to the day timeline and the live transcript shows only turns

### Requirement: Follow the newest line
The transcript SHALL keep the newest line in view while the wearer is at its bottom. When the wearer has scrolled up, new lines SHALL NOT move the view; a "Nuevo ↓" button SHALL appear and SHALL return to the bottom when tapped.

#### Scenario: Reading back
- **WHEN** the wearer scrolls up to reread a turn while people keep talking
- **THEN** the view stays where they are, "Nuevo ↓" appears, and tapping it shows the newest line

### Requirement: Catch up on connect
When the page opens or reconnects, the transcript SHALL show the turns of the current listening session already said, up to the hub's snapshot, and the partial in progress, with no duplicated rows.

#### Scenario: Phone reopened mid-meeting
- **WHEN** the wearer reopens the page while a meeting is being transcribed
- **THEN** the transcript shows the turns said so far and the current partial, each once

### Requirement: Paused transcript
When Lente is paused, the transcript SHALL stay visible without a live row and SHALL say "En pausa" so the wearer knows why nothing moves.

#### Scenario: Pause during a turn
- **WHEN** the wearer pauses while a turn is in progress
- **THEN** the live row goes away, the completed turns stay, and "En pausa" is shown
