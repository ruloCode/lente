# Spec Delta

## Purpose

Running the hub as an always-on, secure cloud service so the glasses work anywhere with internet.

## ADDED Requirements

### Requirement: Always on with persistent data
The cloud hub SHALL stay running without a laptop, SHALL keep the day record, memory and traces on persistent private storage across restarts and deploys, and SHALL read its API keys from the platform's secret store.

#### Scenario: Redeploy
- **WHEN** a new version is deployed
- **THEN** the day record, memory and traces from before are still there

### Requirement: Encrypted outside the LAN
Every connection to the cloud hub (clip, phone, MCP) SHALL use TLS.

#### Scenario: Plain connection
- **WHEN** a client tries to connect without TLS
- **THEN** the connection is refused or redirected to TLS

### Requirement: Health
The hub SHALL expose a health endpoint reporting whether transcription, the configured models and storage are working, without exposing any content.

#### Scenario: Model key revoked
- **WHEN** the Meta key stops working
- **THEN** health reports the model check as failing and the phone shows a note
