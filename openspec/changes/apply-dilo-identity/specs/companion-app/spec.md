# Spec Delta

## MODIFIED Requirements

### Requirement: One cue card
The page SHALL show at most one reply cue at a time, large, labelled "DILO", with its measured time, above the camera view and the day timeline. Cyan SHALL be used only for the line to say and amber only for measured numbers.

#### Scenario: New cue replaces the old one
- **WHEN** a new cue arrives
- **THEN** it replaces the previous card, labelled "DILO", and is added to the timeline

#### Scenario: Colors carry meaning
- **WHEN** the page shows a cue and its latency
- **THEN** the reply text is the only cyan text and the latency is amber

### Requirement: Live status at a glance
The page SHALL show whether the clip is connected, whether Lente is listening or paused with a state that is obvious from across a table, the microphone level, and a plain-language note when something needs attention (no key, clip offline, transcription reconnecting).

#### Scenario: Clip loses power
- **WHEN** the clip disconnects
- **THEN** the page shows the clip offline with a note to check its power and Wi-Fi

#### Scenario: Someone asks if it is recording
- **WHEN** Lente is listening
- **THEN** the page shows a distinct listening indicator, and paused looks clearly different

## ADDED Requirements

### Requirement: Installable app
The phone page SHALL be installable to the home screen with the Lente name and icon and open full screen without browser chrome.

#### Scenario: Add to home screen
- **WHEN** the wearer adds the page to the home screen
- **THEN** it launches full screen with the Lente icon and name
