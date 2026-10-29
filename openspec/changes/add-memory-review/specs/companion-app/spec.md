# Spec Delta

## ADDED Requirements

### Requirement: Facts to review
Memoria SHALL show "Por revisar" with a count when facts are waiting, each with Guardar, Descartar and a link to its turn, and below it the kept facts with a search field and a delete control on each.

#### Scenario: Review after a meeting
- **WHEN** a meeting's notes proposed three facts
- **THEN** Memoria shows "3 por revisar", and keeping one moves it to the kept list while discarding one removes it
