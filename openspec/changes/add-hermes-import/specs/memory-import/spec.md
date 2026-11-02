# Spec Delta

## Purpose

Letting the owner bring his earlier history into Lente, so he can ask about it.

## ADDED Requirements

### Requirement: Importing hermes history
The import SHALL copy the owner's hermes meetings and memories into his Lente account, sealed under his data key, marked as coming from hermes, and SHALL be safe to run again without duplicating anything.

#### Scenario: First import
- **WHEN** the owner runs the import for his email after signing in to Lente once
- **THEN** each hermes meeting with a transcript or summary appears as a Lente meeting with its turns and notes, each memory as a fact to review that also feeds its day's digest, and only counts are printed

#### Scenario: Running it again
- **WHEN** the owner runs the import a second time
- **THEN** no meeting or fact is duplicated

#### Scenario: No Lente account
- **WHEN** the email has never signed in to Lente
- **THEN** the import stops before reading or writing anything and says to sign in first

### Requirement: Asking about the imported past
After an import, Lente SHALL be able to answer from the imported history through the same profile, digests and lookups as its own memory.

#### Scenario: A question about an old meeting
- **WHEN** the owner asks about something decided in a meeting from months before Lente existed
- **THEN** the answer comes from the imported meeting and cites it
