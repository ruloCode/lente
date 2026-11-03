# Spec Delta

## Purpose

Letting Lente answer from everything it has learned about the user, not only from the last days, while every answer still shows where it comes from.

## ADDED Requirements

### Requirement: A profile of the user
Lente SHALL keep a short profile of the user (who they are, the people and projects they deal with, their preferences and standing commitments), rewritten from the new notes after each meeting, visible and correctable in Memoria, where a correction SHALL win over the generated text.

#### Scenario: Correcting the profile
- **WHEN** the user corrects their role in the profile
- **THEN** the correction is kept as a fact and the next profile and answers use it

### Requirement: Digests over time
Lente SHALL write a digest per day, week and month from the notes and the day record, each keeping the ids of the records it came from, within a fixed size, and SHALL catch up on any missed digest the next time the user's hub runtime starts.

#### Scenario: A day without the hub
- **WHEN** the nightly digest could not run because the hub was down
- **THEN** the digest for that day is written the next time the user connects

### Requirement: Answers from the whole history
For each question Lente SHALL read the profile and the recent digests, decide what to look up, search the user's encrypted history, open the meetings and days it needs, and answer only from what it read, citing records that were actually shown and saying when nothing backs the answer.

#### Scenario: Answer in an old meeting
- **WHEN** the user asks what was agreed with a person in a meeting three months ago
- **THEN** Lente finds that meeting, answers in one to three sentences and the chip opens the meeting at the turn

#### Scenario: Nothing in memory
- **WHEN** the user asks about something that never came up
- **THEN** Lente says it cannot find it in what they saw and heard, with no invented names, dates or figures

### Requirement: Measured against the short window
The long-history answers SHALL be measured on a synthetic history of about three months, with accuracy, refusals and latency p50/p90 recorded in `docs/benchmarks.md` next to the 7-day window they replace.

#### Scenario: Eval run
- **WHEN** the long-history eval runs
- **THEN** the benchmarks file gains a row with the date, the model, the accuracy, the refusal rate and both latencies for both approaches
