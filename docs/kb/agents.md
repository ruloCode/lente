# Agents: MCP, the CLI and the bridge

How the user's own agents reach Lente (`add-agent-bridge`), and how Lente hands them work. Every command line below was run on 2026-11-02 unless it says otherwise.

## The token

An agent token is a device of kind `mcp`. Each one belongs to one user and carries scopes:

| Scope | What it opens | Default |
|---|---|---|
| `read` | `ask_lente`, `search_meetings`, `get_meeting`, `list_projects`, `list_tasks` | yes |
| `tasks.write` | `create_task`, `update_task`, `complete_task` | only when asked |
| `agent.run` | the bridge: the queue of approved jobs and their results; no MCP tools | only when asked |

- **In the app:** Ajustes → Cuenta → Dispositivos. Choose **Tipo: Agente**, then what it **Puede** do: "Leer", "Leer y tareas" or "Puente". Name it and tap "Nuevo token". The token is shown once. Revoking it there makes the hub answer 401 from the next request.
- **From a script:** `POST /devices {"kind": "mcp", "label": "Claude Code", "scopes": ["read", "tasks.write"]}`, with a signed-in user's credentials, answers 201 with the token. An unknown scope is a 400. On a laptop hub (no accounts) the same route makes agent tokens for the owner.
- **Pausing agents:** the wearer can turn every agent off without revoking anything. `POST /agents/pause` makes each tool answer `paused_by_wearer` until `POST /agents/resume`.

The token is a password: keep it in your agent's config or in `LENTE_TOKEN`, never in the repository.

## Connecting an agent

The hub serves MCP at `<hub>/mcp` over Streamable HTTP. It speaks revision 2026-07-28 and the `initialize`-based revisions 2025-11-25, 2025-06-18 and 2025-03-26.

### Claude Code

```sh
claude mcp add --transport http lente https://<hub>/mcp --header "Authorization: Bearer <token>"
claude mcp list   # lente: https://<hub>/mcp (HTTP) - ✔ Connected
```

Tested with Claude Code 2.1.316 against a local hub (`http://localhost:8181/mcp`):
- `claude mcp list` showed "✔ Connected". Claude Code speaks the current revision: the hub logged `server/discover` and `tools/list`, with no `initialize`.
- A headless session (`claude -p --allowedTools "mcp__lente__list_tasks mcp__lente__create_task" -- "…"`) called `list_tasks`, then `create_task`. It took 12 s end to end; each call took 1–2 ms on the hub.
- The day then showed "Un agente consultó tus tareas" and "Un agente creó una tarea", labelled "Claude Code".

Add `-s user` to have Lente in every project.

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project), with the token in your environment. The format is from Cursor's MCP docs; it was not run here:

```json
{
  "mcpServers": {
    "lente": {
      "url": "https://<hub>/mcp",
      "headers": { "Authorization": "Bearer ${env:LENTE_TOKEN}" }
    }
  }
}
```

### Codex

`~/.codex/config.toml`. The keys are from OpenAI's Codex MCP docs; it was not run here, because Codex is not installed on the bench. Codex reads the token from the variable it names:

```toml
[mcp_servers.lente]
url = "https://<hub>/mcp"
bearer_token_env_var = "LENTE_TOKEN"
```

## The tools

| Tool | Scope | Arguments | Returns |
|---|---|---|---|
| `ask_lente` | read | `question`, `project?` (id or name) | `{answer, found, sources: [{label, meetingId}]}`, from Muse Spark 1.3 over the memory |
| `search_meetings` | read | `query`, `from?`, `to?` (local days, `YYYY-MM-DD`, inclusive) | `{meetings: [{id, title, startedAt, matches}]}` |
| `get_meeting` | read | `id`, `max_chars?` (200–50,000, default 8,000) | title, dates, project, notes, and the transcript cut at `max_chars` with `truncated` |
| `list_projects` | read | — | `{projects}` with meetings, open tasks and the next task |
| `list_tasks` | read | `who?` (`me`, `lente`, `other`), `project?`, `open?` (default true) | `{tasks}` |
| `create_task` | tasks.write | `title`, `who?` (default `me`), `other_name?`, `due?` | `{task}` |
| `update_task` | tasks.write | `id`, `title?`, `who?`, `other_name?` | `{task}` |
| `complete_task` | tasks.write | `id` | `{task}` |

- Answers are `structuredContent`, with the same JSON as text.
- A failed tool call is a result with `isError: true` and `structuredContent.error` set to one of:
  - `unauthorized`: the token lacks the scope;
  - `not_found`;
  - `rate_limited`: more than 60 calls a minute per token;
  - `paused_by_wearer`;
  - `invalid_arguments`;
  - `unavailable`: no model on the hub.
