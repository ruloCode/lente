# Spec Delta

## Purpose

Choosing the right Meta model and provider for each job, and never letting one slow provider block the wearer.

## ADDED Requirements

### Requirement: Ordered providers per job
Each job (reply cue, scene description, summary, extraction, agent) SHALL have an ordered list of model-provider pairs; the hub SHALL try them in order, moving to the next on error or when the first token has not arrived within the job's timeout.

#### Scenario: Fast lane slow
- **WHEN** Muse Spark Open has not produced its first token within the cue timeout
- **THEN** the hub cancels that request and asks the next provider

#### Scenario: Provider not configured
- **WHEN** a provider in the list has no API key
- **THEN** it is skipped without an error

### Requirement: Remember what is healthy
After a provider fails three times in a row for a job, the hub SHALL skip it for that job for two minutes before trying it again.

#### Scenario: Provider outage
- **WHEN** the fast-lane provider keeps failing
- **THEN** cues come from the fallback without paying its timeout each time

### Requirement: Default routing
By default, reply cues SHALL route to Muse Spark Open on Baseten, then on Fireworks, then Muse Spark 1.3 at minimal effort; all other jobs SHALL route to Muse Spark 1.3.

#### Scenario: Only the Meta key is set
- **WHEN** only the Meta Model API key is configured
- **THEN** cues are served by Muse Spark 1.3 at minimal effort
