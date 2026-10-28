# Spec Delta

## Purpose

Knowing which voice in the room is the wearer and whether a turn is aimed at them, so Lente speaks up only at the moment that matters.

## ADDED Requirements

### Requirement: Identify the wearer's voice
The hub SHALL identify the wearer's speaker label within a session as the label whose turns are consistently loudest at the clip's microphone, once at least two speakers and three turns have been heard, and SHALL let the wearer set it explicitly by saying an enrollment phrase that includes their configured name.

#### Scenario: Two people talking
- **WHEN** the wearer and one colleague have each spoken at least twice
- **THEN** the wearer's label is the one with the higher typical loudness, and the phone shows "You" for it

#### Scenario: Enrollment phrase
- **WHEN** the wearer says "Lente, soy Rulo" with "Rulo" configured as their name
- **THEN** that turn's speaker label becomes the wearer immediately

#### Scenario: New session after a reconnect
- **WHEN** transcription restarts and labels are reassigned
- **THEN** the wearer is identified again by the same rules, without asking

### Requirement: Decide when the wearer is addressed
A completed question SHALL count as addressed to the wearer when it comes from a speaker other than the wearer and either mentions one of the wearer's configured names or aliases, or directly follows a turn by the wearer, or a fast model check on the last few turns says it is aimed at the wearer.

#### Scenario: Named
- **WHEN** a colleague asks "Andres, can you ship the beta by Friday?"
- **THEN** the question is addressed to the wearer without calling the model

#### Scenario: The wearer asks
- **WHEN** the wearer asks a question
- **THEN** it is never treated as addressed to the wearer

#### Scenario: Question to someone else
- **WHEN** a colleague asks another named colleague a question
- **THEN** it is not addressed to the wearer

### Requirement: Explainable decision
Each addressing decision SHALL record which rule decided it (name, reply, model, or not addressed) so it can be shown and evaluated.

#### Scenario: Timeline shows why
- **WHEN** a cue appears because the wearer was named
- **THEN** the timeline entry shows that the wearer's name was mentioned
