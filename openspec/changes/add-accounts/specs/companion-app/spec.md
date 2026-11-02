# Spec Delta

## ADDED Requirements

### Requirement: Account in the app
The app SHALL start with sign-in with Google when connected to a cloud hub, keep the session in the phone's secure storage, and offer an account screen with the user's name and email, their devices with last seen and revoke, a new clip token shown once, this month's spend against the cap, export, delete account and sign out.

#### Scenario: New phone
- **WHEN** the user installs the app on a new phone and signs in with the same Google account
- **THEN** their meetings, tasks, memory and chat are there, with no pairing code

#### Scenario: Laptop hub
- **WHEN** the app connects to a hub on the laptop with no accounts
- **THEN** it pairs with the code as before and shows no sign-in
