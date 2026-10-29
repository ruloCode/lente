# Spec Delta

## Purpose

Building ready nodes of Lente in Claude Managed Agents sessions, held to the same gates as the local auto lane, without giving the cloud secrets, hardware or write access.

## ADDED Requirements

### Requirement: Only bench-free nodes go to the cloud
With `--cloud`, the runner SHALL build a node in a Managed Agents session only when the node's open tasks need no clip board, phone, key or person; every other ready node SHALL build locally as before. Nodes SHALL still be built one at a time in build order.

#### Scenario: A node needs the clip
- **WHEN** the next ready node has an open task tagged `[hw]`
- **THEN** it is built by the local builder, and the progress page shows it as local

#### Scenario: A code-only node
- **WHEN** the next ready node has only untagged open tasks
- **THEN** the runner creates a Managed Agents session for it and the progress page shows the session's trace link

### Requirement: The cloud gets read-only code and nothing else
A cloud session SHALL mount the repository at the commit of `origin/main` with a read-only token, in an environment with limited networking (package managers only) and web tools disabled. The session SHALL receive no `.env`, Meta or Baseten keys, Claude Platform key or Wi-Fi secrets. The runner SHALL refuse to start a cloud node while local `main` has commits that are not on `origin/main`.

#### Scenario: Main not pushed
- **WHEN** local `main` is ahead of `origin/main` and `--push` is not set
- **THEN** no session is created and the runner reports "push main first: the cloud builds from GitHub"

### Requirement: Work comes back as a checked patch
The cloud agent SHALL leave its work as one cumulative patch from the base commit and a structured result in `/mnt/session/outputs/`. The runner SHALL apply the patch to the lane worktree only after every touched path passes the guard's write policy and none is a forbidden file (`.env`, `secrets.h`, `data/`, `recordings/`, audio); otherwise the node SHALL fail with the offending paths.

#### Scenario: The patch touches a secret
- **WHEN** a downloaded patch adds `firmware/lente-clip/secrets.h`
- **THEN** nothing is applied and the node fails naming that path

### Requirement: Same gates, same review, same merge
A cloud-built node SHALL go through the same gates, the same fresh read-only review and the same commit and fast-forward as a local node. Failed gates or blocking findings SHALL be sent to the same session as a new message, for at most two fix rounds. The agent's own claims SHALL NOT count as evidence.

#### Scenario: A gate fails after the cloud build
- **WHEN** `pnpm smoke` fails on the applied patch
- **THEN** the failure goes to the same session, the agent returns a new patch, and the runner resets the lane and applies it before running the gates again

### Requirement: Spend is capped per session and per run
Every cloud session SHALL be created with a Managed Agents budget equal to the node budget, in cents. The run budget SHALL count each session's list cost. A session that stops at its budget SHALL fail the node; the runner SHALL NOT raise or remove a budget.

#### Scenario: A session hits its budget
- **WHEN** the session goes idle with `stop_reason` `budget_reached`
- **THEN** the node is recorded as failed with "cloud budget reached", the lane rolls back, and the runner moves on

### Requirement: The Claude Platform key never enters an environment
The runner SHALL read the Claude Platform key from a file outside the repository on each request and send it only as the `x-api-key` header. It SHALL NOT be stored in `.env`, set in `process.env`, passed to a child process, printed or logged. Local Claude Code sessions started by the runner SHALL run without `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` in their environment. The guard SHALL refuse commands that read the key or token files.

#### Scenario: The key file is missing
- **WHEN** `--cloud` is set and the key file does not exist
- **THEN** the runner stops before creating anything and names the expected path, without any key content

#### Scenario: An agent tries to read the key
- **WHEN** a session runs `cat ~/.config/lente/anthropic-cloud.key`
- **THEN** the guard blocks the command with the reason

### Requirement: Agent and environment are created once
A setup command SHALL create the cloud builder agent and its environment only when their ids are not recorded locally, and SHALL update them in place otherwise. Nothing in the lane SHALL archive an agent or environment.

#### Scenario: Setup runs twice
- **WHEN** `pnpm auto:cloud-setup` runs after a successful first run
- **THEN** the existing agent gets a new version and no second agent or environment is created
