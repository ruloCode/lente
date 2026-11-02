# Tasks

Depends on: `add-cloud-hub`, `add-ask-lente`

## 1. Supabase project and schema

- [ ] 1.1 Verify on the live service and Supabase's docs, and record in `docs/kb/supabase.md`:
  - the Auth endpoints for ID-token sign-in, refresh, PKCE authorize and code exchange
  - the JWKS URL and the algorithm of the project's signing key
  - PostgREST headers for the secret key, and RPC calls
  - from the pricing page, the Free plan's limits: database size, Auth MAU, egress, backups, pausing after inactivity, active free projects per owner

  [key:SUPABASE_URL]
- [x] 1.2 Owner: free a Free-plan project slot (pause one of the organization's projects, or pick another organization) and say which; the agent never pauses or deletes another project [human]
  - 2026-11-01: the owner asked to pause `cotizacion-al-instante` (Kuadra, us-east-1); paused through the Supabase MCP at the owner's request
- [ ] 1.3 Create the project `lente` on the Free plan in `us-east-1` through the Supabase MCP, after showing the cost and getting the owner's yes; record the project ref (not any key) in `docs/kb/supabase.md` [human]
- [ ] 1.4 Owner: in Google Cloud, create the OAuth clients (Web, and Android with the SHA-1 of the debug and release keys). In Supabase, enable Google with the Web client ID first and add the hub's callback to the redirect allow list. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env` and the Modal secret [human]
- [x] 1.5 `scripts/new-kek.ts`: generates `LENTE_KEK` and writes it to `.env` without printing it, and tells the owner to keep an offline copy and to load the Modal secret with `deploy/modal/secret.ts`; test that the script's output never contains the key (`pnpm test`)
  - Written and tested on temporary files; not run on the real `.env`. The owner runs `node scripts/new-kek.ts` once, keeps the offline copy, then `node --env-file=.env deploy/modal/secret.ts` (which now also carries the Supabase, KEK and allow-list variables).
- [x] 1.6 `supabase/migrations/` with the schema in design.md, without `search_terms`: tables, constraints, indexes, RLS on with no policy for `anon` and `authenticated`. Add a schema test that lists every table and fails if one lacks RLS or has a permissive policy [key:SUPABASE_SECRET_KEY]
  - Written, not applied to Supabase. `test/schema.test.ts` checks the SQL statically; the migration was also applied to a scratch Postgres 17 (Docker) with a stub `auth.users`: 18 tables with RLS, 0 policies, 0 grants to `anon`/`authenticated`, both roles get "permission denied", a turn pointing at another user's meeting fails its foreign key, deleting a user cascades. The live check on the project is 1.7.
- [ ] 1.7 Apply the migrations through the Supabase MCP, run its security advisors and fix what they flag, and verify with the publishable key that every table returns no rows and no write succeeds [key:SUPABASE_SECRET_KEY]

## 2. Encryption

- [x] 2.1 `src/seal.ts`: DEK generation, wrap and unwrap under the KEK with its version, seal and open with AES-256-GCM and the row-bound AAD; tests for round trip, tampered bytes, wrong AAD, another user's key and an unknown KEK version (`pnpm test`)
- [x] 2.2 KEK canary: sealed at setup, checked at start; the hub refuses to start with a KEK that cannot open it; test both cases (`pnpm test`)
- [ ] 2.3 Log guard: a test that runs a stubbed meeting through the Supabase backend and asserts no turn, title or note text appears in the hub's stdout or in any plain column (`pnpm test`)
- [ ] 2.4 `scripts/rotate-kek.ts`: re-wraps every DEK under a new KEK version without touching content; verify on the project with two test accounts [key:SUPABASE_SECRET_KEY]

## 3. Identity in the hub

- [x] 3.1 `src/user-auth.ts`: verify access tokens with JWKS (signature by `kid`, `iss`, `aud`, `exp`), cache keys 10 minutes and refetch on an unknown `kid`; tests with keys generated in the test for valid, expired, wrong issuer, wrong audience, unknown `kid` and malformed tokens (`pnpm test`)
- [ ] 3.2 Web sign-in: `/auth/google` starts PKCE, `/auth/callback` exchanges the code, sets the `HttpOnly` session cookie and stores the sealed refresh token in `sessions`; `/auth/signout` revokes it; tests for a replayed or missing `state` (`pnpm test`)
- [x] 3.3 Access gate by user: every route and the `/device` upgrade resolve a user from a bearer token, the session cookie or a device token, or answer 401; laptop mode keeps the pairing code and one owner; extend the gate's tests (`pnpm test`)
- [x] 3.4 Devices: `POST /devices` (token shown once, hash stored), `GET /devices`, `POST /devices/revoke`, `last_seen_at` on connect; tests for a revoked token and another user's device (`pnpm test`)
- [x] 3.5 Sign-up allow list (`LENTE_ALLOWED_EMAILS`, the owner's email only until Meta billing is paid): a user outside it gets a clear refusal and no account row; test (`pnpm test`)

## 4. Stores on Supabase

- [x] 4.1 One interface per store (meetings, day log, facts, tasks, actions, traces, profile, language, usage, devices); the file stores implement it unchanged; `pnpm test` and `pnpm smoke` pass with no keys
- [x] 4.2 `src/supabase-rest.ts`: a `fetch` client for PostgREST and RPC with the secret key, retries on 5xx and 429, and errors that name the table and status; a query builder that requires `userId`, with a test that fails if any store method builds a query without it (`pnpm test`)
- [x] 4.3 Supabase stores for every interface, sealing on write and opening on read; tests against a fake PostgREST that checks only ciphertext arrives in content columns (`pnpm test`)
- [ ] 4.4 Atomic writes through RPC: a closed meeting with its turns and notes, and account creation with its wrapped DEK; verify on the project that a failure halfway leaves nothing behind [key:SUPABASE_SECRET_KEY]
- [x] 4.5 Database check in `/health` (ok, slow over 1 s, paused, unreachable; no content) and the phone's note when it fails; tests with a fake that times out and one that answers 503 (`pnpm test`)
- [ ] 4.6 `scripts/backup-db.ts`: nightly export of the sealed rows to the Modal volume, rotated after 7 days, never with the KEK; verify one export and one restore into a scratch schema [key:SUPABASE_SECRET_KEY]
- [ ] 4.7 `scripts/import-data.ts`: seals today's files into the owner's account and prints counts per table against the files; run it on a copy of synthetic data first, then on the volume [key:SUPABASE_SECRET_KEY] [human]

## 5. The whole memory

- [x] 5.1 Digests: profile, day, week and month writers on Muse Spark with structured output, each keeping the ids it came from, with the budgets in design.md; the profile is rewritten after a meeting closes; tests with a stubbed model for budgets, ids kept and kept facts winning (`pnpm test`)
  - Writers in `src/digests.ts`, stores in `src/stores.ts` (file) and `src/supabase-stores.ts` (sealed). Calling the profile writer when a meeting closes is wired with the per-user runtime (6.1), so the laptop hub makes no new model call until then.
- [x] 5.2 Nightly job per user at their local midnight, and catch-up on the next open; test the catch-up with a clock (`pnpm test`)
  - `src/nightly.ts`: the plan, the run and a timer per user. Starting it when a user's runtime opens is wired with 6.1.
- [x] 5.3 Ask in tiers. Steps:
  - the profile and digests as the cached prefix
  - a lookup-plan call that names meetings, days, a date range and terms
  - opening those records and ranking their turns in memory
  - the answer, with ids validated against everything shown

  Tests with a stubbed model: a question answered from a three-month-old meeting, one with nothing behind it, and a plan that names an id not shown (`pnpm test`)
  - `src/ask-tiers.ts`; the `/ask` route uses it for an account's runtime once 6.1 lands, and the laptop keeps the 7-day window of `add-ask-lente`.
- [ ] 5.4 Memoria shows the profile; a correction becomes a kept fact and the next profile reflects it; verify on the phone [phone]
- [ ] 5.5 Long-history eval on about 60 synthetic meetings over 3 months. The questions are tagged by where the answer sits: in a digest, in an old meeting's notes, only in raw turns, or nowhere. Record accuracy per tag, refusals and latency p50/p90 against the 7-day window of `add-ask-lente` in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 6. Many wearers on one hub

- [x] 6.1 `WearerRuntime`: move the live state out of `pilot.ts` (clip link, ASR session, meeting, idle pause, silence gate, SSE clients, usage meter, live view) into one runtime per user, created on first use and evicted after 30 minutes idle with its writes flushed and its DEK dropped; tests for two users whose events never cross (`pnpm test`)
  - Checked: `pnpm smoke` passes unchanged (14.5 s), the laptop and pairing hubs answer every probed route as before, and `test/wearers.test.ts` runs two signed-in users on one hub with streams that never cross.
- [x] 6.2 `LENTE_MAX_LISTENING`: past the cap, starting to listen answers busy with a clear message; test (`pnpm test`)
- [ ] 6.3 Spend cap per user: `usage_daily` and a monthly cap that pauses listening with a note on the phone. Set the default from the measured cost of one hour of listening. Record that figure and the database bytes per hour of listening in `docs/benchmarks.md`, and from the bytes, how many hours fit before the Free plan's 70 % mark
- [ ] 6.4 Capacity: simulated clips streaming test speech against the Modal hub; record how many listening users one container holds before the transcript lags, and set `LENTE_MAX_LISTENING` from it [key:MODAL_TOKEN_ID]
- [x] 6.5 Runtime on the sealed stores: in accounts mode a runtime opens its user's Supabase stores (`openUserStores`) instead of files, with every store call awaited; the profile is rewritten when a meeting closes (5.1), the nightly digests start with the runtime (5.2), and `/ask` uses the tiers (5.3). The laptop keeps its files and the 7-day window. Tests with a fake PostgREST served over HTTP (`pnpm test`); `pnpm smoke` unchanged

## 7. Android app

- [ ] 7.1 Sign in with Google: Credential Manager with the Web client ID and a hashed nonce, the ID token exchanged with Supabase Auth over OkHttp with the raw nonce, tokens kept in the Android Keystore and refreshed before they expire; pure parts tested on the JVM (`./gradlew :app:testDebugUnitTest`)
- [ ] 7.2 Bearer token on every hub call and on the `/device` WebSocket; a 401 refreshes once, then returns to sign-in; e2e with the stub hub (`pnpm android:e2e`)
- [ ] 7.3 Account screen in Ajustes: name and email, devices with last seen and revoke, a new clip token shown once, spend this month against the cap, export, delete account with confirmation, sign out
- [ ] 7.4 First run starts with sign-in before the introduction; the pairing code stays only for a laptop hub; verify on the phone against the Modal hub [phone]

## 8. Web page

- [ ] 8.1 Sign-in screen with the Google button for the hub page; the page works with the session cookie; verify in Chrome against the Modal hub [human]

## 9. Account rights and docs

- [ ] 9.1 `GET /account/export` streams the user's decrypted memory as JSON; `POST /account/delete` deletes the key first, then the rows, the Auth user and the devices; tests with the fake PostgREST for the order and for another user untouched (`pnpm test`)
- [ ] 9.2 Verify on the project: after deletion, the user's rows are gone, a dump of what remains holds nothing of theirs, and a copy of their sealed rows cannot be opened without the deleted key [key:SUPABASE_SECRET_KEY]
- [ ] 9.3 Privacy note in the app and the README. It covers:
  - what is encrypted and what stays plain
  - which models see the content, and that the hackathon's Meta credit carries only the owner's data
  - the backup windows after deletion (Supabase's, and the 7-day sealed export)
  - the wearer's duty to tell the people around them
- [ ] 9.4 `docs/kb/decisions.md`: Supabase Free for sign-in and Postgres next to Modal and the model credits, Supabase reached with `fetch`, envelope encryption outside the database, memory in tiers plus lookups instead of RAG (and no blind index until measured), the Android sign-in dependencies; README row for the days this lands

## 10. Blind index (only if the eval calls for it)

- [ ] 10.1 From 5.5's results, decide whether version 1 misses answers that sit only in raw turns; write the numbers and the yes or no in `docs/kb/decisions.md`. Tasks 10.2 to 10.4 run only after a yes; on a no, mark them `- [x]` with "not needed (10.1)"
- [ ] 10.2 `src/blind-index.ts`: term normalization (case, accents, stopwords, light Spanish and English suffix fold), HKDF index key, truncated HMAC; tests that the same term matches across inflections, that two users' hashes differ, and that no plaintext leaves the module (`pnpm test`)
- [ ] 10.3 Migration for `search_terms` with RLS, writes from every sealed text, a backfill script for existing rows, and the lookup step using it next to the tiers; tests against the fake PostgREST (`pnpm test`) [key:SUPABASE_SECRET_KEY]
- [ ] 10.4 Re-run 5.5 and record the change in accuracy and latency in `docs/benchmarks.md`; add the term-frequency leak to the privacy note [key:MODEL_API_KEY]
