# Spec Delta

## Purpose

The single line the wearer can say right after being asked something: the reason Lente exists.

## ADDED Requirements

### Requirement: Detect questions
The hub SHALL treat a completed turn as a question when it ends with a question mark, starts with an inverted question mark, or its last sentence opens with an interrogative word in English or Spanish.

#### Scenario: Question without punctuation
- **WHEN** a turn reads "Okay, let's move on. Who owns the API"
- **THEN** it is treated as a question

#### Scenario: Statement
- **WHEN** a turn reads "I think we should ship it."
- **THEN** no reply is generated

### Requirement: One short reply per question
For each question the hub SHALL ask Muse Spark 1.3 for one sentence the wearer can say, in the language of the question, using the last twelve turns as context, and SHALL publish it as a cue of at most 90 characters with no quotes or preamble.

#### Scenario: Reply published
- **WHEN** a question turn is published
- **THEN** a cue with a single sentence of at most 90 characters reaches the phone and the clip blinks

#### Scenario: Newer question wins
- **WHEN** a second question arrives before the reply to the first is ready
- **THEN** only the reply to the newer question is shown

### Requirement: Show how long it took
Each cue SHALL carry the measured time from the completed turn to the finished reply, in milliseconds.

#### Scenario: Latency shown
- **WHEN** a cue reaches the phone
- **THEN** the card shows "in N ms" with the measured value
