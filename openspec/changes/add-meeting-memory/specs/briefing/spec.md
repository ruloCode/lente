# Spec Delta

## Purpose

A short card to read before walking into a meeting, built from what Lente remembers.

## ADDED Requirements

### Requirement: Briefing on demand
Given a meeting title and optional participant names, the hub SHALL produce a briefing with Muse Spark 1.3 that lists what the wearer owes the participants, open questions from earlier meetings with them, the glossary terms most likely to come up, and three short phrases the wearer may need, each item linked to the meeting it came from.

#### Scenario: Follow-up meeting
- **WHEN** the wearer asks for a briefing for "Sprint review" with Ana
- **THEN** the card shows the estimate the wearer owes Ana from the last meeting, with its source

#### Scenario: Nothing remembered
- **WHEN** there is no earlier meeting related to the title or names
- **THEN** the briefing says so and still offers three generic phrases for the meeting type

### Requirement: Briefing is grounded
Every claim in a briefing SHALL come from the stored memory or the glossary; the briefing SHALL NOT invent commitments, people or facts.

#### Scenario: Unsupported claim
- **WHEN** the model proposes an item with no linked source
- **THEN** the hub drops that item before showing the briefing
