# Spec Delta

## Purpose

Starting a recording with the project, the capture and the device chosen, and asking Lente within a project.

## ADDED Requirements

### Requirement: Choosing before recording
Tapping the record button while not listening SHALL open a sheet to choose the project (or let Lente decide), microphone only or microphone and camera, and an optional title. The phone SHALL be used when the clip is not connected.

#### Scenario: No clip
- **WHEN** the clip is not connected and the wearer taps "Grabar" with "Solo micrófono" and the project Ternium
- **THEN** the phone starts capturing audio without the camera, a meeting opens in Ternium, and Lente listens

### Requirement: Asking within a project
The chat SHALL let the wearer ask the whole memory or one project; within a project, answers SHALL cite only that project's meetings.

#### Scenario: A project's question
- **WHEN** the wearer picks Teker and asks what was decided last week
- **THEN** the answer cites only Teker's meetings
