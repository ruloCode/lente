# Tasks

## 1. Policy and acceptance

- [ ] 1.1 Draft `docs/legal/terminos.md`, `docs/legal/privacidad.md` and their English versions from `docs/architecture.md` §5 and `add-accounts` 9.3: what is captured, where it is kept and sealed, which model providers see it, retention, export, deletion, backups rolling over after 7 days, and the room's consent
- [ ] 1.2 Legal review of both documents; the owner records who reviewed and when in `docs/kb/decisions.md` [human]
- [ ] 1.3 `/terminos` and `/privacidad` served by the hub with their version; test that both render and carry the version (`pnpm test`)
- [ ] 1.4 Migration: `accounts.terms_version`, `terms_accepted_at`, `retention_days`; acceptance route; a new version asks again before listening; tests with the fake PostgREST (`pnpm test`), applied on the project with advisors clean [key:SUPABASE_SECRET_KEY]
- [ ] 1.5 Acceptance screen on Android and on the web app before the introduction; e2e with the stub hub (`pnpm android:e2e`)

## 2. The room

- [ ] 2.1 Onboarding step on recording consent, and «Avisar a la sala» on Ahora (show, or speak through the phone with the self-voice guard on); e2e (`pnpm android:e2e`)
- [ ] 2.2 Recording light: steady at `RECORDING_LED_DUTY` while transcribing, dark when paused, cues still blink; flash and check by eye that a cue and the recording light are told apart [hw]
- [ ] 2.3 Battery: one hour of listening with and without the light on a full 1S LiPo; record both in `docs/benchmarks.md` [hw]

## 3. Retention

- [ ] 3.1 Pure retention plan (which turns and day entries go, which citations become «turno ya borrado») with fake-clock tests (`pnpm test`)
- [ ] 3.2 Nightly retention job per user next to the digests, and the choice in Ajustes; verify on the project with a test account [key:SUPABASE_SECRET_KEY]

## 4. Opening sign-up

- [ ] 4.1 `canAdmit` as a pure function with tests for each missing condition; the sign-up path uses it (`pnpm test`)
- [ ] 4.2 The owner turns on paid billing (card, spend limit) for Meta and any other model provider in use, checks the terms on each Billing page, and only then sets `LENTE_PAID_MODELS=1` in the Modal secret [human]
- [ ] 4.3 README privacy note and `docs/architecture.md` §5 updated; `docs/kb/decisions.md` entry for the gate
