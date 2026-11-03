# Spec Delta

## ADDED Requirements

### Requirement: Add a clip from the app
Dispositivos SHALL offer «Añadir clip», which finds a clip in setup mode, asks the wearer to confirm the code it blinks, and sends it the network, the hub and a token for the signed-in user. Each clip in the list SHALL show its firmware version.

#### Scenario: Codes don't match
- **WHEN** the code in the app is not the one the clip blinks and the wearer says so
- **THEN** the app sends nothing and offers to scan again
