# Spec Delta

## ADDED Requirements

### Requirement: Tu historia
The Android app SHALL offer «Tu historia»: rings for days, hours and minutes that turn with the finger and settle on a step, a fan of the moments that start in the selected step, highlights marked on the rings, and a centre with the relative day («HOY», «AYER»), the time and how often the selected moment was relived, in words.

#### Scenario: Turn to yesterday afternoon
- **WHEN** the wearer turns the day ring to «AYER» and the hour ring to 15
- **THEN** the fan shows the moments that started between 15:00 and 16:00 yesterday

### Requirement: Revivir player
The app SHALL play a moment as timed subtitles with play, pause, scrub and back to start, show the camera description of the current minute, and open the meeting at the turn from a source chip. A meeting's detail SHALL offer «Revivir».

#### Scenario: Scrub
- **WHEN** the wearer drags the scrubber to the middle of a meeting
- **THEN** the subtitles jump to the line at that offset and continue from there
