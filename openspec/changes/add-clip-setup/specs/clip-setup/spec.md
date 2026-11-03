# Spec Delta

## ADDED Requirements

### Requirement: Setup mode and provisioning
A clip with no saved network SHALL start in setup mode and accept, over BLE from the signed-in app, a Wi-Fi network and password, the hub's address and a device token, after the wearer confirms a code the clip blinks. The clip SHALL keep them in non-volatile storage and SHALL NOT send the Wi-Fi password anywhere else.

#### Scenario: First setup
- **WHEN** the wearer chooses «Añadir clip», confirms the blinked code and picks their network
- **THEN** the clip joins the network, connects to the hub with its token and appears in Dispositivos under their account

### Requirement: Reset and revocation
Holding the clip's button for 10 seconds SHALL clear its saved settings and return it to setup mode. A clip whose token was revoked SHALL be refused by the hub and SHALL return to setup mode after repeated refusals.

#### Scenario: Revoked clip
- **WHEN** the wearer revokes a clip in the app
- **THEN** the hub refuses its next connection and the clip ends up in setup mode

### Requirement: Signed updates with rollback
The clip SHALL install only firmware whose signature verifies against the public key it was built with. It SHALL mark a new image good only after a hello with the hub, and SHALL roll back to the previous image otherwise. It SHALL NOT check for updates while listening.

#### Scenario: Tampered image
- **WHEN** the manifest points at an image whose signature does not verify
- **THEN** the clip keeps its current firmware and reports the refusal on its next hello
