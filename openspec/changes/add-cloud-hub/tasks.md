# Tasks

Depends on: `add-phone-capture`

## 1. Spike

- [ ] 1.1 On Modal: a Node container with a WebSocket echo and an SSE stream held open 30 minutes, plus a volume surviving a redeploy; record findings in docs/kb and decide decisions 2 and 3 [key:MODAL_TOKEN_ID]

## 2. Hub

- [x] 2.1 WebSocket transport carrying the same frames; unit tests for framing and an emulator run over WebSocket (`pnpm test`)
- [x] 2.2 Device tokens and phone pairing code; tests for unknown and revoked tokens and an unpaired browser
- [x] 2.3 Health endpoint; verify it reports a broken key without exposing content
- [ ] 2.5 The hub's access gate has automated tests: with auth on, the web routes and the `/device` upgrade answer 401 or 403 without a valid token or session, `/health` stays reachable and exposes no content, and with auth off nothing changes; extract the gate into a pure function if the handler can't be tested directly (`pnpm test`)
- [ ] 2.4 Deploy with secrets and a volume; verify data survives a redeploy [key:MODAL_TOKEN_ID]

## 3. Clip

- [ ] 3.1 Firmware WebSocket-over-TLS build pointing at the cloud hub; verify 30 minutes of streaming from a phone hotspot [hw] [human]
- [ ] 3.2 Measure clip→hub latency LAN vs cloud and record it in docs/benchmarks.md [hw] [key:MODAL_TOKEN_ID]
