# Proposal

## Why

Closed glasses keep their senses to themselves. Exposing the clip and the wearer's memory as Model Context Protocol tools lets any agent (Claude, Muse, the wearer's own) look, read what was said, buzz the wearer or put a card in front of them, with the same consent rules Lente applies to itself. MCP is the extension surface instead of a plugin store: the projects we studied either moved their MCP server to hosted Streamable HTTP with a key (Omi) or backed away from cloud-hosted app platforms (MentraOS).

## What Changes

- An MCP server inside the hub, over Streamable HTTP at `/mcp`, protected by a bearer key, exposing: look (one photo described), recent transcript (last N seconds, text only), buzz, show a card, search memory, current meeting.
- Every tool call is visible to the wearer on the phone timeline ("an agent asked to look") and respects the current mode: no looking while paused or in mic-only mode unless the wearer allows single photos.
- An MCP client in the hub so the closing agent can use tools from servers the wearer configures (for example a task tracker or calendar).

Out of scope before 2026-11-04: an app store, OAuth flows for third-party MCP servers (keys from `.env` only), streaming audio over MCP.

Meta models: Muse Spark 1.3 for the look tool's description; the MCP client feeds Muse Spark 1.3 tool calling in the closing agent.

Privacy: tools return text, never raw audio; photos are described, not returned, unless the wearer enables image return; every call is logged and shown.

## Capabilities

### New Capabilities
- `mcp-tools`: the clip and memory as MCP tools for outside agents.
- `external-tools`: Lente's agent using tools from MCP servers the wearer configures.

### Modified Capabilities
<!-- none -->

## Impact

- New hub modules for the MCP server (JSON-RPC over HTTP) and client, a key in `.env`, timeline events for tool calls.
- README: how to connect Claude Desktop or any MCP client to Lente.
