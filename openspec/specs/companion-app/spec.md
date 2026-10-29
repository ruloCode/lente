# companion-app Specification

## Purpose
The phone page the wearer glances at and controls Lente from, served by the hub on the local network.

## Requirements

### Requirement: Live status at a glance
The page SHALL show whether the clip is connected, whether Lente is listening or paused, the microphone level, and a plain-language note when something needs attention (no key, clip offline, transcription reconnecting).

#### Scenario: Clip loses power
- **WHEN** the clip disconnects
- **THEN** the page shows the clip offline with a note to check its power and Wi-Fi

### Requirement: Controls
The page SHALL let the wearer switch between mic-only and camera modes, pause and resume listening, take one photo, turn Live on and off, turn voice on and off, and ask for a summary.

#### Scenario: Controls without a clip
- **WHEN** the clip is offline
- **THEN** Look and Live are disabled and the other controls still work

### Requirement: One cue card
The page SHALL show at most one reply cue at a time, large, with its label and measured time, above the camera view and the day timeline.

#### Scenario: New cue replaces the old one
- **WHEN** a new cue arrives
- **THEN** it replaces the previous card and is added to the timeline

### Requirement: Readable on a phone
The page SHALL fit a 390 px wide screen without horizontal scrolling, keep its controls within thumb reach at the bottom, and remember the camera image rotation chosen by the wearer.

#### Scenario: Clip mounted sideways
- **WHEN** the wearer rotates the image once
- **THEN** later photos keep that rotation after a reload

### Requirement: Side menu
The page SHALL offer a side menu, opened from a button in the header, listing the sections Ahora, Reuniones, Memoria, Dispositivos and Ajustes and the most recent meetings. Choosing a section SHALL show it, close the menu and keep the listening indicator visible in the header. The browser's back action SHALL return to the previous section.

#### Scenario: Open a section
- **WHEN** the wearer opens the menu and taps Memoria
- **THEN** the menu closes, the header reads Memoria, and the listening indicator is still shown

#### Scenario: Back
- **WHEN** the wearer goes from Ahora to Ajustes and presses back
- **THEN** Ahora is shown again

### Requirement: Live loop stays on Ahora
Ahora SHALL show only the live loop: the DILO card, meeting start and end, what's happening, the camera view and today's timeline, with the Mirar, En vivo, Voz and Resumen actions at the bottom. Other sections SHALL NOT show those bottom actions.

#### Scenario: Cue while on another section
- **WHEN** a cue arrives while the wearer is on Ajustes
- **THEN** the phone vibrates and speaks as before, the menu closes if open, and the page returns to Ahora showing the card

### Requirement: Planned features are marked
Features that are planned but not built SHALL appear greyed out with the tag "Pronto", and their screen SHALL say in one sentence what they will do and which change brings them, without controls that pretend to work.

#### Scenario: Tap a planned feature
- **WHEN** the wearer taps Acciones while the closing agent is not built
- **THEN** a screen explains that approved follow-up actions will appear there and shows no approve or reject controls

### Requirement: First-run introduction
On first open the page SHALL show a short introduction that explains what Lente does, lets the wearer set the names people call them, shows the clip's live connection state, asks them to say "Lente, soy …" and confirms when their voice is recognized, and explains how listening is shown and paused. Every step SHALL be skippable, and the introduction SHALL be available again from Ajustes.

#### Scenario: First open
- **WHEN** the page is opened for the first time on a phone
- **THEN** the introduction starts, and finishing or skipping it lands on Ahora

#### Scenario: Voice recognized
- **WHEN** the wearer says "Lente, soy Rulo" during the voice step and the hub identifies their voice
- **THEN** the step shows that the voice was recognized

### Requirement: See and switch the assist mode
Ahora SHALL show an Asistir / Solo grabar switch. In Solo grabar the listening pill SHALL read "GRABANDO" with the same visibility as listening, and Dispositivos SHALL show how long has been recorded today.

#### Scenario: Someone asks if it is recording
- **WHEN** the mode is Solo grabar and Lente is listening
- **THEN** the red strip and a "GRABANDO" pill are visible, and a tap on the pill pauses it

### Requirement: Spanish meaning on the Dilo card
When a cue carries a Spanish meaning, the Dilo card SHALL show it under the sentence to say, smaller and muted, so the sentence stays the most visible line. Narration SHALL speak only the sentence to say, never the meaning.

#### Scenario: English reply with its meaning
- **WHEN** a cue arrives with an English sentence and a Spanish meaning
- **THEN** the card shows the English sentence first and the Spanish meaning below it, and narration speaks only the English sentence

#### Scenario: Spanish reply
- **WHEN** a cue arrives with a Spanish sentence and no meaning
- **THEN** the card shows the sentence alone, with no empty line below it
