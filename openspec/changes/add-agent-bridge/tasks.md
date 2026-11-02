# Tasks

Depends on: `add-task-owners`

## 1. Agent tokens with scopes

- [x] 1.1 Migration: `devices.scopes` with the default `{read}` and the allowed values; tests on the stores (`pnpm test`)
- [ ] 1.3 Apply `20261102030000_agent_scopes.sql` to the live Supabase project with the owner's yes; until then, creating a device on the live project fails on the unknown `scopes` column [human]
- [x] 1.2 `UserDevices`: scopes on create, `resolveAgent`, and `POST /devices` taking `scopes`; tests (`pnpm test`)

## 2. MCP server

- [x] 2.1 `src/mcp.ts`: dual-era JSON-RPC over Streamable HTTP, header checks, `server/discover`, `initialize`, notifications, 405, Origin check; unit tests (`pnpm test`)
- [x] 2.2 `src/agent-mcp-tools.ts`: the eight tools with scopes, error codes, the rate limit and the day sentences; unit tests with a fake API (`pnpm test`)
- [x] 2.3 `/mcp` in the hub, `POST /agents/pause|resume`, the `agent` day entry; tests on the real hub with the fake PostgREST: another user's token sees nothing, a `read` token has no write tools, a revoked token gets 401 (`pnpm test`, `pnpm smoke`)

## 3. CLI

- [x] 3.1 `scripts/lente.ts`: `ask`, `tasks`, `task add`, `task done`, `--json`, exit codes; tests against a hub (`pnpm test`)

## 4. Agent jobs and the bridge

- [x] 4.1 `POST /agent/jobs`, `run_agent` actions, claim and result routes, the bridge's `jobs` stream; tests on the real hub (`pnpm test`)
- [x] 4.2 The chat's `command` intent in `/ask` (both answer paths); unit tests for the check and the parse (`pnpm test`)
- [x] 4.3 `scripts/agent-bridge.ts` and `src/agent-bridge.ts`: config, folder allow list, restrictive commands, clean environment, timeout, one job at a time; tests with a fake agent that exits 0 or 1, and an unapproved job that never runs (`pnpm test`)
  - 2026-11-02: 554 of 554 hub tests and `pnpm smoke` pass.
- [x] 4.4 A job the bridge lost (no result 20 min after the claim) is marked failed; the bridge retries sending a result; unit test (`pnpm test`)

## 5. App

- [x] 5.1 Android: the "Agente" token kind with its scopes, the `run_agent` card and "Que lo haga un agente" on `lente` tasks; unit tests (`pnpm android:test`) and a build (`pnpm android:build`)
- [ ] 5.2 A screenshot of the card and the token on the phone [phone]

## 6. Docs and real clients

- [x] 6.1 `docs/kb/agents.md` and README: Claude Code, Cursor and Codex config, the token, the bridge; `docs/kb/decisions.md`
- [x] 6.2 `claude mcp add` against a running hub, with `claude mcp list` connected and a real tool call
  - 2026-11-02, Claude Code 2.1.316, on a local hub with scratch data:
    - `claude mcp list` showed "✔ Connected"; the hub logged `server/discover` and `tools/list` (the current revision, no `initialize`).
    - A headless session called `list_tasks` and `create_task`, 1–2 ms each on the hub and 12 s end to end. The day showed both calls labelled "Claude Code".
    - The bridge ran an approved job with real Claude Code in 4 s (exit 0, file written, summary back). The folder was empty before approval.
- [ ] 6.4 Codex and Cursor against a running hub (neither is installed on the bench; their config comes from their docs) [human]
- [ ] 6.3 The owner approves one real job from the phone and the bridge runs it with Claude Code [human]
