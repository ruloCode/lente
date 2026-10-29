# Spec Delta

## ADDED Requirements

### Requirement: Meeting cards
Reuniones SHALL list meetings newest first as cards showing the title, the topic chip, the date, the time range, the duration and the one-line summary, with a search field above the list.

#### Scenario: Two meetings today
- **WHEN** two meetings ended today
- **THEN** both cards show their titles, topic chips, time ranges and durations, the latest first

### Requirement: Meeting detail
Tapping a card SHALL open the meeting's detail with its title, date, time range and duration, then Resumen, Decisiones, Compromisos, Preguntas abiertas and Glosario, and a Transcripción tab with speakers. Each item SHALL open the transcript at the turn it cites. Back SHALL return to the list.

#### Scenario: Check a commitment
- **WHEN** the wearer taps a commitment in the detail
- **THEN** the Transcripción tab opens scrolled to the cited turn, highlighted

### Requirement: Share and delete a meeting
The detail SHALL offer Compartir, which shares the notes as plain text through the phone's share sheet or copies them when sharing is unavailable, and Borrar, which deletes the meeting only on a second tap.

#### Scenario: Share the notes
- **WHEN** the wearer taps Compartir on a phone with a share sheet
- **THEN** the share sheet opens with the title, date and notes as text, and no transcript

### Requirement: Search from the phone
Typing in the search field SHALL show the matching meetings with the matching line under each card; clearing it SHALL show the full list again.

#### Scenario: Search and open
- **WHEN** the wearer searches a word and taps a result
- **THEN** the detail opens at the turn of the matching line
