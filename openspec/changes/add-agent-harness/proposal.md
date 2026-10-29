# Proposal

## Why

Seven days remain before the deadline and most of the build order is work an agent can do: specs exist, tasks name their verification, and CI already checks what a merge needs. What is missing is the harness that lets an agent carry a task group from "ready" to "merged" with no human in the loop, without breaking the hard rules (no secrets, standard mode only, measured numbers) and without guessing which serial port is the clip. The human should only set intent, unblock what needs hands, and own the irreversible steps.

## What Changes

- **Graph:** tasks carry tags for what they need (`[hw]` clip board, `[phone]` Android phone over adb, `[human]` a person, `[key:NAME]` a key in `.env`), and a change can name `Depends on:` changes. A node is one task group; it is ready when its dependencies are settled and the bench can run at least one of its open tasks.
- **Brakes:** a PreToolUse hook enforces the hard rules for every session in the repo (secrets never printed or committed, no `*-contributor`, no force push, firmware uploads only to the clip's exact port). A Stop hook keeps a session that changed code from finishing while typecheck or tests are red.
- **Auto lane:** `pnpm auto` picks the next ready node in build order, has a headless Claude Code session build it in its own worktree (`auto/lente`), runs CI's checks, has a fresh, read-only Claude Code session review the diff (Meta's models are kept for the product, not for building it), gives the builder up to two fix rounds, then commits with the evidence and fast-forwards `main` (optionally pushing). Failed nodes are rolled back and skipped for the run. A budget caps spend.
- **Bench skill:** `lente-hardware` tells agents how to flash and read the clip, run the hub, drive the phone page over adb and Chrome DevTools, and play test speech.
- **Progress page:** `pnpm progress` (port 7171) shows the lane's live state (node, phase, spend, tool calls), what is ready, what needs the human, and the lane's history.

## Impact

- New: `scripts/auto/` (policy, guard, stop gate, runner), `scripts/progress/` (parser, loader, server, page), `.claude/settings.json`, `.claude/skills/lente-hardware/`.
- Every open `tasks.md` gains tags; `add-cloud-hub`, `add-desktop-mode` and `add-glasses-mcp` gain `Depends on:`.
- No product code changes. The hub, firmware and phone page are untouched.
