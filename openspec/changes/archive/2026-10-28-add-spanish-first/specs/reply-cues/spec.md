# Spec Delta

## MODIFIED Requirements

### Requirement: One short reply per question
For each question the hub SHALL ask Muse Spark 1.3 for one sentence the wearer can say, in the language of the question, using the last twelve turns as context, and SHALL publish it as a cue of at most 90 characters with no quotes or preamble. When the question is not in Spanish, the same call SHALL also return the sentence's meaning in Spanish, at most 90 characters, and the cue SHALL carry it as a separate field; when the question is in Spanish the cue SHALL carry no meaning.

#### Scenario: Reply published
- **WHEN** a question turn is published
- **THEN** a cue with a single sentence of at most 90 characters reaches the phone and the clip blinks

#### Scenario: Newer question wins
- **WHEN** a second question arrives before the reply to the first is ready
- **THEN** only the reply to the newer question is shown

#### Scenario: English question gets a Spanish meaning
- **WHEN** a colleague asks in English "Can you have the estimate ready by Thursday?"
- **THEN** the cue's sentence is in English and the cue also carries its meaning in Spanish

#### Scenario: Spanish question needs no meaning
- **WHEN** a colleague asks in Spanish "¿Puedes tener el estimado para el jueves?"
- **THEN** the cue's sentence is in Spanish and the cue carries no meaning

#### Scenario: Meaning missing from the model's answer
- **WHEN** the model returns a sentence but no usable meaning for an English question
- **THEN** the cue is still published with the sentence alone, without waiting or retrying
