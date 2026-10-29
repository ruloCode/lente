# Spec Delta

## ADDED Requirements

### Requirement: Two assist modes
The hub SHALL keep an assist mode, Asistir or Solo grabar, set from the phone, shown in the status sent to the phone, and remembered across restarts. Asistir SHALL be the default.

#### Scenario: Survives a restart
- **WHEN** the wearer chooses Solo grabar and the hub restarts
- **THEN** the hub comes back in Solo grabar

### Requirement: Record without cues
In Solo grabar the hub SHALL keep transcribing and writing the day record, and SHALL NOT make question detection, addressing or reply calls, send cues, buzz the clip or speak.

#### Scenario: A question in Solo grabar
- **WHEN** someone asks the wearer a question while the mode is Solo grabar
- **THEN** the turn appears in the timeline and the day record, and no DILO card, buzz or model call for a reply happens

### Requirement: Learn on the go
In Solo grabar the hub SHALL split the day into episodes after a silence gap or a maximum length, and SHALL extract notes for each episode with the meeting extraction, feeding memory, the glossary, asked versus answered and the wearer's phrases. Episodes SHALL be listed and deletable like meetings.

#### Scenario: Silence closes an episode
- **WHEN** the wearer has talked for a while in Solo grabar and then it stays silent past the gap
- **THEN** an episode is closed, its notes are extracted, and new words appear in Memoria

### Requirement: Text only
Solo grabar SHALL keep text only, as the rest of Lente does; no audio SHALL be stored.

#### Scenario: A full day recorded
- **WHEN** Solo grabar runs for a full day
- **THEN** the data folder holds the day as text and episode notes, and no audio files
