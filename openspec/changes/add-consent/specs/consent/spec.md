# Spec Delta

## ADDED Requirements

### Requirement: Terms and privacy policy
The hub SHALL serve versioned terms and a privacy policy in Spanish and English at `/terminos` and `/privacidad`. A user SHALL accept the current version before Lente listens for them, and the hub SHALL record the version and time of acceptance.

#### Scenario: New version
- **WHEN** the terms version changes after a user accepted the previous one
- **THEN** the next time they open the app they are asked to accept again before listening can start

### Requirement: Sign-up gate
The hub SHALL admit accounts outside the allow list only when a terms version is set, the policy pages are published and paid billing has been confirmed for every model provider in use.

#### Scenario: Billing not confirmed
- **WHEN** a new email signs in, it is not on the allow list, and `LENTE_PAID_MODELS` is not set
- **THEN** the hub refuses with a clear message and creates no account row

### Requirement: Telling the room
The app SHALL explain, before the first meeting, that recording may need everyone's consent, and SHALL offer a one-tap notice to show or speak to the room, with pausing one tap away.

#### Scenario: Notice spoken
- **WHEN** the wearer taps «Avisar a la sala» and chooses to speak it
- **THEN** the phone speaks the notice and that speech never appears as a turn in the meeting

### Requirement: Retention of raw turns
The wearer SHALL choose how long raw turns are kept. Every night the hub SHALL delete turns and day entries older than that, keeping notes, facts, tasks and digests, whose citations to deleted turns SHALL read «turno ya borrado».

#### Scenario: 90 days
- **WHEN** retention is 90 days and a meeting is 91 days old
- **THEN** its turns are gone, its notes remain, and a chip to one of its turns says it was deleted
