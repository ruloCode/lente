# Spec Delta

## ADDED Requirements

### Requirement: Partial in the connect snapshot
The hub SHALL keep the latest partial text of the turn in progress and SHALL send it to a phone that connects, after the recent history, so the phone can show the turn in progress at once. The kept partial SHALL be cleared when its turn completes and when listening pauses.

#### Scenario: Connect while someone speaks
- **WHEN** a phone connects while a turn is in progress
- **THEN** it receives the recent turns and then the current partial text

#### Scenario: Connect while paused
- **WHEN** a phone connects while Lente is paused
- **THEN** it receives no partial

### Requirement: Session time in the status
The hub's status SHALL carry when the current listening session started and how long it has been listening, excluding paused time, so every phone shows the same elapsed time.

#### Scenario: Two phones
- **WHEN** two phones are open on the same session
- **THEN** both show the same elapsed time, within one second
