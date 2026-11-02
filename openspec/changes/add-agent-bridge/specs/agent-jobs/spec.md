# Spec Delta

## Purpose

Letting Lente hand work to the user's coding agents (Claude Code, Codex) on their own machine, only after the user approves it.

## ADDED Requirements

### Requirement: Jobs wait for approval
The hub SHALL queue a job for `claude` or `codex` from a task or an instruction as a pending action in "Por aprobar", and SHALL make it available to the bridge only after the user approves it.

#### Scenario: Unapproved job
- **WHEN** a job is pending or was rejected
- **THEN** the bridge never sees it and nothing runs

#### Scenario: From a task
- **WHEN** the user taps "Que lo haga un agente" on a task Lente can do
- **THEN** a job with the task's title waits in "Por aprobar"

### Requirement: The chat proposes a job
When the user asks Lente in the chat to have something done ("haz…", "ejecuta…", "que Claude…"), `/ask` SHALL queue the job and say it waits for approval, instead of answering from the memory.

#### Scenario: Ask Claude to do something
- **WHEN** the user writes "Que Claude actualice el README con los comandos nuevos"
- **THEN** a Claude job with that instruction waits in "Por aprobar" and the answer says so

#### Scenario: A plain question
- **WHEN** the user asks "¿Qué quedó con Ana?"
- **THEN** no job is created

### Requirement: The bridge runs approved jobs safely
The bridge SHALL run one approved job at a time with the most restrictive mode each agent CLI offers, only in a folder from its local allow list, with no keys in the agent's environment, and SHALL stop a job after 15 minutes.

#### Scenario: Folder outside the list
- **WHEN** an approved job names a folder that is not in the bridge's list
- **THEN** the job fails without running the agent

#### Scenario: Timeout
- **WHEN** an agent runs for more than 15 minutes
- **THEN** the bridge stops it and reports the job as failed

### Requirement: Results come back to Lente
The bridge SHALL post a summary of at most 2,000 characters and the exit code. The hub SHALL mark the job's task done only when the exit code is 0.

#### Scenario: Agent fails
- **WHEN** the agent exits with code 1
- **THEN** the job shows as failed with its summary and the task stays open
