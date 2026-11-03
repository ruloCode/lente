# Proposal

Depends on: `add-accounts`, `add-consent`

## Why

The Android app's release build is signed with the debug key and sideloaded (`android/app/build.gradle.kts`). Nobody outside the bench can install or update it. To reach other people it has to go through Google Play. Play has its own requirements: a real signing key, a privacy policy URL, the data safety form, a web page to delete an account, and declared reasons for the microphone, camera and foreground service. Its testing tracks also have rules for new personal developer accounts. Sign-in with Google also depends on signing: the Android OAuth client must know the SHA-1 of the key Play signs with, or sign-in breaks in the store build only.

## What Changes

- **Release signing.** An upload key held by the owner, Play App Signing for the app key, and a CI job that builds a signed bundle (`.aab`) with `versionCode` from the run number.
- **The OAuth client knows every key.** The SHA-1 of the debug, upload and Play app-signing keys is registered on the Android OAuth client. `add-accounts` 1.4 named only debug and release.
- **The store listing.** Name, description in Spanish and English, screenshots from the real app, the privacy policy URL from `add-consent`, the data safety answers written from `docs/architecture.md` §5, the content rating, and declarations for microphone, camera, Bluetooth (from `add-clip-setup`) and the foreground service types.
- **Account deletion from the web.** A page at `/cuenta/borrar` where a signed-in user can delete their account (the same deletion as `add-accounts` 9.1), as Play requires.
- **Testing tracks before production.** Internal testing first, then closed testing with the number of testers and days Play requires for the account type. That requirement is checked in the Console (task 1.1), not assumed.

Out of scope: iOS and the App Store, paid features, other Android stores.

Meta models: none.

Privacy: the data safety form and the policy say the same thing, and both come from `docs/architecture.md` §5.

## Capabilities

### New Capabilities
- `app-distribution`: signing, the listing, web account deletion and the testing tracks.

## Impact

- `android/app/build.gradle.kts` (release signing from CI secrets), `.github/workflows/android-release.yml`, the `/cuenta/borrar` page on the hub, `docs/kb/play-store.md` (what was verified in the Console and when).
