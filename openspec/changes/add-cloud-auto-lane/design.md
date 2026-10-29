# Design

API facts, headers and field shapes are in `docs/kb/claude-managed-agents.md`. Write this code fresh: the author's other projects talk to the same API, and nothing is copied from them (hard rule 1).

## Flow for one node

```
runner (Mac)                                   Managed Agents (cloud)
─────────────                                  ──────────────────────
pick ready node, bench = {no board, no phone, no keys}
check main == origin/main (the cloud only sees GitHub)
POST /sessions  agent, environment, budget,
                github_repository @ origin/main sha (read-only token)
POST /sessions/{id}/events  user.message(build prompt)
stream events ──────────────────────────────►  agent reads CLAUDE.md, the change,
  (tool names → state.json, list cost)          builds, runs pnpm typecheck/test/smoke,
                                                writes /mnt/session/outputs/node.patch
◄────────────── session.status_idle end_turn    and /mnt/session/outputs/result.json
GET /files?scope_id → download patch + result
check every touched path (policy.checkWrite, forbidden files, size cap)
reset lane to base, git apply --index, gates, local review
fail → user.message(problem) to the same session, new cumulative patch (≤ 2 rounds)
pass → commit with evidence, fast-forward main (push only with --push)
```

## Decisions

- **Patch out, not push.** A read-only fine-grained token (`Contents: Read`, this repository only) clones; nothing in the cloud can write to GitHub. The patch is cumulative from the base commit on every round (`git diff --binary <base>` after `git add -A`), so the runner always resets and applies one file. Keeps "only the runner commits" true without branch protection tricks.
- **Base must be on GitHub.** If local `main` is ahead of `origin/main`, the runner does not build cloud nodes and says "push main first"; with `--push` it pushes before the first cloud node.
- **Gates and review stay local.** They are the brakes the harness already trusts. The cloud agent also runs typecheck and tests so it reaches the runner with green code, but its claims are not evidence; the runner's runs are.
- **No hooks in the cloud.** Claude Code's PreToolUse guard does not run inside Managed Agents. Isolation replaces it: the clone has no `.env`, `secrets.h`, `data/` or recordings (all git-ignored), the network is `limited` with only package managers, web tools are off, and every touched path is checked before the patch lands.
- **Agent and environment are created once.** `pnpm auto:cloud-setup` creates them if `data/auto/cloud.json` has no ids, and updates them in place otherwise (prompt or model changes become a new agent version). It never archives; archiving is the owner's call.
- **The prompt is the local builder's prompt** minus the bench and hub sections, plus the output contract (where the patch and `result.json` go, same `BuildResult` shape). One function builds both so the rules cannot drift.
- **Budget in cents.** `--node-budget 6` becomes `{type: "limit", max_list_cost: {amount: "600", currency: "USD"}}`. `budget_reached` fails the node with that reason; the runner does not raise budgets on its own.
- **Stop reasons.** `end_turn` → fetch outputs. `budget_reached` → fail. `requires_action` → should not happen with `always_allow`; send `user.interrupt` and fail. `session.error` or `terminated` without outputs → fail with the error text. The runner also enforces a wall-clock limit per round.
- **Stream drops.** Reopen the stream, list events, dedupe by id (the stream has no replay).
- **Key handling.** `readKey()` reads `LENTE_CLOUD_KEY_FILE` or `~/.config/lente/anthropic-cloud.key` on each request and fails with "Claude Platform key file missing at <path>" (path only, never the content). Local `claude` children get an environment without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`.

## Risks

- The sandbox's Node may be older than 22.18; the first verification task checks it, and the prompt tells the agent to install Node 22 through the package manager if needed.
- Workshop credit is small (USD 50): default node budget USD 6, run budget USD 20 for cloud work unless the owner passes more.
- Repository skills load into the cloud agent at session start; only the owner commits to this repository, so they stay inside the trust boundary.
