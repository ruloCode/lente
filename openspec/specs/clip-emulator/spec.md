# clip-emulator Specification

## Purpose
Running Lente end to end from a computer, without the clip, for judges, CI and demo fallback.

## Requirements

### Requirement: Stream recorded media over the real protocol
The emulator SHALL connect to a hub like a clip, send a valid hello, stream a 16 kHz mono WAV as sequenced audio frames at real-time pace, answer photo requests with JPEGs from a folder, and obey the same downlink commands.

#### Scenario: Run without hardware
- **WHEN** someone runs the emulator against a running hub with a sample WAV
- **THEN** the phone page shows the clip connected, the transcript and any cues, exactly as with the clip

#### Scenario: Photo request
- **WHEN** the hub asks the emulator for a photo
- **THEN** it sends the next JPEG from its folder

#### Scenario: Pause
- **WHEN** the hub sends the pause command
- **THEN** the emulator stops sending audio until told to listen again

### Requirement: Reproducible runs
Given the same WAV, photos and settings, the emulator SHALL send the same frames in the same order, so eval and CI runs are comparable.

#### Scenario: Two runs
- **WHEN** the emulator runs twice with the same inputs
- **THEN** the sequence numbers and payloads of the frames are identical
