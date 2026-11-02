# Proposal

Depends on: `add-projects`

## Why

The owner has no tasks, for two reasons:
- Tasks exist only when the closing agent proposes one and he approves it.
- The 119 meetings imported from hermes never went through that agent, and hermes stored no commitments.

He wants to manage his tasks, and to see which ones he must do himself, which ones an agent can do for him, and which ones wait on someone else.

## What Changes

- **Every task says who does it:**
  - `me`: the wearer.
  - `lente`: something Lente's agent can do with its tools: draft an email, set a reminder, prepare a summary or briefing from the memory.
  - `other`: someone else committed to it; the wearer only follows up.
- **Tasks come from every finished meeting.** After the notes, one structured Muse Spark call turns the summary, commitments and decisions into at most eight tasks, each with its owner. They land as tasks directly: a task is a list entry, and nothing is done without approval. The closing agent's approval flow stays for actions.
- **Managing tasks on the phone.** Tareas groups open tasks into "Te toca", "Lente puede hacerlo" and "Esperando a otros", shows each task's project, and lets the wearer:
  - add a task by hand;
  - change who does a task;
  - mark a task done;
  - delete a task.

  Project cards count only the wearer's and Lente's tasks.
- **Backfill for the imported meetings.** `scripts/extract-tasks.ts --email [--days 30] [--dry-run]` runs the same extraction on meetings without tasks. It covers only the last `--days` days, so year-old commitments do not flood the list.
- **Next (group 2, not in this pass):** "Que lo haga Lente" on a `lente` task asks the closing agent for a draft or reminder, which waits for approval like any action.

Meta models: Muse Spark 1.3 with structured output extracts the tasks from a meeting's notes.

Privacy: task text stays sealed; `who` lives inside the sealed body.

## Capabilities

### New Capabilities
- `task-owners`: tasks from every meeting, each with who does it, managed on the phone.
