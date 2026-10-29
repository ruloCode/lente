# Spec Delta

## Purpose

Measuring how fast and how right Lente is on a fixed synthetic meeting set, so every claim has a number behind it.

## ADDED Requirements

### Requirement: Labelled synthetic set
The eval set SHALL consist of scripted dialogues rendered to audio with synthetic voices, each line labelled with its speaker, whether it is a question, and whether it is addressed to the wearer. The set SHALL be regenerable from its scripts.

#### Scenario: Regenerate the set
- **WHEN** the set generator runs on a clean checkout
- **THEN** it produces the same dialogues and labels

### Requirement: Replay through the real path
The eval runner SHALL replay each dialogue at real-time pace through the same hub code path as the clip and call the same models with the same settings as production.

#### Scenario: Production settings
- **WHEN** an eval runs
- **THEN** its report lists the model ids, reasoning effort and hub settings it used

### Requirement: Report speed and correctness
The runner SHALL report, per run: transcription finalize latency, cue latency p50 and p95, addressing precision and recall, false cue rate, vision latency p50 and p95, and tokens per meeting, and SHALL save the raw per-event measurements alongside the summary.

#### Scenario: Summary for the docs
- **WHEN** a run completes
- **THEN** a dated summary table is ready to paste into docs/benchmarks.md, and the raw events are in `results/`

### Requirement: Stage-level latency
Every cue and scene description SHALL carry timestamps for each stage it went through (audio or photo received by the hub, turn completed by transcription, reply requested from the model, first model token, reply finished, sent to the phones, delivered to the phone), so a slow cue can be attributed to one stage. The timings SHALL reach the phone and the day record. Delivery SHALL be measured on the hub's clock, from the phone's acknowledgement of the card.

#### Scenario: Slow cue
- **WHEN** a cue takes longer than usual
- **THEN** its stage timings show which stage took the time

#### Scenario: Waiting on the addressing check
- **WHEN** a cue waits for the speaker label or a model addressing check before the reply is requested
- **THEN** that wait shows as its own stage, not as model time

### Requirement: Fast checks on every change
On every push, without API keys, CI SHALL run the typecheck and unit tests, compile the clip firmware, and run an end-to-end smoke test in which the clip emulator streams to the hub with the Meta API stubbed and the expected events reach a phone client.

#### Scenario: Broken test
- **WHEN** a push breaks a unit test
- **THEN** the CI run fails and names the test

#### Scenario: Firmware no longer compiles
- **WHEN** a push breaks the firmware build
- **THEN** the CI run fails on the firmware step
