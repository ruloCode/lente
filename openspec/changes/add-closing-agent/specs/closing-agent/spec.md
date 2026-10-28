# Spec Delta

## Purpose

Turning a finished meeting into done work: the follow-up email, the tasks and the reminders, prepared by an agent and approved by the wearer.

## ADDED Requirements

### Requirement: Plan actions when a meeting ends
After a meeting's notes are extracted, the agent SHALL propose follow-up actions using only these tools: draft an email, create a task, create a reminder, and any MCP tools the wearer enabled. Each proposal SHALL name the tool, its arguments and its evidence.

#### Scenario: Commitments become tasks
- **WHEN** a meeting record lists two commitments owned by the wearer
- **THEN** the agent proposes two tasks with the due dates from the record

#### Scenario: Follow-up email
- **WHEN** the meeting had decisions and other participants
- **THEN** the agent proposes one email draft in clear English summarizing decisions and next steps

### Requirement: Bounded autonomy
The agent SHALL stop after at most eight model steps per meeting, SHALL never call a tool that changes anything outside the hub before approval, and SHALL report when it stopped early.

#### Scenario: Step limit
- **WHEN** the agent reaches eight steps without finishing
- **THEN** it stops, keeps the proposals made so far, and the trace says why it stopped

### Requirement: Run approved actions
When the wearer approves an action, the hub SHALL run it with the approved arguments and record the result; a failed action SHALL be reported on the phone with the reason and left for retry.

#### Scenario: Task created
- **WHEN** the wearer approves a task
- **THEN** it appears in the task list with a link back to the meeting

#### Scenario: External tool fails
- **WHEN** an MCP tool returns an error
- **THEN** the action card shows the error and a Retry button
