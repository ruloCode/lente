# Spec Delta

## ADDED Requirements

### Requirement: Proposed facts with evidence
The notes extraction SHALL also propose up to five durable facts about people, projects or clients, each in Spanish, at most 120 characters, citing the turn that supports it, in the same model call. A fact without a valid turn SHALL be dropped. Proposed facts SHALL wait for review and SHALL NOT be used by any model call until kept.

#### Scenario: A colleague's role
- **WHEN** a colleague says in a meeting "I own the mobile release this quarter"
- **THEN** a fact like "Ana lleva el release móvil este trimestre" is proposed, citing that turn

#### Scenario: Unsupported fact
- **WHEN** the model proposes a fact citing a turn the meeting does not have
- **THEN** the fact is dropped

### Requirement: Kept facts join the memory
Facts the wearer keeps SHALL be stored as text and SHALL be part of the memory prefix used by replies, briefings and questions to Lente. Discarded facts SHALL be deleted. Deleting a meeting SHALL delete the facts that only it supports.

#### Scenario: Keep a fact
- **WHEN** the wearer keeps a proposed fact
- **THEN** the next briefing and the next question to Lente receive it in their memory

#### Scenario: Delete the meeting behind a fact
- **WHEN** the wearer deletes the only meeting that supports a kept fact
- **THEN** that fact is deleted too
