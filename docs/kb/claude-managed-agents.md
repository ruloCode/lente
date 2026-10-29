# Claude Managed Agents (for the cloud lane)

Claude Managed Agents runs an agent loop on Anthropic's side with a sandbox container per session. Lente uses it **only to build Lente** (the auto lane, `add-cloud-auto-lane`), never inside the product: the product runs on Meta's models (see [hackathon.md](hackathon.md)).

Source: the official docs at `https://platform.claude.com/docs/en/managed-agents/*.md` (append `.md` to any page for Markdown). Checked 2026-10-28; anything not yet tried against a real call from this repo is marked **unverified**.

## The key: hard rule

- The Claude Platform key lives in a file outside the repo, `~/.config/lente/anthropic-cloud.key` (mode 600), or the path in `LENTE_CLOUD_KEY_FILE`. The owner's existing file can be linked there.
- **Never in `.env`, never in `process.env`, never in a child process's environment.** The auto lane spawns `claude` (Claude Code); if `ANTHROPIC_API_KEY` is in its environment, Claude Code bills the API credit instead of the owner's plan. The runner reads the file per request and puts it only in the `x-api-key` header.
- Never print it, never paste it into a chat, a log, a commit or a session event. The guard hook refuses commands that read the key file.
- The key that was pasted into a chat on 2026-10-28 must be rotated in the Console (create a new one, write it into the file, revoke the old one).
- Workspace: "Build Day Fable 5.1", with the workshop credit (USD 50, reported by the owner; check the balance in the Console). Every session carries a budget, so the lane cannot drain it.

## HTTP surface

Base `https://api.anthropic.com/v1`. Every request: `x-api-key: <key>`, `anthropic-version: 2023-06-01`, `anthropic-beta: managed-agents-2026-04-01`, `content-type: application/json`. Lente calls it with `fetch` (no SDK: zero runtime dependencies).

| Call | Use in the lane |
|---|---|
| `POST /agents`, `POST /agents/{id}` | Create the builder **once**; later changes update it in place (each update is a new version). Never create one per run. |
| `POST /environments`, `POST /environments/{id}` | Create the sandbox template once (names are unique: a second create with the same name is 409). |
| `POST /sessions` | One session per node: `{agent, environment_id, resources, budget, title, metadata}`. |
| `POST /sessions/{id}/events` | Send `{"events":[{"type":"user.message","content":[{"type":"text","text":"…"}]}]}`: the first prompt and each fix round. |
| `GET /sessions/{id}/events/stream` | SSE of what the agent does. No replay: on every (re)connect, open the stream, then `GET /sessions/{id}/events` and dedupe by event `id`. |
| `GET /sessions/{id}` | Status and `usage` (list cost). |
| `GET /files?scope_id={session_id}` + `GET /files/{id}/content` | Download what the agent wrote to `/mnt/session/outputs/` (1–3 s indexing lag after idle; retry). Needs the beta header. |
| `POST /sessions/{id}/archive` | Read-only, **irreversible**. Archiving an agent or environment is also irreversible and stops new sessions from using it: only with the owner's OK. |

Objects and fields used:

- **Agent:** `name`, `model` (`"claude-opus-5-5"` or `{id, effort}`), `system`, `tools: [{type: "agent_toolset_20260401", default_config: {enabled: true, permission_policy: {type: "always_allow"}}, configs: [{name: "web_search", enabled: false}, {name: "web_fetch", enabled: false}]}]`. Skills in the mounted repo's root `.claude/skills/<name>/` load automatically at session start.
- **Environment:** `{name, config: {type: "cloud", networking: {type: "limited", allow_package_managers: true, allowed_hosts: []}}}`. `limited` is deny-by-default; package managers (npm) are opted in for `pnpm install`.
- **Repository resource:** `{type: "github_repository", url, authorization_token, checkout: {type: "commit", sha}}`, cloned to `/workspace/<repo>` before the agent starts. The token never enters the container (an Anthropic-side git proxy injects it). A fine-grained token with `Contents: Read` clones only; the lane never gives the cloud a write token.
- **Budget:** `{type: "limit", max_list_cost: {amount: "600", currency: "USD"}}`. `amount` is an integer string in **cents**. At the cap the session goes `idle` with `stop_reason.type: "budget_reached"` (not terminated); a new `user.message` is then a 400 until the budget is raised. Create-only: a session made without a budget can never get one.
- **Session status:** `rescheduling → running ↔ idle → terminated`. On `session.status_idle`, `stop_reason.type` is `end_turn` (done; also after an interrupt), `requires_action` (waiting on a tool confirmation; does not happen with `always_allow`) or `budget_reached`. Errors arrive as `session.error` events. `terminated` alone does not mean failure: fetch the session.
- **Cost:** model tokens at list price + USD 0.08 per session-hour running. `session.usage` carries the cumulative list cost.
- **Trace:** `https://platform.claude.com/workspaces/{workspace_id}/sessions/{session_id}` (the workspace id comes from the Console URL; the API does not return it).

## Unverified

- The cloud sandbox's Node and pnpm versions (Lente needs Node 22.18+ for native TypeScript). Check with one session before the first node; record the answer here.
- Time for `pnpm install && pnpm test` in a fresh sandbox, and whether repository caching makes the second session faster.
