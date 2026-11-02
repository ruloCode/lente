# Proposal

Depends on: `add-cloud-hub`, `add-ask-lente`

## Why

Lente works for one person today: the hub keeps one wearer's state in memory and their memory as JSON files on one volume, and a phone gets in with a pairing code. To reach many people, each person needs an account they can open with Google, their own memory kept apart from everyone else's and encrypted so that a copy of the database alone reveals nothing, and a Lente that answers from everything it has learned about them, not only from the last week.

## What Changes

- **Accounts with Google.** People sign in with Google on the Android app (Credential Manager, a Google ID token exchanged with Supabase Auth) and on the web page (Supabase OAuth with PKCE). The hub verifies Supabase's access tokens against the project's public keys (JWKS) and acts as that user. A signed-in user binds their clip to their account; the phone pairing code stays for the laptop hub only.
- **A structured database per user on Supabase Postgres.** Meetings, turns, notes, the day record, facts, tasks, agent actions, chat, digests, usage and an audit trail move from files to tables keyed by `user_id`, with constraints, indexes and Row Level Security turned on everywhere. The schema lives in `supabase/migrations/`.
- **Encrypted content, one key per user.** Everything a person said, heard, saw or wrote is encrypted in the hub with AES-256-GCM under a data key that belongs to that user, before it reaches the database. Each user's key is stored wrapped by a key-encryption key that never enters the database (a Modal secret). Deleting an account deletes its key, so any copy left behind cannot be read.
- **Lente answers from everything it knows.** A tiered memory replaces the 60,000-character window: a profile of the user, daily, weekly and monthly digests, meeting notes, and the raw turns. Each question gets the profile and the digests up front, then a lookup step opens the meetings and days those digests point to and ranks their turns in the hub's memory; a keyed blind index over the encrypted text comes later only if the long-history eval shows answers missed without it. Every answer still cites where it comes from and still says when nothing backs it.
- **One hub, many wearers.** The hub's live state (clip link, transcription session, meeting in progress, idle pause, event stream, spend) moves into one runtime per user.
- **Where it runs and what it costs.** No hackathon credit covers a database or sign-in, so Supabase runs on its Free plan (USD 0) in `us-east-1` next to the Modal hub; Modal pays for the hub, Meta and Baseten for the models. The Free plan's limits, its pause after inactivity and the point to move to Pro are written down and checked by health.
- **Limits and rights.** A monthly spend cap per user, data export, and account deletion.

Out of scope: iOS, sign-in with Apple, teams or shared meetings, end-to-end encryption that keeps keys only on the phone (it would stop the cloud hub from listening and answering), payments, horizontal scaling past one container.

Meta models: Muse Spark 1.3 writes the profile and the digests and plans the lookups; the answer stays Muse Spark 1.3 with structured output and validated citations, as in `add-ask-lente`.

Privacy: content is encrypted at rest under per-user keys and decrypted only in the hub's memory for the request that needs it; clients never read the database; no content in logs, traces or audit events; deleting an account removes its rows and its key.

## Capabilities

### New Capabilities
- `user-accounts`: signing in with Google, sessions, devices bound to a user, spend limits, export and deletion.
- `encrypted-memory`: the per-user database, its encryption, isolation and key handling.
- `whole-memory`: answering from the user's entire history through a profile, digests and lookups.

### Modified Capabilities
- `companion-app`: signing in with Google and the account screen.

## Impact

- New: `supabase/migrations/*.sql`, `docs/kb/supabase.md` (the verified Auth and REST surface), hub modules for token verification, encryption, the Supabase stores, digests and the per-user runtime, an import script for today's files.
- Changed: `src/pilot.ts` (per-user runtime, auth on every route), `src/ask.ts` (tiers and lookups), the Android app (sign-in, account screen, bearer token on every call).
- No new runtime dependency in the hub: Supabase Auth and PostgREST are called with `fetch`, JWT checks and AES-GCM use `node:crypto`. The APK gains AndroidX Credential Manager and Google Identity (`googleid`).
- Keys: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LENTE_KEK` in `.env` and the Modal secret; Google OAuth client IDs (web and Android) in Supabase and the app's build config.
- The laptop hub without Supabase keys keeps today's file stores, so `pnpm smoke` and the tests still run with no keys.
