# Spec Delta

## Purpose

Letting any MCP-capable agent use the wearer's glasses and memory as tools, visibly and within the wearer's consent settings.

## ADDED Requirements

### Requirement: Authenticated MCP endpoint
The hub SHALL serve an MCP server over Streamable HTTP at `/mcp` and SHALL reject any request without the configured bearer key.

#### Scenario: Missing key
- **WHEN** a client calls `/mcp` without the key
- **THEN** the request is rejected with an authentication error and nothing runs

### Requirement: Glasses tools
The server SHALL offer: `look` (take one photo and return its description), `recent_transcript` (text of the last N seconds, at most 600), `buzz` (signal the wearer), `show_card` (put a short card on the phone), `search_memory` (find meetings, commitments and glossary terms by text) and `current_meeting` (title, start time, participants by label).

#### Scenario: Agent asks what was just said
- **WHEN** an agent calls `recent_transcript` with 60 seconds
- **THEN** it receives the turns of the last minute as text with speakers and times

#### Scenario: Agent shows a card
- **WHEN** an agent calls `show_card` with "Remember to ask about the budget"
- **THEN** the card appears on the phone labelled with the calling agent

### Requirement: Consent applies to agents
Tools SHALL respect the wearer's state: `look` SHALL fail while listening is paused, and in mic-only mode unless single photos are allowed; `recent_transcript` SHALL return nothing recorded while paused. Every tool call SHALL appear on the phone timeline with the tool name and the client's name.

#### Scenario: Paused
- **WHEN** an agent calls `look` while the wearer has paused Lente
- **THEN** the call fails with "paused by the wearer" and no photo is taken

#### Scenario: Visible calls
- **WHEN** any tool is called
- **THEN** the timeline shows which tool and which client called it

### Requirement: Text, not raw media
Tools SHALL return text; `look` SHALL return the photo itself only when the wearer has enabled image return.

#### Scenario: Default look
- **WHEN** an agent calls `look` with default settings
- **THEN** it receives a description and no image data
