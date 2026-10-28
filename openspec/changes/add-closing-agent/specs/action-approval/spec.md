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
