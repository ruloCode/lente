# Spec Delta

## ADDED Requirements

### Requirement: Moments index
The hub SHALL derive a day's moments from its meetings, day record and kept facts, without storing them: one moment per meeting, per stretch of talk heard outside meetings (split by silences over 5 minutes), per camera description and per kept fact or note. Each moment SHALL carry the id the memory already uses for its source, a start time, a kind and a short title. Moments SHALL be returned only to their own user.

#### Scenario: A day with a meeting and a coffee chat
- **WHEN** the wearer had one meeting at 10:00 and talk heard at 12:30 outside any meeting
- **THEN** `GET /moments` for that day returns a `meeting` moment with the meeting's id and a `heard` moment starting at 12:30 with a `d<day>:<n>` id

#### Scenario: Another user's moment
- **WHEN** a signed-in user asks for a moment id that belongs to someone else
- **THEN** the hub answers 404 and reveals nothing about it

### Requirement: Replay as timed text
Revivir SHALL play a moment back as timed text: each line with its offset from the moment's start taken from the stored times, its kind and its source. Silences longer than 8 seconds SHALL be shortened and marked. When the media archive kept the moment's speech audio or the frame of its minute (add-media-archive), Revivir SHALL play them with the text; Lente SHALL NOT keep or request media only for replay.

#### Scenario: Subtitles at their pace
- **WHEN** the wearer relives a meeting whose second turn came 4 seconds after the first
- **THEN** the second line appears 4 seconds after the first, with a chip that opens the meeting at that turn

### Requirement: Highlights
The nightly day digest SHALL return at most 5 highlights for the day, each a real moment id with a one-line reason. Ids that do not name a moment of that day SHALL be dropped.

#### Scenario: A made-up id
- **WHEN** the model returns a highlight whose id is not among the day's moments
- **THEN** that highlight is dropped and the rest are kept

### Requirement: Relive counter and gentle brake
The hub SHALL count, per user and moment, how many times it was relived, storing only the moment id, the count and the last time. From the third time, the replay SHALL offer the summary and «¿Lo anoto como tarea?» before playing, and SHALL always let the wearer play it anyway.

#### Scenario: Third time
- **WHEN** the wearer opens the same moment a third time
- **THEN** Lente offers the summary and a task first, and «Revivir igual» still plays it

### Requirement: Notes on a moment
The wearer SHALL be able to write a note on a moment. The note SHALL be kept as a confirmed fact with the moment as its source, sealed like any other fact, and the chat SHALL be able to cite it.

#### Scenario: Ask about a note
- **WHEN** the wearer noted «pedir el presupuesto revisado» on Tuesday's meeting and later asks the chat what they noted about it
- **THEN** the answer cites the note and opens the moment

### Requirement: Never shared
Nothing relived SHALL be sendable to another person: no share action on moments, replays or notes. The account export SHALL remain the only way content leaves, and only to the wearer.

#### Scenario: Looking for a share button
- **WHEN** the wearer opens a moment or its replay
- **THEN** there is no share or send action

### Requirement: Relive by voice
In voice mode, a request such as «Lente, revive la reunión del martes» SHALL resolve the time phrase on the hub, open that moment on the phone and say one sentence naming it. When nothing matches, Lente SHALL say so instead of opening something else.

#### Scenario: No match
- **WHEN** the wearer asks to relive «la reunión con Marta» and no meeting matches
- **THEN** Lente says it can't find it and opens nothing
