# Tasks

## 1. Deploy

- [ ] 1.1 `/health` reports `commit` from `LENTE_COMMIT` (unset: `"dev"`); `deploy/modal/hub.py` passes the commit it was deployed from; test (`pnpm test`)
- [ ] 1.2 `.github/workflows/deploy-hub.yml`: on `hub-v*` tags and manual dispatch, runs typecheck, tests and smoke, refuses a commit not reachable from `origin/main`, then `modal deploy --strategy recreate deploy/modal/hub.py`
- [ ] 1.3 Owner: a Modal token for CI as a GitHub secret, scoped to the Lente workspace [human]
- [ ] 1.4 First tagged deploy from CI; `/health` shows the tag's commit; then a rehearsed rollback to the previous tag, with the time each took recorded in `docs/kb/operations.md` [key:MODAL_TOKEN_ID]

## 2. Watching

- [ ] 2.1 Pure alert policy: down, database slow/paused/unreachable, daily spend over `LENTE_ALERT_SPEND_USD`, 5xx count; edge-triggered (one alert when it starts, one when it clears); tests with a fake clock (`pnpm test`)
- [ ] 2.2 A Modal scheduled function every 5 minutes runs the policy against `/health` and posts to `LENTE_ALERT_WEBHOOK`; no content in any alert
- [ ] 2.3 Owner: create the webhook (a channel only the owner and operators read) and put it in the Modal secret [human]
- [ ] 2.4 Trigger each alert once on purpose (stop the hub, point at a wrong database URL, lower the spend threshold) and see it arrive and clear [key:MODAL_TOKEN_ID]

## 3. Database

- [ ] 3.1 `docs/kb/supabase.md`: Free plan limits and pause rule as verified, the decision to move to Pro before sign-up opens, and its cost
- [ ] 3.2 Owner: move the project to Pro when `add-consent` 4.2 is ready [human]
- [ ] 3.3 First restore drill: the latest nightly export into a scratch schema, one test account opened with the KEK; record the time in `docs/kb/operations.md` [key:SUPABASE_SECRET_KEY]

## 4. Runbook

- [ ] 4.1 `docs/kb/operations.md`: deploy, rollback, key rotation for each key, pausing sign-ups, what each alert means and what to do, the measured capacity and `LENTE_MAX_LISTENING`
- [ ] 4.2 README "What was built during the hackathon" row (or a "Changelog" section after the hackathon) for the day the change lands
