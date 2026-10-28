# Design

## Context

The hub already has HTTP (`node:http`) and the state the tools need (mode, listening, day record, last photo path through the clip). MCP's Streamable HTTP transport is JSON-RPC 2.0 over POST with optional SSE for streaming; tools-only servers need `initialize`, `tools/list` and `tools/call`.

## Goals / Non-Goals

**Goals:**
- A tools-only MCP server any client can use, with consent enforced in the hub, not in prompts.

**Non-Goals:**
- Resources, prompts, sampling or OAuth.

## Decisions

1. **Hand-rolled tools-only server first.** About 150 lines over the existing HTTP server, keeping zero runtime dependencies, validated against the official MCP Inspector. Alternative: the official TypeScript SDK; adopted instead if the Inspector shows protocol gaps we cannot close in an afternoon (record the decision in docs/kb/decisions.md either way).
2. **Protocol version pinned** to the current MCP specification revision at implementation time (verify on modelcontextprotocol.io before coding), declared in `initialize`.
3. **Consent checks live in tool handlers**, using the same state the phone controls, and every call emits a timeline event.
4. **Client mirrors the server** (same JSON-RPC helpers), so tool calling in the closing agent treats local and external tools uniformly, with `effect: "external"` for anything not owned by the hub.

## Risks / Trade-offs

- [Spec drift between revisions] → pin the revision and test with the Inspector and one real client (Claude Desktop).
- [Key leaked] → keys only in `.env`, rotated after the demo; the endpoint binds to the LAN by default and is exposed publicly only with `add-cloud-hub`.
