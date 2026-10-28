# Spec Delta

## Purpose

The contract between the clip and the hub, so either side can be rebuilt or replaced without breaking the other.

## ADDED Requirements

### Requirement: Framed uplink
Every message from the clip to the hub SHALL be a frame of one type byte, a four-byte little-endian payload length, and the payload. Types SHALL be `H` (hello, JSON), `A` (audio, PCM16 mono 16 kHz) and `J` (JPEG).

#### Scenario: Frames split across network packets
- **WHEN** a frame arrives split over several TCP chunks or several frames arrive in one chunk
- **THEN** the hub reassembles exactly the frames that were sent, in order

#### Scenario: Corrupt length
- **WHEN** a frame declares a payload larger than 2 MB
- **THEN** the hub rejects the stream and closes the connection instead of buffering it

### Requirement: Single-byte downlink commands
Commands from the hub to the clip SHALL be single bytes: `P` take a photo, `B` blink for a cue, `C`/`c` camera mode on/off, `M`/`m` listen/pause.

#### Scenario: Unknown byte
- **WHEN** the clip receives a byte that is not a known command
- **THEN** it ignores it and keeps streaming

### Requirement: The hub owns the settings
On every new connection the hub SHALL send the current camera mode and listening state, so a clip that reboots or reconnects picks up the wearer's choices.

#### Scenario: Clip reconnects in mic-only mode
- **WHEN** the wearer chose mic-only mode and the clip reconnects
- **THEN** the hub sends the camera-off command before any audio is processed

### Requirement: One clip at a time
The hub SHALL serve one clip; a new clip connection SHALL replace the previous one.

#### Scenario: Second clip connects
- **WHEN** a second clip connects while one is connected
- **THEN** the first connection is closed and the new clip becomes the active one
