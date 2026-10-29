# Spec Delta

## ADDED Requirements

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
