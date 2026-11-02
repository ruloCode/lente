# Spec Delta

## Purpose

Letting the user's own agents read their Lente memory and tasks over MCP or a CLI, with a token per user and only the scopes the user granted.

## ADDED Requirements

### Requirement: Agent tokens with scopes
The hub SHALL let a signed-in user create an agent token (device kind `mcp`) with the scopes `read`, `tasks.write` and `agent.run`. A token SHALL default to `read`, SHALL be shown once, and SHALL stop working when revoked.

#### Scenario: Default scope
- **WHEN** the user creates an agent token without naming scopes
- **THEN** the token carries only `read`

#### Scenario: Revoked token
- **WHEN** an agent calls `/mcp` with a token the user revoked
- **THEN** the hub answers 401 and runs nothing

### Requirement: An MCP server per user
The hub SHALL serve MCP over Streamable HTTP at `/mcp`. It SHALL resolve every request to the token's user, and SHALL list and run only the tools the token's scopes allow: `ask_lente`, `search_meetings`, `get_meeting`, `list_projects` and `list_tasks` with `read`, and `create_task`, `update_task` and `complete_task` with `tasks.write`.

#### Scenario: Read-only token
- **WHEN** a token with only `read` asks for `tools/list`
- **THEN** the list has no `create_task`, `update_task` or `complete_task`, and calling one returns the `unauthorized` error

#### Scenario: Another user's data
- **WHEN** Alice's token calls `list_tasks` or `get_meeting` with the id of one of Bob's meetings
- **THEN** it gets only Alice's tasks, and `not_found` for Bob's meeting

#### Scenario: Current and older clients
- **WHEN** a client of revision 2026-07-28 calls a tool, or an older client opens with `initialize`
- **THEN** both get answers in their own revision

### Requirement: Tool errors with a code
A failed tool call SHALL return an error result with one of the codes `unauthorized`, `not_found`, `rate_limited` or `paused_by_wearer`.

#### Scenario: Agents paused
- **WHEN** the user paused agents and an agent calls `list_tasks`
- **THEN** it gets `paused_by_wearer` and reads nothing

### Requirement: Calls noted without content
Every tool call SHALL add an entry to the user's day naming the tool and the token's label, with a fixed sentence and none of the question, arguments or answer.

#### Scenario: Agent reads the tasks
- **WHEN** an agent calls `list_tasks`
- **THEN** the day shows "Un agente consultó tus tareas" with the token's label

### Requirement: A CLI for scripts
`scripts/lente.ts` SHALL offer `ask`, `tasks`, `task add` and `task done` over `/mcp` with `LENTE_HUB` and `LENTE_TOKEN`. With `--json` it SHALL print one JSON document on stdout and errors on stderr. It SHALL exit with 2 without permission, 3 on a hub error and 5 when something is not found.

#### Scenario: Not found
- **WHEN** `lente task done <unknown id> --json` runs
- **THEN** it prints nothing on stdout, the error on stderr, and exits with 5
