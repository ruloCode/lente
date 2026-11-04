# Spec Delta

## Purpose

Letting anyone, judges first, sign in with their own Google account during the judging period and use Lente end to end, with their own memory, within limits that keep the hackathon's credits and the single container safe.

## ADDED Requirements

### Requirement: Open sign-up with an end date
With `LENTE_SIGNUP=open`, the hub SHALL create an account for any verified Google email until `LENTE_SIGNUP_UNTIL`. After that date, or with `LENTE_SIGNUP=allowlist`, only emails on the allow list SHALL get a new account; existing accounts SHALL keep signing in.

#### Scenario: A judge signs in during judging
- **WHEN** a verified Google account not on the allow list signs in on 2026-11-06 with sign-up open until 2026-11-17
- **THEN** an account is created and the judge reaches the terms screen

#### Scenario: After the end date
- **WHEN** a new Google account signs in after `LENTE_SIGNUP_UNTIL`
- **THEN** no account is created and the page says sign-ups are closed for now

#### Scenario: An empty allow list in allowlist mode
- **WHEN** sign-up is `allowlist` and the list is empty
- **THEN** nobody new gets an account

### Requirement: Terms before data
Until an account has accepted the current preview terms, the hub SHALL answer its data routes with 428 and `needsTerms: true`, and SHALL serve `/terminos` and `/privacidad` with their version to anyone.

#### Scenario: First sign-in
- **WHEN** a new account asks for its meetings before accepting
- **THEN** the hub answers 428 and the app shows the terms screen

#### Scenario: Accepted
- **WHEN** the account accepts the current version
- **THEN** its data routes answer normally and the acceptance time is kept

### Requirement: Daily spend caps
Before every model or transcription call for an account other than the owner's, the hub SHALL check that account's spend today against the per-user cap and the spend today of every account but the owner's against the global cap. When either is reached, the call SHALL NOT be made, the person SHALL get a short Spanish explanation, and listening SHALL pause with that reason.

#### Scenario: A judge reaches the per-user cap
- **WHEN** an account's spend today reaches `LENTE_USER_DAY_CAP_USD`
- **THEN** its next question is answered with the limit message, no model is called, and other accounts are unaffected

#### Scenario: The global cap
- **WHEN** the sum of today's spend of every account but the owner's reaches `LENTE_GLOBAL_DAY_CAP_USD`
- **THEN** every non-owner account gets the limit message until the next day in Bogotá's time zone

#### Scenario: A restart
- **WHEN** the container restarts mid-day
- **THEN** today's spend per account is read back and the caps still hold

### Requirement: A sample to start from
On an account's first use after accepting the terms, the hub SHALL add a sample project with two synthetic meetings, tasks and kept facts, all marked as sample, and SHALL let the person remove the sample in one step.

#### Scenario: Asking in the first minute
- **WHEN** a new account asks «¿Qué se decidió sobre la beta?»
- **THEN** the answer comes from the sample meeting and cites it

#### Scenario: Removing the sample
- **WHEN** the person taps «Borrar ejemplo»
- **THEN** every sample item is gone and their own data stays

### Requirement: Media stays the owner's
Audio and keyframes SHALL be kept only for the owner's account; every other account SHALL keep text only, whatever its switches say.

#### Scenario: A judge records
- **WHEN** a judge records five minutes with the camera on
- **THEN** their memory has the text of what was said and seen, and no media object exists for their account

### Requirement: A public download page
The project website SHALL offer the Android app as a stable download link to the latest release's `lente.apk`, a QR code to it, install steps, and a sign-in link to the web app, and SHALL show only screenshots made with synthetic data.

#### Scenario: A judge on a phone
- **WHEN** a judge opens the website on an Android phone and taps «Descargar para Android»
- **THEN** the latest `lente.apk` downloads and the page shows how to install it and sign in
