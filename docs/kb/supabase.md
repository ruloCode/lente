# Supabase

The project behind accounts (`add-accounts`). Only refs, URLs and public IDs live here; keys live in `.env` and the Modal secret.

## Project

- Name `lente`, ref `erufopbceodmnqbilovo`, organization Kuadra, region `us-east-1`, Free plan. Created 2026-11-02 through the Supabase MCP with the owner's yes (task 1.3).
- URL `https://erufopbceodmnqbilovo.supabase.co`.
- Schema: `supabase/migrations/`, applied through the MCP on 2026-11-02 (task 1.7). Checked the same day with the publishable key: all 18 tables answer 401 to a read and to an insert.
- Advisors after applying:
  - Security: only `rls_enabled_no_policy` (INFO) on all 18 tables. That is the design: no policy, no grants, and only the hub reaches the tables, with the secret key.
  - Performance: `unindexed_foreign_keys` on the `(meeting_id, user_id)` keys. Fixed by `20261102000000_meeting_fk_indexes.sql`.
  - `unused_index` (INFO) is expected on an empty database.

## Auth

- Signing key: the JWKS at `/auth/v1/.well-known/jwks.json` serves one `EC` key, `ES256` on curve `P-256`, which `src/user-auth.ts` accepts.
- Config lives in `supabase/config.toml` and is pushed with `supabase config push --project-ref erufopbceodmnqbilovo`:
  - The site URL is the Modal hub.
  - The redirect allow list holds the hub's `/auth/callback` on Modal and on `localhost:8080`/`127.0.0.1:8080`.
  - Email sign-up is off.
  - Google is on.
- Caution: `echo n | supabase config push` applied the push anyway once (CLI 2.75.0). Read the diff with `--debug` or on a scratch project, never through a piped "n".
- Google's client secret comes from `supabase/.env` (git-ignored) as `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
- `supabase projects api-keys` (CLI 2.75.0) prints secret keys masked with `•`. Copy the `sb_secret_` key from the dashboard (Settings → API Keys), never from the CLI.

### Endpoints (task 1.1, probed on the live project 2026-11-02)

Each probe used a bogus token or code, so every answer is an error that proves the route and its shape:

| Call | Used by | Live answer to a bogus value |
|---|---|---|
| `GET /auth/v1/.well-known/jwks.json` | hub (`src/user-auth.ts`) | 200, one key `EC`/`ES256`/`P-256` |
| `GET /auth/v1/settings` (publishable `apikey`) | — | 200: `google: true`, `email: false` |
| `POST /auth/v1/token?grant_type=id_token` `{provider:"google", id_token, nonce}` | Android (`Auth.kt`) | 400 "Bad ID token" |
| `POST /auth/v1/token?grant_type=refresh_token` `{refresh_token}` | Android, hub | 400 "Refresh token is not valid" |
| `GET /auth/v1/authorize?provider=google&code_challenge=…&code_challenge_method=s256&redirect_to=…` | hub web sign-in | 302 to `accounts.google.com/o/oauth2/v2/auth` |
| `POST /auth/v1/token?grant_type=pkce` `{auth_code, code_verifier}` | hub (`src/web-session.ts`) | 404 "invalid flow state, no valid flow state found" |
| `GET /rest/v1/<table>` with the publishable key | nobody | 401, `42501 permission denied` (no grants) |

Auth calls carry the publishable key in `apikey`.

### The secret key

- The secret key goes in the `apikey` header only. Supabase's API keys guide: an `sb_secret_`/`sb_publishable_` key is not a JWT, so it cannot be sent as `Authorization: Bearer` (unless it equals `apikey`, and then the database rejects it as not a JWT). `src/supabase-rest.ts` and `deleteAuthUser` send `apikey` only.
- PostgREST: `GET|POST|PATCH|DELETE /rest/v1/<table>`, `Prefer: return=representation|minimal`, filters such as `user_id=eq.<uuid>`; RPC is `POST /rest/v1/rpc/<function>` with the arguments as a JSON object.
- Auth admin: `DELETE /auth/v1/admin/users/<id>`.
- Pending: the secret-key calls (table read, RPC, admin) answered 401 "Invalid API key" on 2026-11-02 because `.env` held the CLI's masked key. Re-run them once the dashboard key is in `.env`.

### Free plan limits (supabase.com/pricing, 2026-11-02)

| Limit | Free plan |
|---|---|
| Database size | 500 MB |
| Auth monthly active users | 50,000 |
| Egress | 5 GB |
| File storage | 1 GB |
| Backups | none (hence `scripts/backup-db.ts`, task 4.6) |
| Pausing | after 1 week of inactivity |
| Active free projects | 2 per owner |

## Google OAuth (task 1.4)

- Google Cloud project `lente-513513`. Consent screen "Lente", External, in Testing; only the test users on its Audience page can sign in (100 at most before verification).
- Web client "Lente Web (Supabase)": `194936952564-2b361ao2kio0mbgiivnv9qh3q20cvg37.apps.googleusercontent.com`, redirect `https://erufopbceodmnqbilovo.supabase.co/auth/v1/callback`. It goes first in Supabase's Google client IDs, and it is the `serverClientId` the Android app asks Credential Manager for (`lente.googleWebClientId`).
- Android client "Lente Android": `194936952564-0vc5m61oarv6v5pb47vks4mevvbv23vf.apps.googleusercontent.com`, package `app.lente`, SHA-1 `FE:B6:D8:98:9C:DD:2B:56:26:DC:E5:09:89:04:63:89:7E:37:C9:A4`. Both debug and release builds are signed with the local debug key for now. A Play-signed release needs its own SHA-1 added.
