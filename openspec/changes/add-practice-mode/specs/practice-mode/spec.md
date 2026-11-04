# Spec Delta

## Purpose

Letting the wearer practice piano with Lente: the phone hears which note was played, a lesson shows what to play next, and Muse Spark 1.3 coaches each attempt aloud and keeps it in the memory.

## ADDED Requirements

### Requirement: Notes are heard on the phone
The app SHALL detect the pitch of the phone microphone's audio on the device and report played notes with their onset, including repeated notes. It SHALL NOT send practice audio to the hub or any other server.

#### Scenario: A repeated note
- **WHEN** the same key is struck twice with a decay between the strikes
- **THEN** two note events are reported with distinct onsets

#### Scenario: Silence
- **WHEN** the input is below the silence threshold
- **THEN** no note is reported

### Requirement: Lessons come from the hub
The hub SHALL serve the lessons at `GET /practice/lessons` with an id, a Spanish title and the expected MIDI notes. Every lesson SHALL be a public-domain melody or an exercise.

#### Scenario: Listing lessons
- **WHEN** the phone asks for the lessons
- **THEN** it gets at least the C major scale, «Estrellita» and «Himno de la alegría», each with its notes

### Requirement: An attempt is matched note by note
The app SHALL align the played notes with the lesson's notes by pitch class and mark each expected note right, wrong (with the note played) or missed, and count extra notes.

#### Scenario: One wrong note
- **WHEN** the scale is played with Fa replaced by Sol
- **THEN** seven notes are right and the fourth is wrong with Sol as the note played

### Requirement: The attempt is kept and coached
The hub SHALL accept `POST /practice/attempt`, reject attempts for unknown lessons or with more than 64 notes, keep a one-line Spanish summary as a `practice` entry in the day record (not in a guest session), and return one or two sentences of specific Spanish coaching from Muse Spark 1.3.

#### Scenario: A good attempt after a weaker one
- **WHEN** the second attempt at a lesson today has more right notes than the first
- **THEN** the coaching line may say the wearer improved, and the day record holds both summaries

#### Scenario: Unknown lesson
- **WHEN** an attempt names a lesson the hub does not have
- **THEN** the hub answers 400 and keeps nothing

### Requirement: Practice is in the memory
Practice summaries SHALL be reachable through the same memory as everything else, so a question about earlier practice is answered from them.

#### Scenario: Asking about yesterday
- **WHEN** the wearer asks «¿cómo me fue ayer en el piano?» and yesterday's record holds practice summaries
- **THEN** the answer cites them

### Requirement: The piano teacher in the voice session
The voice session SHALL accept `persona: "piano"`. Its agent SHALL be able to open a lesson on the phone, read the latest attempt and the memory, and SHALL be paused while an attempt is being played.

#### Scenario: «Ponme una lección»
- **WHEN** the wearer asks the teacher for a lesson
- **THEN** the agent calls `start_lesson` and the phone opens that lesson

#### Scenario: Playing does not talk to the teacher
- **WHEN** an attempt is in progress
- **THEN** the voice session is paused and no turn is started from the piano's sound
