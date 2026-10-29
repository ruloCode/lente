# Spec Delta

## MODIFIED Requirements

### Requirement: Speaker-labelled turns
The hub SHALL transcribe in DIARIZATION mode with Spanish then English language bias (Spanish listed first), publish partial text as it arrives, and publish each completed turn with its speaker label when known, including the first turn of a session (turn id 0).

#### Scenario: First question of a session
- **WHEN** the first thing said in a session is a complete question
- **THEN** a turn is published with its text and speaker label

#### Scenario: Speaker label arrives after the turn
- **WHEN** the speaker label for a turn arrives after the turn was published
- **THEN** the phone updates that turn's speaker

#### Scenario: English meeting under Spanish-first bias
- **WHEN** a meeting is held entirely in English
- **THEN** its turns are transcribed in English, not translated or forced into Spanish
