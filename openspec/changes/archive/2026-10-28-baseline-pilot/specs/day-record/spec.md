# Spec Delta

## Purpose

Keeping the wearer's day as text they can scroll and be summarized, without storing audio or images.

## ADDED Requirements

### Requirement: Keep the day as text
The hub SHALL append every turn, cue, scene description and summary, with its timestamp, to one text file per local day, and SHALL start a new file at midnight. Audio and photos SHALL NOT be stored.

#### Scenario: Midnight
- **WHEN** the first entry after midnight is recorded
- **THEN** it goes to the new day's file and the in-memory day starts empty

#### Scenario: Crash mid-write
- **WHEN** the last line of the day's file is incomplete after a crash
- **THEN** the hub loads the rest of the day and ignores that line

### Requirement: Replay the day to a new viewer
When the phone connects, the hub SHALL send the current status and the most recent 80 entries of the day before live events.

#### Scenario: Phone reloads mid-meeting
- **WHEN** the phone page is reloaded
- **THEN** it shows the earlier turns, cues and summaries of the day

### Requirement: Summarize what is happening
The hub SHALL publish a summary of at most two sentences in the wearer's language with Muse Spark 1.3 every five minutes (configurable) when new turns were heard while listening, and immediately when the wearer asks, covering the last ten minutes on request.

#### Scenario: Nothing heard
- **WHEN** the wearer asks for a summary and nothing was heard in ten minutes
- **THEN** the hub answers that nothing new happened without calling the model

#### Scenario: Periodic summary
- **WHEN** five minutes have passed since the last summary and new turns were heard
- **THEN** a summary appears on the phone and in the day record
