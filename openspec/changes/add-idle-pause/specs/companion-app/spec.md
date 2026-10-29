# Spec Delta

## ADDED Requirements

### Requirement: Start, idle note and today's spend
When Lente is paused at boot, Ahora SHALL offer a clear way to start listening. When it paused for inactivity, the phone SHALL say so ("En pausa: 20 min sin que hablaras") with one tap to resume. Dispositivos SHALL show "Hoy": minutes sent to transcription, tokens and the approximate cost in US$, from the hub's usage meter.

#### Scenario: Paused for inactivity
- **WHEN** the hub paused itself for inactivity
- **THEN** the phone shows the reason and one tap starts listening again

#### Scenario: Check today's spend
- **WHEN** the wearer opens Dispositivos after a meeting
- **THEN** "Hoy" shows the minutes transcribed, the tokens and the approximate cost
