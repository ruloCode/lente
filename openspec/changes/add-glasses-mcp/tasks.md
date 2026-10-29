# Tasks

Depends on: `add-closing-agent`

## 1. Server

- [ ] 1.1 Confirm the current MCP specification revision and Streamable HTTP rules on modelcontextprotocol.io; note them in docs/kb
- [ ] 1.2 `/mcp` with bearer key, `initialize`, `tools/list`, `tools/call`; unit tests for JSON-RPC handling and auth (`pnpm test`)
- [ ] 1.3 Tools: look, recent_transcript, buzz, show_card, search_memory, current_meeting; unit tests with a fake hub state
- [ ] 1.4 Consent checks and timeline events; tests for paused and mic-only cases
- [ ] 1.5 Verify with the MCP Inspector and with Claude Desktop calling `recent_transcript` and `show_card` on a running hub [human]

## 2. Client

- [ ] 2.1 Configured servers from `.env`, tool listing at startup with retry; verify against a local test server
- [ ] 2.2 External tools enter the closing agent as approval-gated proposals; verify with one approved call
