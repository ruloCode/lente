# Spec Delta

## ADDED Requirements

### Requirement: Tasks say what they need
A task in `tasks.md` SHALL be able to carry tags for what it needs: `[hw]` (the clip board connected), `[phone]` (the Android phone over adb), `[human]` (a person) and `[key:NAME]` (a non-empty key in `.env`). A change SHALL be able to name the changes it depends on with a `Depends on:` line. Tags SHALL NOT appear in the task text shown on the progress page.

#### Scenario: A task needs a person
- **WHEN** an open task is tagged `[human]`
- **THEN** the auto lane never picks it, and the progress page lists it under "Needs you" with the reason

### Requirement: Ready nodes
A node SHALL be one task group. A change's next node SHALL be ready when every change it depends on is archived or has nothing left but `[human]` tasks, and the bench can run at least one of the group's open tasks. Nodes SHALL be offered in build order.

#### Scenario: The phone is unplugged
- **WHEN** a group's only open tasks are tagged `[phone]` and no phone answers on adb
- **THEN** that group is not ready, and its tasks are held with "phone not connected"

### Requirement: Hard rules are enforced
Every Claude Code session in the repository SHALL run a guard before shell commands and file writes that refuses: printing or copying `.env` or `secrets.h`, `*-contributor` models or contributor mode, force pushes, adding keys, the day record or audio to git, recursive deletes of the home, root, repository or `.git`, and firmware uploads or monitors without the clip's exact port. In the auto lane it SHALL also refuse commits, pushes, merges and rebases, and writes outside the lane's checkout.

#### Scenario: An upload with a glob
- **WHEN** an agent runs `arduino-cli … --upload -p /dev/cu.usbmodem*` while the phone is connected
- **THEN** the call is blocked with the reason, and nothing is flashed

### Requirement: Red code can't finish
A session that changed files under `src/`, `test/` or `scripts/` SHALL NOT end while `pnpm typecheck` or `pnpm test` fails; the failure SHALL be sent back to the agent. Outside the auto lane it SHALL block at most once per stop.

#### Scenario: A test breaks
- **WHEN** the agent tries to finish with a failing test
- **THEN** it receives the failing output and keeps working

### Requirement: Every node is checked by CI's gates and a second model
`pnpm auto` SHALL build one node at a time in its own worktree, then run typecheck, tests, OpenSpec validation, the end-to-end smoke test and, when firmware changed, the firmware builds. A different model (Muse Code, standard mode) SHALL then review the diff. Failed checks or blocking findings SHALL go back to the builder for at most two fix rounds.

#### Scenario: The reviewer finds a bug
- **WHEN** Muse Code reports a blocking issue
- **THEN** the builder gets the issue in a fix round and the gates run again before any commit

### Requirement: Only checked work is merged
The runner SHALL commit only after the gates and the review pass, with each task's evidence and the review verdict in the message, then fast-forward `main`. A node that still fails SHALL be rolled back and skipped for the rest of the run. Spending SHALL stop at the run budget.

#### Scenario: A gate fails twice
- **WHEN** the smoke test still fails after two fix rounds
- **THEN** the lane's changes for that node are discarded, the node is recorded as failed with the reason, and the lane moves to the next ready node

### Requirement: Progress is visible live
The progress page SHALL show, updated as they change, overall and per-change progress, the lane's status, current node, phase, spend and recent tool calls, the ready nodes, the held tasks with reasons, and the lane's merged and failed nodes.

#### Scenario: A task is ticked in the lane
- **WHEN** the builder ticks a task in its worktree
- **THEN** the page shows the tick within a few seconds, without a reload
