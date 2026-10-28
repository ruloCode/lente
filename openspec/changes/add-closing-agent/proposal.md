# Proposal

## Why

A meeting's value is lost in the hour after it ends: the follow-up email nobody writes, the task nobody files. For someone working in a second language, writing that email well is the hardest part. An agent that does the work, shows the evidence for each action and waits for approval is the strongest "agentic" story Lente can tell, and the Best Agentic Use-Case bonus rewards exactly autonomy, effectiveness and practical usefulness.

## What Changes

- When a meeting ends, an agent built on Muse Spark 1.3 tool calling plans follow-up actions from the meeting record: draft the follow-up email in good English, create tasks for the wearer's commitments, and propose a reminder before each due date.
- Every proposed action carries its evidence (the turns and timestamps it relies on) and its full trace of model and tool steps.
- Nothing leaves the hub without the wearer's approval on the phone; the wearer can approve, edit or reject each action.
- Approved actions run through tools: a local task list and calendar file out of the box, and external tools (for example Linear or a calendar) through MCP servers when the wearer configures them.

Out of scope before 2026-11-04: sending email on the wearer's behalf (the agent drafts; the wearer copies or opens it in their mail app), multi-meeting planning, autonomous actions without approval.

Meta models: Muse Spark 1.3 (function calling, structured output). Optional: Muse Wonder for long meetings, measured against Spark first.

Privacy: actions are proposed from local memory; external tools receive only the approved action's content.

## Capabilities

### New Capabilities
- `closing-agent`: planning and running follow-up actions after a meeting.
- `action-approval`: the wearer's approve / edit / reject step for every action.
- `agent-traces`: a step-by-step, evidence-linked record of what the agent did and why.

### Modified Capabilities
<!-- none -->

## Impact

- New hub agent loop module (tool registry, loop with step limit, trace writer) and tools; traces in `data/traces/` (git-ignored).
- Phone page: an "After the meeting" view with action cards (Approve / Edit / Reject) and a trace viewer.
- Depends on `add-meeting-memory` for the meeting record. External tools reuse the MCP client planned with `add-glasses-mcp`.
