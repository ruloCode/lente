# Spec Delta

## ADDED Requirements

### Requirement: Forget a day
The wearer SHALL be able to forget a day after a confirmation that names what will be deleted. Forgetting SHALL delete, in order, the day digest, the week and month digests that summarised it (rebuilt later without it), the facts and notes sourced in that day, the meetings that started that day and the day record, and SHALL leave the day whole if it fails halfway.

#### Scenario: Forget Monday
- **WHEN** the wearer confirms «Olvidar este día» on Monday
- **THEN** Monday's moments, meetings, notes and digests are gone, the week's digest is rebuilt without Monday, and the chat no longer finds anything from that day
