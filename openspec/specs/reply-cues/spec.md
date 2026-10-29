# reply-cues Specification

## Purpose
The single line the wearer can say right after being asked something: the reason Lente exists.

## Requirements

### Requirement: Detect questions
The hub SHALL treat a completed turn as a question when it ends with a question mark, starts with an inverted question mark, or its last sentence opens with an interrogative word in English or Spanish. When a reply is generated, the wearer's language profile SHALL be part of the context so the reply prefers words and phrasings the wearer already uses.

#### Scenario: Question without punctuation
- **WHEN** a turn reads "Okay, let's move on. Who owns the API"
- **THEN** it is treated as a question

#### Scenario: Statement
- **WHEN** a turn reads "I think we should ship it."
- **THEN** no reply is generated

#### Scenario: Reply in the wearer's words
- **WHEN** the profile shows the wearer usually says "I'll double-check and get back to you"
- **THEN** a reply that defers an answer uses that phrasing rather than an unfamiliar idiom

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

### Requirement: Show how long it took
Each cue SHALL carry the measured time from the completed turn to the finished reply, in milliseconds.

#### Scenario: Latency shown
- **WHEN** a cue reaches the phone
- **THEN** the card shows "in N ms" with the measured value

### Requirement: Cues only while assisting
Reply cues SHALL be produced only while the assist mode is Asistir.

#### Scenario: Switch back to Asistir
- **WHEN** the wearer switches from Solo grabar to Asistir and someone asks them a question
- **THEN** a DILO card appears as usual
