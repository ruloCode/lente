# Spec Delta

## Purpose

Letting the wearer ask their own meeting memory, by text or by voice, and get short answers that cite where they come from.

## ADDED Requirements

### Requirement: Grounded answers
For each question the hub SHALL make one Muse Spark 1.3 call with the memory as a cached prefix and SHALL return an answer in Spanish of at most three sentences together with the meeting and turn ids it relies on. An answer with no citation, or citing a meeting or turn that does not exist, SHALL be replaced by "No lo encuentro en tus reuniones."

#### Scenario: Answer with evidence
- **WHEN** the wearer asks "¿Qué le prometí al cliente el martes?" and a meeting that day records the commitment
- **THEN** the answer states the commitment and cites that meeting and turn

#### Scenario: Not in memory
- **WHEN** the wearer asks about something no meeting mentions
- **THEN** the answer is "No lo encuentro en tus reuniones." with no citation

#### Scenario: Invented citation
- **WHEN** the model cites a turn id that the meeting does not have
- **THEN** the hub replaces the answer with "No lo encuentro en tus reuniones."

### Requirement: Only about the wearer's meetings
Questions that are not about the wearer's meetings, people, commitments or glossary SHALL be declined with one sentence saying Lente answers only from their meetings.

#### Scenario: General knowledge
- **WHEN** the wearer asks "Explícame los agujeros negros"
- **THEN** Lente declines and makes no claim from outside the memory

### Requirement: Ask by voice
When a completed turn from the wearer starts with "Lente" followed by a question, the hub SHALL answer it as a question to Lente and SHALL NOT treat it as a meeting question for a DILO card. The answer SHALL be published as a cue labelled Lente with its measured time. In Solo grabar the hub SHALL NOT answer.

#### Scenario: Mid-meeting question
- **WHEN** the wearer says "Lente, ¿qué dijo Ana del deadline la semana pasada?"
- **THEN** a Lente card with the answer and its source appears, and no DILO card is made for that turn
