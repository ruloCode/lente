# Proposal

## Why

The auto lane builds every node with a headless Claude Code session on the owner's Mac, which spends the owner's Claude plan and runs with the same machine that holds `.env`, the clip and the phone. Most open nodes need none of that: they are code, tests and docs that CI's gates can judge. Claude Managed Agents runs the same kind of agent in a sandbox on Anthropic's side, billed to the workshop credit of the "Build Day Fable 5.1" workspace, with no secrets and no hardware in reach. Moving those nodes there keeps the plan for hands-on work and makes the lane's isolation structural instead of enforced by hooks.

## What Changes

- **Cloud builder:** `pnpm auto --cloud` builds each ready node whose open tasks need nothing from the bench (no `[hw]`, `[phone]`, `[key:…]` or `[human]`) in a Managed Agents session instead of a local `claude -p`. Nodes that need the bench still build locally, as today. One node at a time.
- **No write access in the cloud:** the session mounts `github.com/ruloCode/lente` read-only at the exact commit of `origin/main`. The agent never pushes; it leaves a patch and its structured result in `/mnt/session/outputs/`, and the runner downloads them.
- **Same gates, same merge:** the runner applies the patch in the lane worktree only after every touched path passes the guard's write policy, then runs CI's gates and the fresh read-only review locally, exactly as for a local build. Fix rounds go back to the same session as a new message. Only the runner commits and fast-forwards `main`.
- **Spend is capped twice:** every session carries a Managed Agents budget (the node budget, in cents), and the run budget counts the sessions' list cost.
- **Key stays out of every environment:** the Claude Platform key is read from a file outside the repo per request; it is never in `.env`, `process.env` or a child's environment, and the runner strips `ANTHROPIC_API_KEY` from the local `claude` sessions so they keep billing the plan.
- **Visible:** the progress page shows the session's trace link, status and list cost.

Out of scope before 2026-11-04: parallel cloud builds, scheduled deployments, letting the cloud push branches or open pull requests, running hardware or phone tasks in the cloud.

Meta models: unchanged. This is tooling that builds Lente; Meta's models run inside Lente, not in the lane (see `docs/kb/decisions.md`).

## Capabilities

### New Capabilities
- `cloud-lane`: building ready nodes in Claude Managed Agents sessions under the auto lane's gates.

## Impact

- New: `scripts/auto/cloud.ts` (pure: request bodies, budget in cents, event reducer, patch path checks) with tests, `scripts/auto/cloud-setup.ts` (create or update the agent and environment once), cloud builder path in `scripts/auto/run.ts`, a cloud row on the progress page.
- `scripts/auto/policy.ts`: refuse reading the key and token files; `run.ts` strips Anthropic keys from child environments.
- Local, git-ignored: `data/auto/cloud.json` (workspace, agent, environment ids). Outside the repo: `~/.config/lente/anthropic-cloud.key`, `~/.config/lente/github-read.token`.
- Docs: `docs/kb/claude-managed-agents.md` (API surface and the key rule), a decision in `docs/kb/decisions.md`.
- No product code changes.
