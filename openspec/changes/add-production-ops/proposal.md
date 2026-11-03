# Proposal

Depends on: `add-accounts`, `add-cloud-hub`

## Why

The hub on Modal is deployed by hand from a laptop. On 2026-11-02 it ran an unmerged branch, and nothing outside that laptop said so. Nobody hears when it goes down, when Supabase pauses the Free project after a quiet week, or when spend climbs. It runs in exactly one container, and nobody has measured how many wearers that holds. Before other people depend on Lente, what runs in production must be knowable, recoverable and watched.

## What Changes

- **Deploy from `main` only.** A GitHub Actions workflow deploys the hub to Modal on a `hub-v*` tag or by manual dispatch. It runs typecheck, tests and smoke first, refuses any commit that is not on `main`, and always uses `--strategy recreate`. The hub reports the commit it runs in `/health` (`LENTE_COMMIT`).
- **Rollback.** Redeploying the previous tag is the rollback. The runbook says how, and one rollback is rehearsed.
- **Watching.** A scheduled check calls `/health` every 5 minutes and alerts the owner through a webhook (`LENTE_ALERT_WEBHOOK`) when the hub is down, the database is slow, paused or unreachable, or the day's spend across all users passes a threshold. Alerts carry no content.
- **Errors without content.** Log lines on a hub with accounts carry an event code, a route, a status and lengths, never text (as `add-accounts` 2.3 already guards). A daily count of 5xx by route goes to the same webhook.
- **Database plan.** Stay on Supabase Free while only the owner and testers use it, with the pause covered by the health check. Move to Pro before the sign-up gate (`add-consent`) opens: daily backups and no pause. `docs/kb/supabase.md` records the decision and its date.
- **Restore drill.** Once a month, restore the nightly export (`add-accounts` 4.6) into a scratch schema and open one test account's rows with the KEK.
- **Capacity on record.** `LENTE_MAX_LISTENING` is set from the measurement in `add-accounts` 6.4, and the hub's limits are written in `docs/kb/operations.md`: one container, N listening users. Scaling past one container is a later change.
- **An operations runbook.** `docs/kb/operations.md` covers deploy, rollback, key rotation (KEK, Supabase, Meta, Baseten, Modal), pausing sign-ups, and what to do on each alert.

Out of scope: more than one container, a public status page, paging.

Meta models: none.

Privacy: alerts and counts carry no content; the restore drill uses a test account.

## Capabilities

### New Capabilities
- `operations`: deploy from main, the reported commit, health checks and alerts, the database plan and the restore drill.

## Impact

- `.github/workflows/deploy-hub.yml`; `deploy/modal/hub.py` (commit in the environment, a scheduled health function); `/health` gains the commit; `docs/kb/operations.md`; `docs/kb/supabase.md`.
- GitHub secrets: a Modal token for CI, the alert webhook (owner only).
