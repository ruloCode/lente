# Spec Delta

## ADDED Requirements

### Requirement: Turns anchored in audio time
Each completed turn SHALL carry its start and end position in the session's audio timeline, in milliseconds, so later features can cite exactly when something was said regardless of transcription delay.

#### Scenario: Cite a moment
- **WHEN** a turn is stored in the day record
- **THEN** it includes its start and end offsets, and the time of day they correspond to

#### Scenario: Transcription lagged
- **WHEN** the transcription service returns a turn several seconds after it was spoken
- **THEN** the turn's offsets still point to when it was spoken, not when it arrived
