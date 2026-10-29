# Spec Delta

## ADDED Requirements

### Requirement: Help on demand
On the wearer's request the hub SHALL make one Muse Spark 1.3 call with the last twelve turns and the memory and publish a cue labelled with its kind (Aportar, Pregunta or ¿De qué hablan?) and its measured time. The hub SHALL refuse these requests in Solo grabar.

#### Scenario: Aportar in an English meeting
- **WHEN** the wearer asks for Aportar while colleagues discuss a deadline in English
- **THEN** a cue labelled Aportar carries one English sentence about the deadline, its Spanish meaning and its time in milliseconds

### Requirement: What each kind of help says
Aportar SHALL be one sentence the wearer could add now and Pregunta one question the wearer could ask now, each in the meeting's language, at most 90 characters, with a Spanish meaning when that language is not Spanish. ¿De qué hablan? SHALL say what is being discussed in at most two short sentences in Spanish.

#### Scenario: Topic in a Spanish meeting
- **WHEN** the wearer asks ¿De qué hablan? during a meeting in Spanish
- **THEN** the cue says in Spanish, in at most two short sentences, what is being discussed, with no separate meaning

#### Scenario: Too little said
- **WHEN** the wearer asks for help before any turn has been said
- **THEN** the hub makes no model call and the phone says there is nothing to work from yet

#### Scenario: Solo grabar
- **WHEN** a help request arrives while the mode is Solo grabar
- **THEN** the hub makes no model call and answers that help is off while only recording
