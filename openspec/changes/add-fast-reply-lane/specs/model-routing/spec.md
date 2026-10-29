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

#### Scenario: Every route has failed
- **WHEN** every route of a job has failed three times in a row
- **THEN** the last route (Muse Spark 1.3) is still tried on the next cue, because the last resort never cools down

### Requirement: Default routing
By default, reply cues SHALL route to Muse Spark Open on Baseten, then on Fireworks when its key is set, then Muse Spark 1.3 at minimal effort; all other jobs SHALL route to Muse Spark 1.3.

#### Scenario: Baseten model follows the key
- **WHEN** `BASETEN_MODEL` is not set
- **THEN** the Baseten target asks for `meta-models/muse-spark-open-1026`, the only model the hackathon key accepts

#### Scenario: Key and model do not match
- **WHEN** Baseten answers 403 or 404 for the model (a hackathon key with the unsuffixed name, or a regular key with `-1026`)
- **THEN** the cue comes from the next provider and the logged error names the model and says to check that `BASETEN_MODEL` matches the key

#### Scenario: Only the Meta key is set
- **WHEN** only the Meta Model API key is configured
- **THEN** cues are served by Muse Spark 1.3 at minimal effort
