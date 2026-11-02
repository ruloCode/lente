# Design

## Context

- **Hub today.** `src/pilot.ts` is one process with one wearer. Its stores are files in `DATA_DIR` (`meetings/`, `days/`, `facts.json`, `actions.json`, `tasks.json`, `traces/`, `language.json`, `profile.json`, `usage.json`, `devices.json`). Live state (clip socket, ASR session, meeting in progress, idle pause, SSE clients) lives in module-level variables. In cloud mode a phone gets in with a 10-minute pairing code and a session cookie; a clip with a device token (`src/device-auth.ts`, `src/access-gate.ts`).
- **Ask today.** `src/ask.ts` builds a numbered memory of at most 60,000 characters (kept facts, the last 7 days outside meetings, meetings newest first) and validates the cited ids. Anything older than the window is invisible.
- **Supabase (checked 2026-11-01, to be recorded in `docs/kb/supabase.md` by task 1.1).**
  - Android: create both a Web and an Android OAuth client in Google Cloud; the app passes the **Web** client ID to Credential Manager; Google gets the SHA-256 of a random nonce and Supabase gets the raw nonce; Supabase validates the nonce by default.
  - Web: OAuth with PKCE, with the hub's callback URL on the redirect allow list.
  - User tokens are signed with an asymmetric key (ES256 recommended); public keys are at `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, chosen by `kid`, cached about 10 minutes at the edge. The legacy HS256 secret is no longer recommended.
  - Publishable and secret API keys go in the `apikey` header; a user JWT goes in `Authorization: Bearer`.
  - pgsodium is pending deprecation and Supabase does not recommend its column encryption; Vault keeps its interface but uses the project's root key, and Supabase warns that keys in the same database as the data are unsafe.
- **What the hackathon credits cover (`docs/kb/hackathon.md`, checked 2026-11-01).** None of them hosts a database or sign-in:

  | Platform | Credit | Lente uses it for |
  |---|---|---|
  | Meta Model API | USD 150 | Muse Spark and transcription |
  | Baseten | USD 100 | Muse Spark Open, the fast reply lane |
  | Modal | USD 100 (not confirmed) plus USD 30 a month on Starter | The always-on hub container and its volume |
  | Fireworks | USD 100, no key | Nothing yet |

  Modal has volumes, not a managed database. The author's Supabase organization (Kuadra) has three projects, none for Lente: two active (`cotizacion-al-instante` in us-east-1 and `mgcompany` in us-west-2) and one paused.
- **Rules that shape this.** Zero runtime dependencies in the hub unless one earns its place; no content in the repo or logs; every number measured; "basic RAG" is on the hackathon's list of generic projects (decision 2026-10-28, "Memory as files and long context, not RAG").

## Goals / Non-Goals

**Goals:**
- Sign in with Google on Android and the web; the hub knows the user on every request and socket.
- One structured Postgres schema for everything Lente remembers, keyed by user, with RLS on.
- Content encrypted per user before it leaves the hub; a database dump, a leaked publishable key or a Supabase operator sees only ciphertext and metadata.
- Lente answers from the whole history with citations, at a measured latency.
- Many wearers on one hub, each with a spend cap.
- The laptop hub keeps working with files and no keys.

**Non-Goals:**
- End-to-end encryption with keys only on the phone (the cloud hub must transcribe and answer while the phone sleeps).
- Embeddings or a vector store.
- More than one hub container.
- iOS, Apple sign-in, teams, payments.

## Decisions

### 0. Where each piece runs and what it costs

**The split.**

| Piece | Where | Paid by |
|---|---|---|
| Hub (one container) | Modal, `us-east` | Modal credit, then Starter |
| Models | Meta Model API, Baseten | Their hackathon credits |
| Sign-in and Postgres | Supabase, a new project `lente` in `us-east-1` (same region as the hub) | **Free plan**, USD 0 |

**Why Supabase Free.** No hackathon credit covers a database or sign-in, and for a closed test the Free plan is enough. Its limits are read from Supabase's pricing page in task 1.1 and recorded in `docs/kb/supabase.md`: database size, Auth monthly active users, egress, backups, pausing after inactivity, and how many free projects can be active. Content is stored as sealed text, never audio or photos, so it is small.

**Free-plan constraints and what we do about them.**
- **The free project limit.** The organization already has two active projects. Creating `lente` may require pausing one of them or a separate organization. The owner decides; the agent never pauses another project.
- **Pausing after inactivity.** The hub's daily writes keep the project active. Health checks the database (decision 13), so a paused project shows as failing rather than as missing data. Before the judging window (2026-11-05 to 11-08), confirm the project is active.
- **Backups.** Free has no point-in-time recovery. Until Pro, `scripts/backup-db.ts` exports the sealed rows to the Modal volume nightly; they stay sealed, and the KEK is not on the volume.

**When to move to Pro (USD 25 a month).** The first of these:
- the database passes 70 % of the Free size
- the first users outside the allow list sign up
- point-in-time recovery becomes necessary

The measured size per hour of listening (task 6.3) says when the first will happen.

**Meta's free credit and other people's data.** Content sent on the hackathon credit "may be used for product improvement". The credit carries only the owner's own meetings and synthetic eval data. Outside testers wait for a paid Meta billing account (`LENTE_ALLOWED_EMAILS` stays the owner's until then).

**Rejected.**
- Users' data as sealed files on the Modal volume, with Google tokens verified against Google's JWKS. It costs USD 0 and adds no vendor, but it gives no queries, constraints or managed backups, which the structured schema is for.
- Neon or another managed Postgres with our own Google sign-in. It works too, but we would write and run the sessions, refresh tokens and future Apple sign-in ourselves.

### 1. Supabase for identity and Postgres, reached with `fetch`

**Choice.** Supabase Auth issues the sessions. The hub talks to it and to PostgREST over HTTPS:
- Auth endpoints: ID-token sign-in, refresh, the PKCE code exchange and the authorize redirect. Each one is verified against the live service before use and written down in `docs/kb/supabase.md`.
- PostgREST under `/rest/v1/` for the tables.
- RPC functions for the writes that must be atomic (a meeting with its turns, an account with its key).

**Why.** No Postgres driver and no `supabase-js` in the hub.

**Rejected.**
- The `pg` driver: a runtime dependency, and a long-lived database connection from Modal.
- A self-hosted Postgres on the Modal volume: backups and auth would all be ours to run.

### 2. Clients never touch the database

**Choice.** The app and the page only talk to the hub. The hub uses the secret key, which bypasses RLS.

**Defense in depth.**
- RLS is enabled on every table, with no policy for `anon` or `authenticated`. A leaked publishable key, or a user JWT sent straight to PostgREST, reads nothing.
- Every query goes through one repository module that takes the `userId` as a required argument and puts it in the filter. A test fails if any query is built without it.

**Why.** The content is ciphertext only the hub can open. Letting clients query directly would hand them rows they cannot use, and widen the surface.

### 3. Verify user tokens in the hub with JWKS

**Checks.** The hub validates every access token:
- the ES256 (or RS256) signature, with the key fetched from JWKS by `kid` (cached 10 minutes, fetched again on an unknown `kid` at most once every 30 s, so forged tokens with made-up `kid`s cannot make the hub hammer Supabase)
- `iss = https://<ref>.supabase.co/auth/v1`
- `aud = authenticated`
- `exp`

