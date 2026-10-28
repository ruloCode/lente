# Spec Delta

## ADDED Requirements

### Requirement: WebSocket transport
The hub SHALL accept clips over a secure WebSocket in addition to TCP, carrying the same frames as binary messages, with identical behavior for both transports.

#### Scenario: Clip on a phone hotspot
- **WHEN** the clip connects to the cloud hub over WebSocket through a phone hotspot
- **THEN** audio, photos and commands work exactly as on the local TCP link

### Requirement: Per-device authentication
Each clip SHALL present its device token when connecting; the hub SHALL refuse unknown or revoked tokens.

#### Scenario: Unknown device
- **WHEN** a client connects with a token the hub does not know
- **THEN** the connection is closed before any audio is accepted
