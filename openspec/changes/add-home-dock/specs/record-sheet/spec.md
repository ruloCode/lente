# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing before recording
Tapping the record button while not listening SHALL start recording at once with defaults (microphone only, the project left to Lente, no title) and SHALL open the live screen. A long press SHALL open the sheet to choose the project (or let Lente decide), microphone only or microphone and camera, and an optional title before recording. The phone SHALL be used when the clip is not connected. The voice agent's request to record SHALL open the sheet, never record by itself.

#### Scenario: No clip
- **WHEN** the clip is not connected and the wearer long-presses the record button, picks "Solo micrófono" and the project Ternium, and taps "Empezar a grabar"
- **THEN** the phone starts capturing audio without the camera, a meeting opens in Ternium, and Lente listens

#### Scenario: One tap
- **WHEN** the clip is connected and the wearer taps the record button once
- **THEN** the clip's audio is recorded into a new meeting whose project Lente will decide, and the live screen opens showing the clip as the device

#### Scenario: One tap without a clip
- **WHEN** the clip is not connected and the wearer taps the record button once
- **THEN** the phone becomes the device (asking for the microphone the first time), recording starts and the live screen says the phone is listening

## ADDED Requirements

### Requirement: Changing the project while recording
The live screen's menu SHALL let the wearer choose the meeting's project (or let Lente decide) while it records. The choice SHALL apply to the meeting in progress, and the automatic assignment SHALL NOT override it.

#### Scenario: Moving a meeting mid-way
- **WHEN** the wearer started with one tap and, while recording, picks Teker from the live screen's menu
- **THEN** the meeting in progress belongs to Teker, and when it ends it stays in Teker