**Result.** `sub` becomes the `userId`. This is pure apart from the JWKS fetch, and tested with keys generated in the test.

**Where the token goes.**
- The app sends it as `Authorization: Bearer` on HTTP and on the `/device` WebSocket.
- The web page keeps it in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie the hub sets after the PKCE exchange. The hub refreshes it with the refresh token, which is kept encrypted in the hub's session table.

### 4. Devices belong to users

**Choice.** A signed-in user creates a clip token from the app (`POST /devices`). The token is shown once and stored as a SHA-256 hash with the `user_id`. The clip still gets it at flash time, as today (`cloud.h`).

**Using and revoking.**
- The `/device` upgrade resolves the token to its user.
- The account screen lists the user's devices with when each was last seen, and revokes them.

**Phone as clip.** The phone acting as a clip uses the user's session, not a device token.

### 5. Envelope encryption with one data key per user

**Keys.**
- At account creation the hub makes a random 32-byte data key (DEK).
- It stores the DEK in `user_keys` wrapped with AES-256-GCM under the key-encryption key (`LENTE_KEK`, 32 bytes, base64), tagged with `kek_version`.
- The KEK lives only in `.env` and the Modal secret, never in the database or in Vault.

**Each encrypted value.**
- AES-256-GCM with a fresh 12-byte random nonce.
- Additional authenticated data `lente/v1/<table>/<column>/<user_id>/<row_id>`, so a ciphertext copied to another row, column or user fails to open.
- Stored as `bytea` laid out as `version (1) | nonce (12) | ciphertext | tag (16)`.

