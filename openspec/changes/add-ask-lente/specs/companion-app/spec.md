# Spec Delta

## ADDED Requirements

### Requirement: Preguntar screen
The side menu SHALL include Preguntar: a question box and this session's questions and answers, newest last. Each answer SHALL show chips for the meetings it cites, and a chip SHALL open that meeting's detail at the cited turn. While waiting, the screen SHALL show that Lente is looking in the meetings.

#### Scenario: Ask and open the source
- **WHEN** the wearer asks a question and taps the meeting chip under the answer
- **THEN** the meeting detail opens at the cited turn

### Requirement: Lente answers in the reply slot
A cue labelled Lente SHALL show in the reply slot like a DILO card, with its source meeting, and SHALL be spoken in Spanish.

#### Scenario: Voice question with the phone in the pocket
- **WHEN** the wearer asks Lente by voice through the clip
- **THEN** the answer is spoken in Spanish and the card stays in the reply slot until the next card
