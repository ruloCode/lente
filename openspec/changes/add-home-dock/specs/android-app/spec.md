# Spec Delta

## MODIFIED Requirements

### Requirement: Controls
The app SHALL offer every control the page offers: listen and pause, Asistir or Solo grabar, start and end a meeting with an optional title, Mirar, En vivo, Resumen, the help buttons of En vivo, camera or microphone-only mode, and testing's every-question switch, each through the hub's existing route.

#### Scenario: Pause from the live screen
- **WHEN** the wearer opens the live screen's "…" menu while listening and picks pause
- **THEN** the hub pauses, the live screen shows the paused state, and Inicio's record button stops showing the live colour

#### Scenario: Pause from a section
- **WHEN** the wearer taps the listening pill in a section's top bar while listening
- **THEN** the hub pauses and the pill shows the paused state

### Requirement: En vivo
The app SHALL open a full-screen live view with the elapsed time and the device, the card slot, two tabs (Transcripción: the live transcript that follows new rows unless the wearer scrolled up, then offering "Nuevo"; Resumen: the session's summaries), the help buttons, one stop control that ends on a second tap, and a "…" menu with pause or resume and the meeting's project.

#### Scenario: Wearer scrolls back
- **WHEN** the wearer scrolls up in the live transcript and a new turn arrives
- **THEN** the view stays where it is and offers "Nuevo ↓"

#### Scenario: The summary tab
- **WHEN** the hub writes a summary during the session and the wearer opens Resumen
- **THEN** the summary is listed with its time, newest first, and Transcripción still holds every turn

#### Scenario: One stop
- **WHEN** the wearer taps the stop control once and again within a few seconds
- **THEN** the session ends, an open meeting ends with its notes, and the live screen closes; a single tap only asks for the second
