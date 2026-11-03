# Proposal

Depends on: `add-accounts`

## Why

Lente listens to people who are not its users. With one owner on a laptop that is the owner's own responsibility. With accounts for other people it becomes the product's: they need terms and a privacy policy they accepted, the people around them need a signal they can see, and their content cannot go to a model provider whose free-credit terms allow using it for product improvement (`docs/kb/hackathon.md`, Meta Model API row). Today the sign-up allow list (`add-accounts` 3.5) holds only the owner, for exactly that reason. This change is what must be true before it opens to anyone else.

## What Changes

- **Terms and privacy policy.** Served by the hub at `/terminos` and `/privacidad` in Spanish and English, versioned (`LENTE_TERMS_VERSION`), written from `docs/architecture.md` §5 and the privacy note of `add-accounts` 9.3, and reviewed by a lawyer before they are published.
- **Acceptance on sign-up.** The first sign-in shows both documents and records the accepted version and time per account. A new version asks again before Lente listens.
- **Telling the room.** Before the first meeting, onboarding explains that some places require everyone's consent to record. «Avisar a la sala» on Ahora shows or speaks one sentence («Uso Lente: transcribe esta conversación para mí. ¿Les parece bien?») and pausing stays one tap away.
- **A recording light on the clip.** While audio is going to transcription, the clip shows a steady, dim light that anyone nearby can see. Paused, it is dark. The battery cost is measured, not guessed.
- **Retention.** The wearer chooses how long raw turns are kept (Siempre, 1 año, 90 días). Notes, facts and digests stay. Older turns are deleted nightly.
- **Opening sign-up is gated.** The hub refuses to admit accounts beyond the allow list unless three things hold: a terms version is set, the policy pages are published, and the owner has confirmed that paid billing is on for every model provider in use (`LENTE_PAID_MODELS=1`, set only after the owner checks it in each Billing page).

Out of scope: per-jurisdiction geofencing or legal claims beyond the published policy, consent recorded from the other people in the room, payments.

Meta models: none new.

Privacy: this change is the privacy work. No content is added anywhere; acceptance stores a version and a time.

## Capabilities

### New Capabilities
- `consent`: terms and policy, acceptance, the room notice, retention and the sign-up gate.

### Modified Capabilities
- `clip-device`: the recording light (added requirement).

## Impact

- Hub: `/terminos`, `/privacidad`, acceptance routes, the gate in the sign-up path, the nightly retention job. Migration: `accounts.terms_version`, `accounts.terms_accepted_at`, `accounts.retention_days`.
- Android and web: acceptance screen, «Avisar a la sala», retention in Ajustes.
- Firmware: LED pattern while transcribing (`firmware/lente-clip/`).
- Docs: the policy texts, `docs/architecture.md` §5, README privacy note.