**Pure module.** `src/seal.ts` is pure and tested for:
- round trip
- tampering
- a wrong AAD
- the wrong user's key
- a wrong KEK version

**Canary.** At setup the hub seals a fixed value under the KEK into `kek_canaries` (one row per KEK version, no `user_id`). At start it opens the canary of every KEK version it loaded; one that does not open stops the hub before it serves anything, so a wrong `LENTE_KEK` in the secret store is caught at start rather than as unreadable rows. The canary lives in the database, next to the wrapped DEKs it vouches for, not next to the KEK. The env carries the current KEK (`LENTE_KEK`, `LENTE_KEK_VERSION`, default 1) and, during a rotation, the previous one (`LENTE_KEK_PREVIOUS`, version one lower).

**Caching.** Unwrapped DEKs are cached in the hub's memory per active user and dropped when that user's runtime is evicted.

**Rejected.**
- pgsodium column encryption: pending deprecation, and not recommended by Supabase.
- Vault for user data: its root key sits with the data.
- Relying only on Supabase's disk encryption: it does not stop someone who can query the database.

### 6. What is encrypted and what stays plain

**Encrypted.** Every value that carries content:
- turn text and speaker names
- meeting titles and notes
- day entries (heard, seen, cues)
- facts, tasks, drafted emails and agent payloads
- chat messages
- digests and the profile
- the glossary and language profile
- display names
- agent traces
- refresh tokens

