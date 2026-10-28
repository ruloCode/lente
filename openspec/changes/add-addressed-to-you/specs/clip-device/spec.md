# Spec Delta

## MODIFIED Requirements

### Requirement: Blink for a cue
The clip SHALL blink its user LED three times and pulse its vibration motor for about 300 ms when the hub signals a cue, and SHALL otherwise keep the LED dark and the motor off. A clip without a motor fitted SHALL behave the same with the LED alone.

#### Scenario: Cue signal
- **WHEN** the hub sends the blink command
- **THEN** the LED blinks three times and the motor buzzes once within about one second

#### Scenario: Motor not fitted yet
- **WHEN** the clip has no motor connected
- **THEN** the LED still blinks and nothing else changes
