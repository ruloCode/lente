# Proposal

## Why

The hub runs on the author's laptop, so the glasses only work on the same Wi-Fi as a laptop that is awake. Hosting the hub in the cloud lets the clip work from a phone hotspot anywhere, lets judges open the live product, and is where Modal's credits go.

## What Changes

- The hub runs as an always-on service on Modal with persistent storage for the day record, memory and traces, and secrets kept in Modal.
- The clip can reach the hub over a secure WebSocket that carries exactly the same frames as the local TCP link (one code path, two transports).
- Each clip authenticates with its own device token; the phone pairs with the hub through a short code shown on the hub and is remembered afterwards.
- A health endpoint reports transcription, model and storage status.

Out of scope before 2026-11-04: multiple wearers per hub, user accounts, autoscaling.

Meta models: unchanged; the cloud hub calls the same APIs.

Privacy: data at rest moves from the laptop to a private Modal volume; TLS everywhere outside the LAN; the README states where data lives.

## Capabilities

### New Capabilities
- `hub-hosting`: running the hub as a secure, always-on cloud service.

### Modified Capabilities
- `clip-link`: a secure WebSocket transport alongside TCP, and per-device authentication.
- `companion-app`: pairing the phone with a hub.

## Impact

- A Modal deployment definition, a WebSocket server path in the hub (dependency-free RFC 6455 or a justified dependency), firmware WebSocket client over TLS, pairing UI.
- Depends on `harden-clip-protocol` (the message layer reused over WebSocket).
