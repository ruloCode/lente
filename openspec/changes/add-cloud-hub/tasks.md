# Tasks

## 1. Spike

- [ ] 1.1 On Modal: a Node container with a WebSocket echo and an SSE stream held open 30 minutes, plus a volume surviving a redeploy; record findings in docs/kb and decide decisions 2 and 3

## 2. Hub

- [ ] 2.1 WebSocket transport carrying the same frames; unit tests for framing and an emulator run over WebSocket (`pnpm test`)
- [ ] 2.2 Device tokens and phone pairing code; tests for unknown and revoked tokens and an unpaired browser
- [ ] 2.3 Health endpoint; verify it reports a broken key without exposing content
- [ ] 2.4 Deploy with secrets and a volume; verify data survives a redeploy

## 3. Clip

- [ ] 3.1 Firmware WebSocket-over-TLS build pointing at the cloud hub; verify 30 minutes of streaming from a phone hotspot
- [ ] 3.2 Measure clip→hub latency LAN vs cloud and record it in docs/benchmarks.md
