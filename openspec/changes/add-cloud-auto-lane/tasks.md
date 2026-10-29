# Tasks

Depends on: `add-agent-harness`

## 1. Setup

- [x] 1.1 `docs/kb/claude-managed-agents.md`: endpoints, headers, agent, environment, repository resource, budget, stop reasons, cost and the key rule, from the official docs; linked from `docs/kb/README.md`
- [ ] 1.2 Owner: rotate the Claude Platform key in the Console and write the new one to `~/.config/lente/anthropic-cloud.key` (mode 600); create a fine-grained GitHub token with `Contents: Read` on `ruloCode/lente` only into `~/.config/lente/github-read.token`; note the workspace id from the Console URL [human]
- [ ] 1.3 `scripts/auto/cloud.ts` as pure code with tests (`node --test test/cloud.test.ts`): agent, environment and session bodies, budget in cents, event reducer (status, stop reason, tool names, list cost), patch path check against the guard policy
- [ ] 1.4 `pnpm auto:cloud-setup` creates or updates the agent and environment and records ids in `data/auto/cloud.json`; `--dry-run` prints the bodies with no key; verify with a fake `fetch` in tests that a second run updates instead of creating

## 2. Runner

- [ ] 2.1 Key handling: `readKey()` reads the file per request and fails naming only the path; local `claude` children run without `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`; the guard refuses reading the key and token files (`node --test test/policy.test.ts`)
- [ ] 2.2 Cloud builder in `scripts/auto/run.ts` behind `--cloud`: bench-free nodes only, refuse when `main` is ahead of `origin/main`, session with budget and read-only mount, stream with reconnect and dedupe, outputs download with retry, path check, `git apply --index` onto a reset lane; verify with a fake API in tests and `pnpm auto --cloud --dry-run`
- [ ] 2.3 Fix rounds as `user.message` to the same session (cumulative patch), `budget_reached`, `requires_action`, `session.error` and wall-clock timeout fail the node with the reason; tests with scripted event streams
- [ ] 2.4 Progress page: cloud or local per node, trace link, session status and list cost; verify with a screenshot

## 3. First run

- [ ] 3.1 One throwaway session checks the sandbox: Node and pnpm versions, `pnpm install && pnpm test` time, second-session start time; record the numbers in `docs/kb/claude-managed-agents.md` [human]
- [ ] 3.2 `pnpm auto --cloud --once` merges one code-only node end to end; check the commit's evidence, the session's list cost and the page; record cost and time in `docs/benchmarks.md` [human]
