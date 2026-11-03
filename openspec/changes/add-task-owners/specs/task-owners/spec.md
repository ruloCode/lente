# Spec Delta

## Purpose

Letting the wearer manage the tasks that come out of their meetings, and see who does each one.

## ADDED Requirements

### Requirement: Tasks with an owner from every meeting
After a meeting's notes, Lente SHALL create up to eight concrete tasks from the summary, decisions and commitments, each marked as the wearer's, Lente's (only what its tools can do) or someone else's.

#### Scenario: A meeting with commitments
- **WHEN** the wearer promised to send a quote and Ana promised to review the contract
- **THEN** "Enviar la cotización" is the wearer's task and "Revisar el contrato" waits on Ana

#### Scenario: Something Lente can do
- **WHEN** a commitment is to send a follow-up email
- **THEN** the task is marked as one Lente can do

### Requirement: Managing tasks
The wearer SHALL see open tasks grouped by who does them, with their project, and SHALL be able to add a task, change who does it, mark it done, and delete it.

#### Scenario: Reassigning a task
- **WHEN** the wearer moves a task from "Lente puede hacerlo" to "Te toca"
- **THEN** it shows under "Te toca" and counts on its project card
