# voice-narration Specification

## Purpose
Letting the wearer hear cues and summaries through earbuds instead of looking at the phone.

## Requirements

### Requirement: Opt-in voice
Voice SHALL be off until the wearer turns it on with a tap, and the phone SHALL remember the choice.

#### Scenario: First visit
- **WHEN** the phone page opens for the first time
- **THEN** nothing is spoken until the wearer taps Voice

### Requirement: Speak by priority
A cue SHALL interrupt whatever is being spoken; summaries and photo reads SHALL be spoken only when nothing else is; Live scene changes SHALL be spoken at most once every seven seconds and only when nothing else is.

#### Scenario: Cue during a summary
- **WHEN** a cue arrives while a summary is being spoken
- **THEN** the summary stops and the cue is spoken

### Requirement: Natural voice with fallback
When the hub is configured with an ElevenLabs key, speech SHALL use that voice through the hub; otherwise, or if that request fails, the phone's own speech synthesis SHALL be used, choosing Spanish or English by the text.

#### Scenario: Synthesis service down
- **WHEN** the hub's speech request fails
- **THEN** the same text is spoken with the phone's own voice