**How a record maps.** Where a record has more content fields than its table has `_enc` columns, the content column holds the sealed JSON of all of them (a fact's text and source meeting, a task's title, due hint and evidence, an action's payload); the plain columns are only what the hub filters, sorts or cascades on.

**Plain.** What the hub must filter or sort on, or show without content:
- ids and `user_id`
- timestamps and durations
- kinds and statuses
- counts (asked or answered)
- model names
- usage numbers

**Photos.** Never stored, as today. Only their descriptions are kept, encrypted.

**Leak.** The plain columns tell how much a user speaks and when. That is stated in the README.

### 7. Finding the past without searching ciphertext (version 1); a blind index only if measured misses call for it

Postgres cannot search what it cannot read, so version 1 does not search words in the database.

**Version 1 finds the past through the tiers.**
- Every digest and every meeting's notes keep the ids of the meetings and days they came from (decision 8).
- The lookup plan picks those ids and date ranges.
- The hub opens only those meetings and days: plain columns locate them (`user_id`, `started_at`, `at`), the content is decrypted in memory, and the hub ranks the turns against the question there.
- The database never receives the words of a question.

**The trigger for a blind index.** It comes only if the long-history eval (task 5.5) misses questions whose answer sits only in raw turns, because no digest pointed at the right meeting. If it ships (group 10):
- **Writing.** For each sealed text the hub writes one row per distinct term into `search_terms`. The term is lowercased, accent-folded, stopwords dropped, with a light Spanish and English suffix fold. The row carries `HMAC-SHA256(index_key, term)`, truncated to 16 bytes, with the reference and the time. `index_key` is derived from the user's DEK with HKDF (`info = "lente/search/v1"`).
- **Reading.** A query's terms are hashed the same way. Postgres returns the references that match the most terms, newest first. The hub decrypts only those rows.
- **Leak.** Repeated terms show as repeated hashes within one user, never across users. Stated in the README.

**Rejected.**
- Decrypting a user's whole history for each question: it does not scale past a few months.
- Embeddings: they leak meaning, need a model Lente does not use, and land on the "basic RAG" list.
- The blind index in version 1: it is the most intricate piece of this change and would arrive before any measurement shows it is needed.

### 8. The whole memory in tiers

The decision "Memory as files and long context, not RAG" becomes "long context in tiers plus lookups". It is still not vector RAG.

**The tiers.**

| Tier | What | Written by | When | Budget |
|---|---|---|---|---|
| Profile | Who the user is, people and projects, preferences, standing commitments, the facts they kept | Muse Spark from the last profile and the new notes | After each meeting closes, and at the nightly digest | ≤ 4,000 chars |
| Day digest | What happened that day, with ids | Muse Spark from the day's notes and entries | Nightly, or on the next open | ≤ 1,500 chars |
| Week and month digests | Built from the day digests | Muse Spark | Monday; the 1st | ≤ 2,000 chars each |
| Meeting notes | As today | Extraction | Meeting end | — |
| Raw | Turns and day entries | — | — | Lookup only |

**Answering one question.**
1. **Context.** The profile, the last 14 day digests, the last 8 week digests, all month digests and the newest meeting notes, within the 60,000-character budget. This prefix only grows at the end, so it caches well.
2. **Lookup plan.** One structured-output call returns `{needs_lookup, meetings[≤5], days[≤7], from?, to?, terms[≤8]}`. The meetings and days are chosen from the ids in the context.
3. **Lookup.** The hub opens those meetings and days (decision 7), ranks their turns against `terms` in memory, and shows the best ones, each with an id as today.
4. **Answer.** The same schema as `add-ask-lente`. Cited ids are validated against everything shown in steps 1 and 3. No backing means `NOT_FOUND`.

**When digests are written.** One plan (`src/nightly.ts`) serves the nightly run at the user's local midnight (from `accounts.time_zone`) and the catch-up when their runtime opens: every past day with data and no digest, then every finished week and month with day digests and none of its own, oldest first. Weeks and months are both built from day digests, so a month needs no week boundaries. A catch-up reaches back at most 31 days, so a long absence cannot spend without bound, and it stops at the first failed call so the next open resumes there.

**Ids and chips.** Context lines use the records' own ids (`m…` meetings, `day:…`/`week:…`/`month:…`/`profile:…` digests, `F1` kept facts); looked-up lines use `m…:t5` for a meeting turn and `d2026-11-01:3` for a moment of a day. A digest cited in an answer becomes a chip labelled «Resumen · <period>» (kind `fact`); a turn opens its meeting at the turn as today. The plan may name only meetings and days that appear in the context, its range is cut to 92 days, and the loaders receive ids and dates, never the question's terms (`src/ask-tiers.ts`).

**Why two calls.** Two structured calls instead of open tool calling, because Muse Spark function calling is not verified yet (`add-closing-agent` 1.1). If it is verified, step 2 can become a tool loop of at most 3 rounds behind the same contract.

**Edits.** The user can read and correct the profile in Memoria. A correction is stored as a kept fact and wins over the generated text.

### 9. One runtime per user

**What moves.** Everything that is module state in `pilot.ts` today moves into a `WearerRuntime`:
- the clip link and the ASR session
- the meeting in progress
- idle pause and the silence gate
- the SSE clients
- the usage meter
- the live view

**Lifecycle.**
- A runtime is created on that user's first authenticated request or socket.
- It is evicted after 30 minutes with no connection and nothing listening. Eviction flushes its writes and forgets the user's DEK.

**Routing.**
- HTTP routes and sockets look up the runtime by `userId`.
- In laptop mode there is one runtime for the owner.

**How it is built.** `createWearerRuntime(userId, dataDir)` in `src/pilot.ts` holds what was module state; its repeating jobs are registered so eviction can clear them. `src/wearer-registry.ts` creates runtimes on first use, evicts them after 30 minutes with no phone following, no device, nothing listening and no meeting open, closes them (stop transcription, flush usage and recorded time, end the streams) and then drops the user's data key. The laptop's and a pairing hub's single owner (`local-owner`) is created at start, kept in `DATA_DIR` as before, and pinned. Until task 6.5 moves an account's runtime onto the sealed Supabase stores, it keeps its files under `DATA_DIR/users/<uuid>/`; accounts mode runs nowhere without keys, so nothing is stored that way in practice.

**Limits.**
- The container stays at one (`max_containers=1`).
- A configurable cap on users listening at once (`LENTE_MAX_LISTENING`) answers "busy" past it.
- Measuring how many listening users one container holds is task 6.4.

### 10. Two storage backends behind one interface

**The interface.** The stores the hub uses (meetings, day log, facts, tasks, actions, traces, profile, language, usage, devices) get one interface each.

**The backends.**
- **Files, today's code:** used when the Supabase keys are absent. The laptop, the smoke test and the unit tests keep running with no keys.
- **Supabase:** used when the keys are present. It needs `LENTE_KEK`, and refuses to start without it.

**Sync and async.** The interfaces live in `src/stores.ts`. Methods that may reach the database return `T | Promise<T>`: the file stores answer synchronously and satisfy them unchanged, the Supabase stores return promises, and callers `await` either. What the live loop reads on every frame (today's day entries, the profile, the glossary) is a plain in-memory value; the Supabase store loads it when the user's runtime starts and writes it behind, flushed on eviction (decision 9).

**Testing the Supabase backend.** It is tested against a fake PostgREST in `test/`. It is checked once against a real project.

### 11. Spend cap per user

Usage moves to `usage_daily` per user, model and provider, priced from the list prices in `docs/kb/meta-api.md`.

**At the cap.** A user at their monthly cap (`LENTE_USER_MONTHLY_CENTS`, default set in task 6.3 from measured cost per hour) gets:
- listening paused
- a note on the phone
- answers still served from digests already written

### 12. Export and deletion

**Export.** `GET /account/export` streams the user's decrypted memory as JSON.

**Deletion.** `POST /account/delete`, after the user confirms:
1. deletes the `user_keys` row first, then the account's rows (cascade), then the Supabase Auth user
2. revokes the user's devices

**Backups.** A backup taken earlier still holds the wrapped DEK, and so does the nightly export on the volume (decision 0). It can be opened only together with the KEK, until the backup expires. The README states both windows: Supabase's retention for the plan, and the export's own rotation, 7 days.

### 13. The database in health

`/health` gains a database check: one `select` on `accounts` with the secret key, timed. It reports ok, slow (over 1 s), paused or unreachable, never content. The phone shows a note when it fails, as it does for the model key.

The check (`src/db-health.ts`) has no retries, times out after 5 s, and its result is reused for 15 s so health checks do not hammer the project; the hub also runs it every minute, logs when it starts failing, and sends the state to the phone as `databaseDown`. A rejected secret key reports `refused`, a fifth state, so a wrong key is not mistaken for an outage. A paused project is taken to answer 540 or 503; task 1.1 confirms the live answer.

## Schema

All tables are in `public`, have RLS enabled with no policy for `anon` or `authenticated`, and carry `user_id uuid not null references auth.users(id) on delete cascade` unless noted. `*_enc` columns are `bytea` sealed per decision 5.

| Table | Key columns | Notes |
|---|---|---|
| `accounts` | `user_id` PK, `display_name_enc`, `locale` (default `es-CO`), `time_zone`, `assist_mode` (`assist`/`record`), `monthly_cap_cents`, `created_at`, `deleted_at` | One per user |
| `kek_canaries` | `kek_version int` PK, `sealed bytea`, `created_at` | No `user_id`; a fixed value sealed under each KEK version (decision 5) |
| `user_keys` | `user_id` PK, `kek_version int`, `wrapped_dek bytea`, `created_at`, `rotated_at` | Deleted first on account deletion |
| `sessions` | `id` PK, `user_id`, `token_hash bytea unique`, `refresh_enc`, `created_at`, `last_used_at`, `revoked_at` | Web sessions behind the hub cookie; the cookie is a random token found by its SHA-256, never stored |
| `devices` | `id uuid` PK, `user_id`, `kind` (`clip`/`desktop`/`mcp`), `label`, `token_hash bytea unique`, `created_at`, `last_seen_at`, `revoked_at` | Index `(user_id)` |
| `meetings` | `id uuid` PK, `user_id`, `started_at`, `ended_at`, `status` (`running`/`extracting`/`done`/`too-short`/`failed`, as the hub names them), `end_reason`, `auto bool`, `topic`, `title_enc`, `title_generated bool`, `asked int`, `answered int`, `dropped_items int`, `error_enc`, `legacy_id text not null` (the `m…` id the hub and phone use) | Index `(user_id, started_at desc)`; unique `(user_id, legacy_id)` |
| `meeting_turns` | PK `(meeting_id, seq)`, `user_id`, `at`, `start_at`, `addressed bool`, `speaker_enc`, `wearer bool`, `text_enc` | `meeting_id` cascades; index `(user_id, at)` |
| `meeting_notes` | `meeting_id` PK, `user_id`, `body_enc` (summary, decisions, commitments, open questions as sealed JSON), `model`, `created_at` | |
| `day_entries` | `id uuid` PK (chosen by the hub so the sealed body is bound to its row before the insert), `user_id`, `at`, `kind` (`turn`/`live`/`cue`/`summary`/…), `label`, `meeting_id null`, `body_enc` | Index `(user_id, at)` |
| `facts` | `id uuid` PK, `user_id`, `status` (`proposed`/`kept`), `text_enc`, `meeting_id null on delete set null`, `evidence text[]` (turn ids such as `t3`), `created_at`, `decided_at` | |
| `tasks` | `id uuid` PK, `user_id`, `title_enc`, `due date null`, `done_at`, `meeting_id null`, `created_at` | Index `(user_id, done_at nulls first)` |
| `agent_actions` | `id uuid` PK, `user_id`, `kind`, `status` (`pending`/`approved`/`rejected`/`failed`), `payload_enc`, `outcome_enc`, `meeting_id null`, `created_at`, `decided_at` | |
| `agent_traces` | `id uuid` PK, `user_id`, `meeting_id null`, `body_enc`, `created_at` | |
| `chat_messages` | `id uuid` PK, `user_id`, `thread_id uuid`, `role` (`user`/`lente`), `text_enc`, `refs jsonb` (kinds and ids only, no labels), `found bool`, `created_at` | Index `(user_id, thread_id, created_at)` |
| `memory_digests` | `id uuid` PK, `user_id`, `scope` (`profile`/`day`/`week`/`month`), `period_start date`, `body_enc`, `source_count int`, `model`, `created_at` | Unique `(user_id, scope, period_start)` |
| `search_terms` | PK `(user_id, term, ref_kind, ref_id)`, `term bytea` (16), `ref_kind smallint`, `ref_id text`, `at` | **Group 10 only**, created by its own migration if the eval calls for it; index `(user_id, term, at desc)` |
| `glossary` | `id uuid` PK, `user_id`, `body_enc`, `created_at` | Language profile and terms |
| `usage_daily` | PK `(user_id, day, provider, model)`, `calls`, `input_tokens`, `cached_tokens`, `output_tokens`, `audio_seconds`, `cost_micro_usd bigint` | Plain numbers only |
| `audit_events` | `id bigint identity` PK, `user_id`, `at`, `actor` (`wearer`/`device:<id>`/`agent`/`mcp:<client>`), `action`, `target_kind`, `target_id` | Never content |

Migrations are plain SQL in `supabase/migrations/`, applied with the Supabase CLI or the dashboard, and a schema test checks that every table has RLS enabled and no permissive policy.

Beyond RLS, every table is revoked from `anon` and `authenticated` (Supabase grants them all on new public tables by default), and rows that name a meeting carry `(meeting_id, user_id)` foreign keys to `meetings (id, user_id)`, so a row can never point at another user's meeting. Rows that outlive their meeting (facts, tasks, actions, traces, day entries) use `on delete set null (meeting_id)` (Postgres 15+).

## Risks / Trade-offs

- [The hub can read everything it serves] → stated plainly: this protects the stored data, not a compromised hub; keys stay out of logs; the KEK lives only in the secret store; rotation re-wraps DEKs without touching content (task 2.5).
- [Losing the KEK loses every account] → the KEK is kept in the secret store plus an offline copy held by the owner; a startup check refuses a KEK that does not open a canary sealed at setup.
- [Free Meta credits] → the hackathon credit's billing warns that content sent on free credits "may be used for product improvement"; other people's conversations must not be sent on that credit. Onboarding outside users waits for a paid Meta billing account, and the privacy note says which models see the content.
- [Recording other people] → the sign-up states that the wearer is responsible for telling the people around them, as the README already says for the clip; the privacy note follows Colombia's Ley 1581 (consent, access, deletion) since the first users are there.
- [Version 1 misses answers buried in raw turns] → the eval (task 5.5) measures exactly that; group 10 adds the blind index only if it does, with its leak (term frequency within one user) documented.
- [Supabase Free pauses or fills up] → health reports a paused or unreachable database; the size per hour of listening is measured; the move to Pro has written triggers (decision 0).
- [No point-in-time recovery on Free] → nightly sealed export to the Modal volume, kept 7 days.
- [One container, many live streams] → capacity measured (task 6.4); `LENTE_MAX_LISTENING` refuses new listening past it.
- [Digest quality drifts] → the profile is visible and editable, kept facts win, digests keep the ids they came from, and the eval covers questions only an old digest can answer.
- [Token verification fails open] → it is pure and tested with expired, wrong-issuer, wrong-audience and unknown-`kid` tokens; any failure is 401.

## Migration Plan

1. The owner frees a free-project slot (or picks an organization). Then the project `lente` is created on the Free plan in `us-east-1` through the Supabase MCP, with the cost shown and confirmed first. The owner enables Google; the migrations are applied; the keys go in `.env` and the Modal secret.
2. Ship the hub with both backends; Supabase stays off until the keys are set.
3. Sign in as the owner on the phone; `scripts/import-data.ts` seals the volume's files into the owner's account and prints counts per table that must match the files.
4. Keep the volume as a backup for a week, then delete its content files.
5. Open sign-up to a small list of testers (`LENTE_ALLOWED_EMAILS`) before anyone else.

Rollback: unset the Supabase keys and the hub goes back to the files on the volume (kept until step 4).
