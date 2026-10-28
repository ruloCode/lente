# Spec Delta

## Purpose

Remembering each meeting as an episode: what was agreed, who owes what, and what is still open.

## ADDED Requirements

### Requirement: Meetings have a beginning and an end
The wearer SHALL be able to start and end a meeting from the phone, optionally with a title; a meeting SHALL also end automatically after ten minutes without speech. Turns heard during a meeting SHALL belong to it.

#### Scenario: Forgot to end
- **WHEN** a meeting is running and ten minutes pass without speech
- **THEN** the meeting ends and its notes are extracted

### Requirement: Notes at the end of a meeting
When a meeting ends, the hub SHALL extract with Muse Spark 1.3 a structured record: a two-sentence summary, decisions, commitments (what, owner by label or "you", due date if said), and open questions, each linked to the turns that support it.

#### Scenario: Commitment with evidence
- **WHEN** a colleague says "Andres will send the estimate on Thursday" during a meeting
- **THEN** the meeting record lists a commitment owned by the wearer, due Thursday, linked to that turn

#### Scenario: Short meeting
- **WHEN** a meeting has fewer than three turns
- **THEN** it is kept without extraction and marked as too short

### Requirement: The wearer controls the memory
The phone SHALL list past meetings with their notes and SHALL let the wearer delete one meeting or all memory; deleted data SHALL be removed from disk.

#### Scenario: Delete a meeting
- **WHEN** the wearer deletes a meeting
- **THEN** its record and turns are gone from disk and no longer used by briefings
