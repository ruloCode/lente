# Spec Delta

## MODIFIED Requirements

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
