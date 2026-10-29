# Spec Delta

## MODIFIED Requirements

### Requirement: Notes at the end of a meeting
When a meeting ends, the hub SHALL extract with Muse Spark 1.3 a structured record: a two-sentence summary, decisions, commitments (what, owner by label or "you", due date if said), and open questions, each linked to the turns that support it. The summary, decisions, commitments and open questions SHALL be written in Spanish whatever language the meeting was held in; names, product terms and quoted words SHALL stay as they were said.

#### Scenario: Commitment with evidence
- **WHEN** a colleague says "Andres will send the estimate on Thursday" during a meeting
- **THEN** the meeting record lists a commitment owned by the wearer, due Thursday, linked to that turn

#### Scenario: Short meeting
- **WHEN** a meeting has fewer than three turns
- **THEN** it is kept without extraction and marked as too short

#### Scenario: English meeting, Spanish notes
- **WHEN** a meeting held in English ends
- **THEN** its summary, decisions, commitments and open questions are in Spanish, and a product name said in the meeting appears unchanged
