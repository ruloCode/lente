# live-transcription Specification

## Purpose
Turning what the clip hears into speaker-labelled turns with Muse Voice Transcribe, reliably enough to run a whole meeting.

## Requirements

### Requirement: Clean audio before transcription
The hub SHALL remove the microphone's DC offset and apply a configurable gain (default 10×) with clipping before audio is transcribed or measured.

#### Scenario: Offset removed
- **WHEN** the clip sends silence riding on a constant offset
- **THEN** the audio passed on is centered on zero

### Requirement: Feed transcription at real-time pace
The hub SHALL send audio to transcription on a fixed 80 ms clock, padding gaps with silence and dropping the oldest audio when more than two seconds are buffered, so network bursts never look like a stall to the service.

#### Scenario: Wi-Fi hiccup
- **WHEN** the clip's audio arrives late in a burst
- **THEN** transcription keeps receiving exactly one frame every 80 ms and the session stays open

### Requirement: Speaker-labelled turns
The hub SHALL transcribe in DIARIZATION mode with English and Spanish language bias, publish partial text as it arrives, and publish each completed turn with its speaker label when known, including the first turn of a session (turn id 0).

#### Scenario: First question of a session
- **WHEN** the first thing said in a session is a complete question
- **THEN** a turn is published with its text and speaker label

#### Scenario: Speaker label arrives after the turn
- **WHEN** the speaker label for a turn arrives after the turn was published
- **THEN** the phone updates that turn's speaker

### Requirement: Survive session limits
The hub SHALL open a new transcription session automatically when one closes for any reason other than being stopped, backing off five seconds after rate-limit or configuration closes and one second otherwise.

#### Scenario: Sixty-minute limit
- **WHEN** the service ends a session after its maximum duration
- **THEN** a new session starts and transcription continues

### Requirement: Pause stops transcription
When listening is paused, the hub SHALL stop the transcription session and report the state as paused; resuming SHALL start a new session.

#### Scenario: Pause
- **WHEN** the wearer taps pause
- **THEN** no audio is sent to the transcription service until they resume
