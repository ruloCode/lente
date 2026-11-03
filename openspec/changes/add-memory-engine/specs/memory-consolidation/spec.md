# Spec Delta

## Purpose

Turning the wearer's continuous record into searchable memory while they record: segments within seconds, memory cards within minutes, and project briefs and people cards in the background, without losing what was said before.

## ADDED Requirements

### Requirement: Segments within seconds
Speech SHALL become searchable segments as it is transcribed, with no model call. Each segment keeps the turns it covers and is closed by a pause, a change of speakers or its maximum length.

#### Scenario: Asking about what was just said
- **WHEN** Ana says a date in a meeting that is still running and the wearer asks the chat about it 15 s later
- **THEN** the answer cites that turn

#### Scenario: Camera description
- **WHEN** the camera describes a whiteboard
- **THEN** the description is searchable as a moment of that day as soon as it is written

### Requirement: Memory cards per episode
When a meeting or Solo grabar episode ends, the hub SHALL write one memory card for it in the same model call as its notes. A card holds the people, facts with supporting turns, commitments and search keys in Spanish and English.

#### Scenario: Card with evidence
- **WHEN** an episode ends with a decision that cites a turn that does not exist
- **THEN** that fact is dropped and the rest of the card is kept

#### Scenario: No extra call for meetings
- **WHEN** a meeting ends
- **THEN** its notes and its card come from a single model call

### Requirement: Cards during long episodes
During an episode longer than 10 minutes, the hub SHALL write a card for each 10 minutes of speech, so a long recording is searchable before it ends. It SHALL skip windows held by idle pause or the silence gate.

#### Scenario: All-day recording
- **WHEN** the wearer records for 8 hours in Solo grabar
- **THEN** each 10-minute window with speech has a card within 2 minutes of the window closing (target), and silent windows have none

### Requirement: Append-only facts
A new fact that contradicts an earlier one SHALL close the earlier fact's validity instead of deleting it. A fact the wearer kept SHALL never be superseded without the wearer.

#### Scenario: Date moved
- **WHEN** a Monday meeting set the launch for the 20th and a Thursday meeting moved it to the 27th
- **THEN** «¿Cuándo es el lanzamiento?» answers the 27th and «¿Qué fecha se dijo el lunes?» answers the 20th, each citing its meeting

#### Scenario: Kept fact
- **WHEN** a new card contradicts a fact the wearer kept
- **THEN** the kept fact stays valid and the new fact is stored next to it

### Requirement: Project briefs
Each project SHALL have a brief of at most 2,000 characters with its current state, people, open commitments and recent decisions, with sources. It SHALL be rewritten after new cards in that project, at most once every 30 minutes, and in the nightly run.

#### Scenario: Brief follows the work
- **WHEN** a meeting in Atlas ends with a new commitment
- **THEN** within 30 minutes Atlas's brief lists that commitment with its meeting as a source

### Requirement: People cards
A person seen in at least two episodes SHALL have a card of at most 600 characters: who they are to the wearer, what they own and the commitments between them, with sources. It SHALL be rewritten nightly.

#### Scenario: Recurring colleague
- **WHEN** Ana appears in three meetings this week
- **THEN** after the nightly run Ana has a card citing those meetings

### Requirement: Consolidation is bounded
Consolidation calls SHALL count in the usage meter and stop at the wearer's spend cap. A catch-up of past episodes SHALL reach back at most 31 days per run, oldest first.

#### Scenario: Spend cap reached
- **WHEN** the wearer's spend cap is reached mid-day
- **THEN** segments keep being indexed, cards wait until the cap allows them, and the phone shows that cards are paused

### Requirement: Sealed like the rest of the memory
Cards, briefs, people cards and the index SHALL be stored only as values sealed with the wearer's data key. Forgetting a day or deleting a meeting SHALL remove its segments, cards and their facts from the index and from storage.

#### Scenario: Forget a day
- **WHEN** the wearer forgets Tuesday
- **THEN** no answer can cite a segment, card or fact from Tuesday, and the briefs and people cards are rewritten without it