- A missing, unknown or revoked token is HTTP 401 before any of that.
- `ask_lente` never queues a job, even when asked to "do" something: only the user, in the chat or on a task, can propose one.

## The CLI

`scripts/lente.ts` has no dependencies and sends one MCP tool call per command:

```sh
export LENTE_HUB=https://<hub> LENTE_TOKEN=<token>
node scripts/lente.ts ask "¿Qué quedó con Ana?" [--project Lente]
node scripts/lente.ts tasks [--who lente] [--project Lente] [--all]
node scripts/lente.ts task add "Enviar la cotización" --who me|lente|other [--other Ana] [--due viernes]
node scripts/lente.ts task done <id>
```

- With `--json`, stdout carries exactly one JSON document, the tool's `structuredContent`. Errors always go to stderr, as JSON with `--json`.
- Exit codes:

| Code | Meaning |
|---|---|
| 0 | done |
| 1 | bad usage or bad arguments |
| 2 | no permission (no token, unknown or revoked token, missing scope) |
| 3 | hub error (unreachable, `rate_limited`, `paused_by_wearer`, `unavailable`) |
| 5 | not found |

## Jobs and the bridge

Lente can hand work to Claude Code or Codex on the user's computer. Nothing runs until the user approves it.

### Where a job comes from

- **A task:** "Que lo haga un agente" on a task Lente can do (`who: lente`).
- **The chat:** "Que Claude actualice el README", "Ejecuta los tests", by voice or text. Muse Spark marks it a command, and the hub accepts that only when the sentence asks for action. The chat then answers "Lo dejé en «Por aprobar»: Claude Code hará «…»".
- **The API:** `POST /agent/jobs {instruction | taskId, agent: "claude"|"codex", workdir?}`, as the user.

Each job waits in Acciones → "Por aprobar" as "Que lo haga un agente", with its agent, instruction and folder; all three can be edited before approving. Rejecting it ends it.

### Running the bridge

1. Make a token with "Puente" (scope `agent.run`).
2. Write `~/.config/lente/agents.json`. It is outside the repo and never in `.env`:

   ```json
   {
     "hub": "https://<hub>",
     "folders": { "lente": "~/dev/lente", "site": "~/dev/site" },
     "default": "lente"
   }
   ```

   A job's folder must be one of these, by name or by exact path; anything else fails without running. `/` and your home folder are refused. Optional keys:
   - `commands`, to name the `claude` and `codex` executables;
   - `timeoutMs`, which is at most 15 minutes, and that is the default.
3. Run it:

   ```sh
   LENTE_TOKEN=<puente token> node scripts/agent-bridge.ts
   ```

   It follows `GET /events`, which for this token carries only the queue of approved jobs. It claims one job at a time, runs it, and posts the result. `--once` exits after one job.

### What it runs

| Agent | Command (in the job's folder) | Why it is the most restrictive that still works |
|---|---|---|
| Claude Code | `claude -p --restricted --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --no-session-persistence --disallowedTools WebSearch --output-format text -- <instruction>` | `--restricted` removes Bash, the other code-running tools and WebFetch, and confines file tools to the folder; `acceptEdits` lets it edit there; anything else that would prompt is denied; no MCP servers, no web search, no saved session. Flags from `claude --help` 2.1.316 |
| Codex | `codex exec --sandbox workspace-write --cd <folder> --ephemeral --output-last-message <file> -- <instruction>` | `workspace-write` writes only in the folder and keeps the network off by default; `--ephemeral` saves no session. Flags from OpenAI's Codex CLI reference; not run here |

- **Environment:** the agent gets only `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TERM` and `TMPDIR`. Neither `LENTE_TOKEN` nor any API key or other token is passed on. Claude Code and Codex use their own sign-in, kept in your home folder.
- **Timeout:** 15 minutes, then `SIGTERM` and `SIGKILL` 5 s later. The job is reported as failed with exit 124.
- **Result:**
  - the last 2,000 characters of the agent's final message (Claude Code's output, Codex's last message), with the end of stderr on failure;
  - exit 0 marks the job done and its task done;
  - any other exit marks the job failed and leaves the task open;
  - a refused folder reports exit 126 without running anything.

Tested on 2026-11-02 with a local hub, real Claude Code 2.1.316 and a scratch folder:
- The folder stayed empty while the job waited for approval.
- After approval the bridge ran it in 4 s with exit 0: `PROBE.md` held `PROBE-OK`, and the summary "I created `PROBE.md` in the working directory…" came back to the job.

### Trying it with a real task

1. Start the bridge as above, with `default` pointing at a scratch git repository.
2. In the app, add a task "Crear un README con una línea" marked "Lente puede hacerlo", and tap "Que lo haga un agente".
3. In Acciones → "Por aprobar", check the instruction and approve it.
4. The bridge logs `job … · claude in <folder> · exit 0`. The task moves to "Hechas", and the folder has the README.
