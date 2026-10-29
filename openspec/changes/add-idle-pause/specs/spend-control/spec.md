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
With no meeting started by hand open, when the wearer has not spoken for the idle time (default 20 minutes, configurable), the hub SHALL pause listening and record why in its status. When the hub has not identified the wearer during this listening run, it SHALL use the time since anything was said.

#### Scenario: TV in the background
- **WHEN** a TV talks for 20 minutes and the wearer says nothing, with no meeting open
- **THEN** Lente pauses itself and the status says it paused for inactivity

#### Scenario: TV after a pause in the transcription session
- **WHEN** the wearer was identified, a silence closed the transcription session, and only a TV talks for the next 20 minutes
- **THEN** Lente still goes by the wearer's silence and pauses itself

#### Scenario: Meeting open
- **WHEN** a meeting is open and the wearer has been silent for 30 minutes
- **THEN** Lente keeps listening

#### Scenario: Solo grabar episode
- **WHEN** Solo grabar opened an episode on its own because a TV talks, and the wearer has been silent for 20 minutes
- **THEN** Lente pauses itself, since only a meeting started by hand keeps it listening

### Requirement: Usage meter
The hub SHALL count, per local day, the seconds of audio sent to transcription and the input, cached and output tokens per model, SHALL price them with the list prices recorded in `docs/kb/meta-api.md`, and SHALL keep the totals in `data/usage.json` as numbers only.

#### Scenario: After a meeting
- **WHEN** a ten-minute meeting with two replies ends
- **THEN** today's totals include the seconds actually sent and the tokens each call reported, with the approximate cost
