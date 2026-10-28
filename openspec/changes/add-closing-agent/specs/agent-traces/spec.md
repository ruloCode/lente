# Spec Delta

## Purpose

Making every agent decision auditable: what it saw, what it called, what came back, and why.

## ADDED Requirements

### Requirement: Step-by-step trace
For every agent run the hub SHALL record each step in order: the model call (model, reasoning effort, token usage, latency), each tool call with arguments and result, approvals and rejections, and the reason the run ended.

#### Scenario: Inspect a run
- **WHEN** the wearer opens the trace of a meeting's agent run
- **THEN** they see every step in order with its timing and outcome

### Requirement: Evidence links
Every proposed action SHALL link to at least one turn id from the meeting; a proposal without valid evidence SHALL be dropped and counted in the trace.

#### Scenario: Ungrounded proposal
- **WHEN** the model proposes a task that cites no existing turn
- **THEN** the proposal is not shown and the trace records it as dropped

### Requirement: Traces stay local and text-only
Traces SHALL be stored as text on the hub, never include audio or images, and be deletable with the meeting they belong to.

#### Scenario: Delete the meeting
- **WHEN** the wearer deletes a meeting
- **THEN** its traces are deleted too
