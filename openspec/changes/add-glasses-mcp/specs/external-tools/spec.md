# Spec Delta

## Purpose

Letting Lente's own agent act in the wearer's tools through MCP servers they choose.

## ADDED Requirements

### Requirement: Configured servers only
The hub SHALL connect only to MCP servers listed in its configuration, each with its URL and key, and SHALL list their tools at startup.

#### Scenario: Server unreachable
- **WHEN** a configured server does not answer at startup
- **THEN** the hub logs it, continues without its tools, and retries later

### Requirement: External tools need approval
Tools from external servers SHALL be offered to the closing agent only as proposals that run after the wearer approves them.

#### Scenario: Create a ticket
- **WHEN** the agent wants to create a ticket in a configured tracker
- **THEN** the wearer sees the proposal first and the ticket is created only after approval
