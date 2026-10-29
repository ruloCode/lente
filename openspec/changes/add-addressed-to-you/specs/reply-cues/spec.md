# Spec Delta

## MODIFIED Requirements

### Requirement: One short reply per question
For each question addressed to the wearer (or every question, with the testing setting on), the hub SHALL ask Muse Spark 1.3 for one sentence the wearer can say, in the language of the question, from the last twelve turns, and SHALL publish it as a cue of at most 90 characters with no quotes or preamble, with who asked. For a question not in Spanish, the same call SHALL also return the sentence's Spanish meaning (at most 90 characters) as a separate field; a Spanish question SHALL carry none.

#### Scenario: Reply published
- **WHEN** a question addressed to the wearer is published
- **THEN** a cue with a single sentence of at most 90 characters and the asker's label reaches the phone and the clip signals

#### Scenario: Newer question wins
- **WHEN** a second addressed question arrives before the reply to the first is ready
- **THEN** only the reply to the newer question is shown

#### Scenario: Not addressed
- **WHEN** a question is aimed at someone else and the testing setting is off
- **THEN** no cue is generated and no model call is made for a reply

#### Scenario: English question gets a Spanish meaning
- **WHEN** a colleague asks in English "Can you have the estimate ready by Thursday?"
- **THEN** the cue's sentence is in English and the cue also carries its meaning in Spanish

#### Scenario: Spanish question needs no meaning
- **WHEN** a colleague asks in Spanish "¿Puedes tener el estimado para el jueves?"
- **THEN** the cue's sentence is in Spanish and the cue carries no meaning

#### Scenario: Meaning missing from the model's answer
- **WHEN** the model returns a sentence but no usable meaning for an English question
- **THEN** the cue is still published with the sentence alone, without waiting or retrying
