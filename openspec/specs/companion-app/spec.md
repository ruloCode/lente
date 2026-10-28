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
