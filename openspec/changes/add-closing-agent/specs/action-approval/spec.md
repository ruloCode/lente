# Spec Delta

## Purpose

Keeping the wearer in control: nothing the agent proposes happens until they say so.

## ADDED Requirements

### Requirement: Approve, edit or reject
The phone SHALL show each proposed action as a card with what it will do, its evidence (quoted turns with time and speaker), and Approve, Edit and Reject controls. Editing SHALL change the arguments before approval.

#### Scenario: Edit the email
- **WHEN** the wearer edits the draft's text and approves
- **THEN** the edited text, not the original, is what the action uses

#### Scenario: Reject
- **WHEN** the wearer rejects an action
- **THEN** it never runs and the trace records the rejection

### Requirement: Nothing runs unapproved
No action that creates, sends or changes anything outside the hub's own proposal list SHALL run without an explicit approval for that specific action.

#### Scenario: Hub restarts with pending actions
- **WHEN** the hub restarts while actions are pending
- **THEN** they remain pending and none runs on its own

### Requirement: Task list on the phone
Acciones SHALL list the wearer's tasks in two groups, Pendientes and Hechas, each with a count. A task SHALL show its text, its due hint when it has one, and a chip for the meeting it came from that opens the meeting at the cited turn. Tapping its checkbox SHALL move it between the groups, and the change SHALL survive a hub restart.

#### Scenario: Finish a task
- **WHEN** the wearer checks a pending task
- **THEN** it moves to Hechas, struck through, and stays there after the hub restarts
