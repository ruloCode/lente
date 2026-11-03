# Tasks

## 1. Account and signing

- [ ] 1.1 Owner: Play Console developer account; record its type and the testing-track requirements it shows (testers, days) in `docs/kb/play-store.md` [human]
- [ ] 1.2 Owner: create the upload key, keep it offline, put it in GitHub secrets; enrol in Play App Signing [human]
- [ ] 1.3 Release signing from CI secrets in `android/app/build.gradle.kts` (debug signing stays for local builds); `.github/workflows/android-release.yml` builds a signed `.aab` with `versionCode` from the run number
- [ ] 1.4 Owner: register the SHA-1 of the upload and Play app-signing keys on the Android OAuth client next to the debug key's [human]

## 2. Listing and policy

- [ ] 2.1 `/cuenta/borrar` on the hub: sign in, confirm, delete through the same path as `add-accounts` 9.1; tests (`pnpm test`)
- [ ] 2.2 Draft the listing (Spanish and English), the data safety answers from `docs/architecture.md` §5 and the permission declarations in `docs/kb/play-store.md`
- [ ] 2.3 Screenshots from the real app on the phone with synthetic meetings, light and dark [phone]
- [ ] 2.4 Owner: fill the listing, the data safety form, the content rating and the declarations in the Console [human]

## 3. Tracks

- [ ] 3.1 First internal testing release from CI; install from Play on the bench phone and sign in with Google [phone]
- [ ] 3.2 Closed testing with the testers and days from 1.1; record crashes and sign-in failures from the Console in `docs/kb/play-store.md` [human]
- [ ] 3.3 Production release once `add-consent` 4.2 and `add-production-ops` 3.2 are done [human]
