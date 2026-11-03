# Design

## Decisions

- **The policy lives in the repo, served by the hub.** Markdown in `docs/legal/` (Spanish and English), rendered by the hub as plain HTML. Its version is the date of the last change. The Play listing (`add-store-release`) points at the same URLs, so the store, the app and the repository cannot disagree.
- **The gate is in code, not in a checklist.** `canAdmit(account, config)` is pure: allow list, or (terms version set and policy published and `LENTE_PAID_MODELS=1`). A test proves the hub refuses a new email when any of the three is missing. The owner sets `LENTE_PAID_MODELS` by hand after checking Billing, because no API tells the hub that.
- **The recording light is dim and steady.** Three quick blinks already mean a cue. A steady light at low duty cycle (`RECORDING_LED_DUTY`, starting at 10 %) means transcribing, so the two never look alike. The clip turns it on from the hub's listening state, which it already receives. Battery cost is measured on the bench over one hour, with and without the light.
- **Retention deletes turns, not meaning.** The nightly job deletes meeting turns and day entries older than `retention_days`. Notes, kept facts, tasks and digests stay, and their citations to deleted turns become «turno ya borrado». Digests were written while the turns existed, so they keep working.

## Risks

- **Legal text is not engineering.** Tasks that publish it are `[human]`. The agent drafts, a lawyer reviews, the owner publishes.
- **A light can be covered.** It is a courtesy signal, not a guarantee. The policy says so.
