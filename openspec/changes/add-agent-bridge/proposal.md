# Proposal

Depends on: `add-task-owners`

## Why

The wearer already works with coding agents (Claude Code, Codex, Cursor). Lente knows what was said in their meetings and which tasks came out of them, and the agents know how to do the work. Today nothing connects them:

- An agent cannot ask Lente "what did we agree with Ana?" or read the task list.
- Lente cannot hand a task it marked `lente` to an agent that can do it.

`add-glasses-mcp` planned an MCP server with one key in `.env`. A hub with accounts needs one per user: a token tied to one account, read-only unless the user asks for more, and revocable from the phone.

## What Changes

- **Agent tokens with scopes.** A device of kind `mcp` (shown as "Agente" in the app) carries scopes:
  - `read` (the default);
  - `tasks.write`, only when asked for;
  - `agent.run`, for the bridge.

  A migration adds `scopes` to `devices`.
- **An MCP server per user at `/mcp`.** Streamable HTTP with JSON-RPC 2.0, written by hand with no dependency. It speaks revision 2026-07-28 and the initialize-based revisions back to 2025-03-26. Its tools:
  - `ask_lente`, `search_meetings`, `get_meeting`, `list_projects` and `list_tasks` (scope `read`);
  - `create_task`, `update_task` and `complete_task` (scope `tasks.write`).

  `tools/list` shows only what the token allows. Tool errors carry a code: `unauthorized`, `not_found`, `rate_limited` or `paused_by_wearer`. Every call is noted in the user's day without content ("Un agente consultó tus tareas").
- **A CLI with no dependencies, `scripts/lente.ts`:**
  - commands `ask`, `tasks`, `task add` and `task done`, over `/mcp`;
  - `--json` prints one JSON document;
  - exit codes 2 (no permission), 3 (hub error) and 5 (not found).
- **Agent jobs.** `POST /agent/jobs` queues work for Claude Code or Codex, from a `lente` task or a free instruction.
  - It is an `agent_actions` row with tool `run_agent`, shown in "Por aprobar".
  - Nothing runs until the user approves it.
  - In the chat, `/ask` recognizes a request to do something ("haz", "ejecuta", "que Claude…") and proposes the job instead of answering from the memory.
- **The bridge, `scripts/agent-bridge.ts`, on the user's machine.** It follows the hub with an `agent.run` token and picks up only approved jobs, one at a time. It runs `claude -p` or `codex exec` in their most restrictive modes, in a folder from a local allow list, with no keys in the environment and a 15-minute timeout. It returns a summary of at most 2,000 characters, and the task is marked done only on exit code 0.
- **Minimal app changes:**
  - the token kind "Agente" with its scopes in Ajustes → Cuenta → Dispositivos;
  - the `run_agent` card in "Por aprobar";
  - "Que lo haga un agente" on a `lente` task.
- **Docs:** `docs/kb/agents.md` and the README, with the tested lines for Claude Code, Cursor and Codex.

Out of scope: OAuth for MCP clients, agents running in the cloud, streaming an agent's progress to the phone, and `add-glasses-mcp`'s live tools (look, buzz, show a card).

Meta models: Muse Spark 1.3 answers `ask_lente`, and its structured output now also tells a command from a question in the chat. The agents that do the work are the user's own; Lente sends them only the approved instruction.

Privacy:
- A token sees only its user's data, and only what its scopes allow.
- The day record keeps that an agent called a tool, never what it asked or got.
- The bridge's stream carries only that user's approved jobs, never transcripts.

## Capabilities

### New Capabilities
- `agent-access`: per-user agent tokens with scopes, the MCP server and the CLI.
- `agent-jobs`: approved work handed from Lente to the user's coding agents through the bridge.
