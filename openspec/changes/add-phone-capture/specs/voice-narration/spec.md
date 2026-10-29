# Spec Delta

## ADDED Requirements

### Requirement: Lente never transcribes itself
Speech produced by Lente SHALL NOT come back as a turn. While the phone is speaking, its own microphone capture SHALL be muted; for any device, the hub SHALL drop a turn whose text repeats what Lente narrated in the previous few seconds.

#### Scenario: Live description read aloud near the clip
- **WHEN** voice is on and the phone reads a live description that the clip's microphone hears
- **THEN** no speaker turn with that text appears in the timeline, the day record or the meeting

#### Scenario: Phone speaking while capturing
- **WHEN** the phone is the device and reads a DILO out loud
- **THEN** the phone's microphone frames during that speech are not sent
