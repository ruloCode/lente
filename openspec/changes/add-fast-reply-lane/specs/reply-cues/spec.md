# Spec Delta

## MODIFIED Requirements

### Requirement: Show how long it took
Each cue SHALL carry the measured time from the completed turn to the finished reply, in milliseconds, and the model and provider that produced it.

#### Scenario: Latency shown
- **WHEN** a cue reaches the phone
- **THEN** the card shows "in N ms" with the measured value

#### Scenario: Served by the fallback
- **WHEN** a cue was produced by the fallback model
- **THEN** the timeline entry names that model and provider
