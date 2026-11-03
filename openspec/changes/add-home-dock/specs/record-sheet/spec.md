# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing before recording
Tapping the record button while not listening SHALL open the recording options: the mode (Asistir, Solo grabar, and Teleprompter marked Pronto until built), the capture (microphone only, or microphone and the camera's live reads), "Empezar a grabar", and optionally a title and the project (or let Lente decide). Starting SHALL set the mode, record and open the live screen. The phone SHALL be used when the clip is not connected. The voice agent's request to record SHALL open the options, never record by itself.

#### Scenario: No clip
- **WHEN** the clip is not connected and the wearer taps the record button, picks "Solo micrófono" and the project Ternium, and taps "Empezar a grabar"
- **THEN** the phone starts capturing audio without the camera, a meeting opens in Ternium, Lente listens and the live screen opens

#### Scenario: Only record with the camera live
- **WHEN** the clip is connected and the wearer picks "Solo grabar" and "Micrófono y cámara en vivo" and starts
- **THEN** the hub switches to record-only, live camera reads come on, and no DILO card is made

#### Scenario: The teleprompter is not built yet
- **WHEN** the wearer opens the options
- **THEN** Teleprompter is greyed out with "Pronto" and cannot be chosen

## ADDED Requirements

### Requirement: Changing the project while recording
The live screen's menu SHALL let the wearer choose the meeting's project (or let Lente decide) while it records. The choice SHALL apply to the meeting in progress, and the automatic assignment SHALL NOT override it.

#### Scenario: Moving a meeting mid-way
- **WHEN** the wearer started with "Que Lente decida" and, while recording, picks Teker from the live screen's menu
- **THEN** the meeting in progress belongs to Teker, and when it ends it stays in Teker
