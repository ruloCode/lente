# Modal: the cloud hub

What Lente relies on when the hub runs on Modal (`deploy/modal/hub.py`), from the docs at `https://modal.com/docs/guide/webhooks` and `/webhook-timeouts` and from runs against the deployed hub on 2026-10-31. Anything not tried is marked **unverified**.

## Shape

- `@modal.web_server(8080)` runs `node src/pilot.ts` with `LENTE_CLOUD=1`; Modal terminates TLS at `https://<workspace>--lente-hub-hub.us-east.modal.run` and forwards plain HTTP to the container. The hub needs no TLS code and no WebSocket package: its own upgrade handshake and framing (`src/websocket.ts`) work behind the proxy.
- The hub keeps the clip, the phone and the session in memory, so exactly one container: `min_containers=1`, `max_containers=1`, `@modal.concurrent(max_inputs=100)` (each WebSocket and each event stream holds one input), `timeout` one day.
- `cpu=0.25`, `memory=512` (MiB): a request, not a cap. **Unverified:** cost per day at this size; check the Modal dashboard after a day.
- Image: `node:22-slim` with Python added (Modal's runtime needs it); only `package.json`, `src/` and `scripts/hub-token.ts` are copied (no runtime dependencies to install).
- The module is imported again inside the container as `/root/hub.py`, where the repo is not around: local paths are resolved only when `modal.is_local()`.

## Secrets and data

- `node --env-file=.env deploy/modal/secret.ts` writes the Modal secret `lente-hub` with only the variables the hub reads (`MODEL_API_KEY`, the Baseten and ElevenLabs ones when set), through a mode-600 temp file deleted right after. The Modal token and the auto lane's keys stay on the laptop.
- Volume `lente-data` mounted at `/data` (`PILOT_DATA_DIR`): day record, memory, traces, device tokens, paired phones. Modal commits it in the background; no code calls `commit()`.
- **Survives a restart (measured):** after `modal app stop` and a fresh `modal deploy` (new container id), the clip token issued before is listed and the phone session cookie issued before still opens `/` (200).
- A redeploy with no changes keeps the running container (the same id for two minutes after); stop the app first to test a real restart.

## Long-lived connections (measured 2026-10-31)

The docs set a 150 s maximum for HTTP requests and do not say whether it covers streams. It does not cut them:

- One WebSocket from the clip emulator (`scripts/fake-clip.ts --ws --tls`) held 30 min with no reconnect, idle the whole time (the hub starts paused, so the clip sent no audio and no pings).
- One event stream (`/events`) held the same 30 min: 120 keep-alive comments, one every 15 s, no reconnect.
- The firmware still pings every 20 s on a cloud hub, for NAT on phone hotspots.

## Operating

- Deploy: `modal deploy deploy/modal/hub.py`. Logs: `modal app logs lente-hub` (the pairing code is printed at start and valid 10 minutes).
- Clip token, on the volume: `modal container exec <id> env PILOT_DATA_DIR=/data node /app/scripts/hub-token.ts add <name>` (`modal container list --json` gives the id). The hub picks it up without a restart.
- A new pairing code needs a restart (`modal app stop lente-hub` then deploy): the hub prints one only at start.
- Plain `http://` to the Modal URL: **unverified** whether Modal's edge redirects it before the hub sees it; the hub redirects any request marked `x-forwarded-proto: http`.
