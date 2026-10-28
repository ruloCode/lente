# language-profile Specification

## Purpose
A personal glossary and track record that make Lente's help fit the wearer's actual second-language gaps.

## Requirements

### Requirement: Personal glossary
After each meeting, the hub SHALL add to the wearer's glossary the terms, acronyms and idioms from it that a non-native speaker is likely not to know, each with a one-line meaning in the wearer's language, the sentence where it was heard, and the meeting it came from. A term already in the glossary SHALL be counted again instead of duplicated.

#### Scenario: New acronym
- **WHEN** "GA" is used in a meeting and is not in the glossary
- **THEN** the glossary gains "GA = general availability" with the sentence it appeared in

#### Scenario: Known term again
- **WHEN** a term already in the glossary appears in a later meeting
- **THEN** its count increases and its latest example is updated

### Requirement: Asked versus answered
The profile SHALL count, per meeting and in total, how many questions were addressed to the wearer and how many the wearer answered with a turn of their own within 20 seconds.

#### Scenario: Unanswered question
- **WHEN** the wearer is asked a question and does not speak within 20 seconds
- **THEN** it counts as asked but not answered

### Requirement: Words the wearer uses
The profile SHALL keep the words and phrases the wearer commonly uses in the meeting language, so replies can prefer them.

#### Scenario: Profile grows
- **WHEN** the wearer has spoken in several meetings
- **THEN** the profile lists their most common phrasings
