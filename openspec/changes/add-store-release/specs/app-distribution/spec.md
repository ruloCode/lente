# Spec Delta

## ADDED Requirements

### Requirement: Signed store builds
Store builds of the Android app SHALL be signed with the owner's upload key by CI and re-signed by Play App Signing, and Sign in with Google SHALL work in a build installed from Play.

#### Scenario: Install from Play
- **WHEN** a tester installs the app from the internal testing track and taps «Continuar con Google»
- **THEN** sign-in completes and the app reaches Ahora

### Requirement: Account deletion on the web
The hub SHALL offer a web page where a signed-in user deletes their account, with the same effect as deleting it from the app.

#### Scenario: Delete without the app
- **WHEN** a user who uninstalled the app opens `/cuenta/borrar`, signs in and confirms
- **THEN** their account, data key, rows and devices are deleted as in the app
