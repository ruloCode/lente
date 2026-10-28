# Spec Delta

## MODIFIED Requirements

### Requirement: One short reply per question
For each question addressed to the wearer, the hub SHALL ask Muse Spark 1.3 for one sentence the wearer can say, in the language of the question, using the last twelve turns as context, and SHALL publish it as a cue of at most 90 characters with no quotes or preamble, together with who asked. A setting SHALL allow replying to every question instead, for testing.

#### Scenario: Reply published
- **WHEN** a question addressed to the wearer is published
- **THEN** a cue with a single sentence of at most 90 characters and the asker's label reaches the phone and the clip signals

#### Scenario: Newer question wins
- **WHEN** a second addressed question arrives before the reply to the first is ready
- **THEN** only the reply to the newer question is shown

#### Scenario: Not addressed
- **WHEN** a question is aimed at someone else and the testing setting is off
- **THEN** no cue is generated and no model call is made for a reply
