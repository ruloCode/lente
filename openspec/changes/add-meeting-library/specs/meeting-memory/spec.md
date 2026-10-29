# Spec Delta

## ADDED Requirements

### Requirement: Title and topic
The notes extraction SHALL also return a title in Spanish of at most 60 characters and one topic from a fixed list (for example Proyecto, Cliente, Equipo, Entrevista, Clase, Personal, Otro), in the same model call. A title the wearer typed SHALL be kept instead of the generated one.

#### Scenario: Untitled meeting
- **WHEN** a meeting started without a title ends and its notes are extracted
- **THEN** it gets a generated Spanish title and a topic from the list

#### Scenario: Wearer's title
- **WHEN** the wearer typed a title before the meeting
- **THEN** that title is kept and only the topic is added

### Requirement: Search meetings
The hub SHALL search titles, notes and transcripts of the stored meetings for a text query, ignoring case and accents, without a model call, and SHALL return each matching meeting with its matching lines, newest meeting first.

#### Scenario: Find a word said last week
- **WHEN** the wearer searches "presupuesto"
- **THEN** every meeting whose notes or transcript contain "presupuesto" or "Presupuesto" is returned with the matching lines

#### Scenario: Nothing found
- **WHEN** no meeting matches
- **THEN** the hub returns an empty list
