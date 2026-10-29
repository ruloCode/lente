# Spec Delta

## Purpose

Keeping an all-day wearable from spending model credit when nobody needs it.

## ADDED Requirements

### Requirement: Start paused
The hub SHALL start with listening off, and a clip connecting SHALL NOT start transcription. Listening SHALL start only when the wearer asks for it from the phone.

#### Scenario: Hub restarts with the clip on
- **WHEN** the hub restarts while the clip is connected and the room is noisy
- **THEN** no audio is sent to transcription until the wearer starts listening

### Requirement: Silence gate
While listening, the hub SHALL send audio to transcription only around speech: it SHALL keep a short pre-roll, send audio while the clip's level is at speech level and for a hangover after it, and send nothing in silence. If the transcription service closes an idle session, the hub SHALL reopen it on the next speech and send the pre-roll first.

#### Scenario: Ten minutes of silence
- **WHEN** the clip hears silence for ten minutes while listening
- **THEN** no audio is sent to transcription during that time

#### Scenario: Speech after silence
- **WHEN** someone speaks after a long silence
- **THEN** the first words are transcribed, including the pre-roll before the level rose

### Requirement: Idle auto-pause
With no meeting open, when the wearer has not spoken for the idle time (default 20 minutes, configurable), the hub SHALL pause listening and record why. When the hub does not know which speaker is the wearer, it SHALL use the time since anything was said.

#### Scenario: TV in the background
- **WHEN** a TV talks for 20 minutes and the wearer says nothing, with no meeting open
- **THEN** Lente pauses itself and the status says it paused for inactivity

#### Scenario: Meeting open
- **WHEN** a meeting is open and the wearer has been silent for 30 minutes
- **THEN** Lente keeps listening

### Requirement: Usage meter
The hub SHALL count, per local day, the seconds of audio sent to transcription and the input, cached and output tokens per model, SHALL price them with the list prices recorded in `docs/kb/meta-api.md`, and SHALL keep the totals in `data/usage.json` as numbers only.

#### Scenario: After a meeting
- **WHEN** a ten-minute meeting with two replies ends
- **THEN** today's totals include the seconds actually sent and the tokens each call reported, with the approximate cost
