# Spec Delta

## ADDED Requirements

### Requirement: Spanish meaning on the Dilo card
When a cue carries a Spanish meaning, the Dilo card SHALL show it under the sentence to say, smaller and muted, so the sentence stays the most visible line. Narration SHALL speak only the sentence to say, never the meaning.

#### Scenario: English reply with its meaning
- **WHEN** a cue arrives with an English sentence and a Spanish meaning
- **THEN** the card shows the English sentence first and the Spanish meaning below it, and narration speaks only the English sentence

#### Scenario: Spanish reply
- **WHEN** a cue arrives with a Spanish sentence and no meaning
- **THEN** the card shows the sentence alone, with no empty line below it
