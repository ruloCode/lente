# Spec Delta

## ADDED Requirements

### Requirement: Deploy from main
The production hub SHALL be deployed only by the deploy workflow from a commit reachable from `main`, after typecheck, tests and smoke pass, with the recreate strategy. `/health` SHALL report the deployed commit.

#### Scenario: A branch deploy
- **WHEN** someone runs the deploy workflow on a commit that is not on `main`
- **THEN** the workflow stops before deploying and says why

#### Scenario: What runs
- **WHEN** anyone opens `/health` on the production hub
- **THEN** it shows the commit the hub was deployed from

### Requirement: Health alerts
A scheduled check SHALL call `/health` every 5 minutes and alert the owner once when the hub is down, the database is slow, paused or unreachable, or the day's spend passes the threshold, and once more when the condition clears. Alerts SHALL carry no content.

#### Scenario: Database paused
- **WHEN** Supabase pauses the project
- **THEN** the owner receives one alert naming the database state, and one when it is back

### Requirement: Restore drill
The nightly export SHALL be restored into a scratch schema at least once a month, and one test account's rows SHALL be opened with the KEK to prove the backup is usable.

#### Scenario: Monthly drill
- **WHEN** the monthly drill runs
- **THEN** the test account's meetings open from the restored rows and the time it took is recorded
