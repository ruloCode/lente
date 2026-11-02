# Spec Delta

## Purpose

Letting many people use Lente, each with an account opened with Google, their own devices, a spend limit, and the right to take their data or delete it.

## ADDED Requirements

### Requirement: Sign in with Google
People SHALL sign in with their Google account, on the Android app with Google's native account picker and on the web page through a Google redirect, and the hub SHALL accept a request only when it carries a valid session for that user.

#### Scenario: First sign-in on the phone
- **WHEN** a person on the allow list picks their Google account in the app for the first time
- **THEN** an account with its own encryption key is created and the app opens on the introduction, signed in

#### Scenario: Expired session
- **WHEN** the app calls the hub with an access token that has expired
- **THEN** the hub answers 401, the app refreshes the session once and repeats the call, and only if that fails returns to sign-in

#### Scenario: Forged token
- **WHEN** a request carries a token not signed by the project's key, for another audience, or from another issuer
- **THEN** the hub answers 401 and acts for no one

### Requirement: Devices belong to one user
Every clip, desktop capture or MCP client SHALL connect with a token bound to one user, created by that user while signed in, shown once, stored only as a hash, and revocable from the account screen.

#### Scenario: Revoked clip
- **WHEN** the user revokes a clip and that clip connects again
- **THEN** the connection is refused and nothing it sends reaches any user's memory

#### Scenario: Another user's device
- **WHEN** a user asks to revoke or rename a device that belongs to someone else
- **THEN** the hub answers as if the device did not exist

### Requirement: Spend limit per user
The hub SHALL count each user's model and transcription usage per day and SHALL pause their listening, with a note on the phone, once their monthly cap is reached, while answers from what is already written keep working.

#### Scenario: Cap reached mid-meeting
- **WHEN** a user's usage this month reaches their cap while listening
- **THEN** listening pauses, the meeting so far is kept, and the phone says the monthly limit was reached

### Requirement: Export and delete
A signed-in user SHALL be able to download everything Lente keeps about them as readable JSON and to delete their account, which SHALL remove their encryption key first, then their data, their devices and their sign-in.

#### Scenario: Account deleted
- **WHEN** a user confirms deleting their account
- **THEN** their key and rows are gone, their devices are refused, signing in again starts a new empty account, and no other user's data changes

### Requirement: Allow list before opening up
While Lente is in testing, the hub SHALL create accounts only for emails on the allow list and SHALL refuse others with a clear message.

#### Scenario: Email not on the list
- **WHEN** someone outside the allow list signs in with Google
- **THEN** no account is created and the app says Lente is in a closed test
