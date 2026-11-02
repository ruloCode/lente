# Design

## Context

- Users, devices, tasks with an owner and `agent_actions` exist (`add-accounts`, `add-task-owners`).
- Device tokens are kept as SHA-256 hashes and today open only the `/device` WebSocket.
- Every per-user route lives in the wearer runtime of `src/pilot.ts`.
- MCP's current revision (2026-07-28, read on modelcontextprotocol.io on 2026-11-02) has no session and no `initialize`:
  - every request carries `_meta["io.modelcontextprotocol/protocolVersion"]`;
  - the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers must match the body (`400`, code `-32020`, when they don't);
  - an unknown version is `400`, code `-32022`, with `supported`;
  - `server/discover` is required;
  - `GET` answers `405`.

  Clients of revisions 2025-03-26 to 2025-11-25 still open with `initialize`.

## Decisions

1. **Scopes on the device row.**
   - `devices.scopes text[]`, limited to `read`, `tasks.write` and `agent.run`. The column defaults to empty, and existing `mcp` rows become `{read}`.
   - Only `mcp` devices carry scopes; clip and desktop tokens get none. An `mcp` token created without scopes gets `{read}`.
   - `POST /devices` takes `scopes`; an unknown scope is a 400, never dropped silently.
   - `resolveAgent(token)` answers only for a live `mcp` device, with its user, id, label and scopes.
   - Clip tokens still open no HTTP route, and agent tokens open only `/mcp`, the bridge's stream and the job routes.
2. **A dual-era server, pure (`src/mcp.ts`).** It takes the method, headers and body and returns status, headers and body; the hub does the I/O.
   - Modern: a request with the version in `_meta` is checked against the headers and served statelessly.
   - Legacy: `initialize` negotiates one of `2025-11-25`, `2025-06-18` or `2025-03-26`. Later requests are served without a session id, which those revisions allow. A missing version header means `2025-03-26`.
   - Notifications get `202`. `GET` and `DELETE` get `405`, and batches get `400`.
   - An `Origin` header that is not the hub's own gets `403`.
   - Replies are always one `application/json` object, never SSE.
3. **Tools over a runtime API** (`src/agent-mcp-tools.ts`). Each tool has a name, a JSON Schema, a scope and a handler. Handlers call an `AgentApi` the wearer runtime implements:
   - `ask`, `searchMeetings`, `getMeeting`, `projects` and `tasks`;
   - the three task writes;
   - `paused`, `note` and `createJob`.

   So the MCP tools, the phone's routes and the CLI read the same stores.
4. **Errors.** Protocol errors are JSON-RPC errors: an unknown tool or bad params are `-32602`. Tool errors are `isError: true` results whose text starts with the code and whose `structuredContent.error` is the code:
   - `not_found`;
   - `unauthorized` (a tool outside the token's scopes);
   - `rate_limited` (more than 60 calls a minute per token, a token bucket);
   - `paused_by_wearer` (the user turned agents off with `POST /agents/pause`).

   A missing, unknown or revoked token is HTTP `401` with `WWW-Authenticate: Bearer`, before any JSON-RPC.
5. **The day without content.** Each call adds `{kind: "agent", tool, client, text}` to the day, with a fixed Spanish sentence per tool ("Un agente consultó tus tareas"). The `client` is the token's label. The phone shows it like any day entry. The memory and the digests ignore the kind.
6. **The CLI is an MCP client.** `scripts/lente.ts` sends modern requests to `/mcp` with `LENTE_TOKEN`. Exit codes:
   - 2: HTTP 401, or `unauthorized`;
   - 5: `not_found`;
   - 3: any other hub failure, `rate_limited` and `paused_by_wearer` included;
   - 1: bad usage.

   `--json` prints the tool's `structuredContent` and nothing else on stdout.
7. **Jobs are actions.**
   - `POST /agent/jobs` queues a pending action with tool `run_agent`. Its args are `{agent, instruction, workdir?, taskId?}`, and a `taskId` must be a task the user owns. The instruction is at most 2,000 characters; a task's job uses the task title when no instruction is given.
   - The job's progress lives in the action's `outcome`: `queued` once approved, then `running`, then `done` or `failed`. Approving never runs anything in the hub.
   - `POST /agent/jobs/<id>/claim` moves an approved, queued job to `running`. A second claim answers 409.
   - `POST /agent/jobs/<id>/result` `{exitCode, summary}` closes the job. Exit 0 marks its task done; anything else marks the action `failed`.
   - Both routes need an `agent.run` token of the job's user.
8. **The bridge's stream.** `GET /events` with an `agent.run` token sends only `{kind: "jobs", items}`: the approved, queued jobs. It is sent when the stream opens and after every change, with a keep-alive. Turns, cues and the rest of the phone's events never go to it.
9. **The chat proposes commands.**
   - `askSchema` gains `intent` (`answer` or `command`), `agent` (`claude` or `codex`) and `instruction`.
   - A command counts only when the model says so and the question asks for action (a pure check on verbs like "haz", "ejecuta" and "corre", or a named agent). So a plain question can never turn into a job.
   - `/ask` then queues the job (folder: the bridge's default) and answers that it waits in "Por aprobar".
10. **The bridge** (`scripts/agent-bridge.ts`, pure parts in `src/agent-bridge.ts`):
    - **Config** in `~/.config/lente/agents.json` (outside the repo, never `.env`): `{hub, folders: {name: path}, default}`. The token comes from `LENTE_TOKEN`. A job's `workdir` must name a folder in the list or equal one of its paths; anything else fails without running.
    - **Commands**, verified with `claude --help` 2.1.316 and a real run, and in OpenAI's Codex CLI reference:
      - `claude -p --restricted --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --no-session-persistence --disallowedTools WebSearch --output-format text -- <instruction>`. `--restricted` removes the tools that run commands and confines file tools to the folder; anything that would prompt is denied.
      - `codex exec --sandbox workspace-write --cd <folder> --ephemeral --output-last-message <file> -- <instruction>`. `workspace-write` keeps the network off by default.
    - **Environment**: only `PATH`, `HOME`, `USER`, `LANG`, `TERM` and `TMPDIR`. `LENTE_TOKEN` and any `*_KEY` or `*_TOKEN` never reach the agent.
    - **Limits**: one job at a time, killed after 15 minutes (`SIGTERM`, then `SIGKILL` 5 s later).
    - **Summary**: the last 2,000 characters of the agent's final message, or of its output.
    - **Agents**: the `claude` and `codex` executables are configurable (`commands` in the config), so tests use a fake agent.

## Risks / Trade-offs

- Legacy clients get no session id: the 2025 revisions make it optional. If a client insists on one, the fix is a minted id that the server ignores.
- A command misread in the chat queues a job, but only a job: nothing runs without approval, and the card shows the instruction for editing.
- Claude Code's `acceptEdits` with `--restricted` still edits files in the folder; the folder allow list is the boundary, and the user picks it.
- The bridge holds an `agent.run` token, which can only read approved jobs and post their results. It cannot read the memory.
