# Proposal

Depends on: `add-accounts`, `add-cloud-hub`

## Why

A clip gets its Wi-Fi, its hub and its device token at compile time: `firmware/lente-clip/secrets.h` and `cloud.h`, then `arduino-cli` over USB. That works for the owner at a desk and for nobody else. Once a clip leaves the bench there is no way to change its network, move it to another account or fix its firmware. A clip someone else can use has to be set up from the phone and updated over the air.

## What Changes

- **Setup from the app.** A clip with no saved network starts in setup mode and advertises a small BLE service. In Ajustes → Dispositivos, «Añadir clip» finds it and sends it the Wi-Fi network and password, the hub's address and a device token minted for the signed-in user (`POST /devices`, `add-accounts` 3.4). The clip saves them in its non-volatile storage, never in source, and joins.
- **Bound to the account.** The token ties the clip to the user. Revoking the device in the app makes the hub refuse it, and the clip falls back to setup mode after repeated refusals.
- **Reset.** Holding the clip's button for 10 seconds clears the saved network and token and returns it to setup mode.
- **Updates over the air.** CI builds and signs each firmware release. The hub serves a manifest with version, size, SHA-256 and signature, plus the image. The clip checks at boot and once a day and downloads over TLS. It verifies the signature with a public key built into the firmware before it writes the update. After restarting it must reach the hub to mark the image good, or it rolls back to the previous one.
- **The compile-time path stays** for the bench: a `secrets.h` with values skips setup mode, so `arduino-cli` flashing and CI builds keep working.

Out of scope: setup over a SoftAP web page, several saved networks, iOS.

Meta models: none.

Privacy: the Wi-Fi password goes only over the BLE link during setup and stays on the clip; the hub never sees it. The device token is shown nowhere and stored on the hub only as its hash, as today.

## Capabilities

### New Capabilities
- `clip-setup`: setup mode, provisioning over BLE, reset, binding and signed updates.

### Modified Capabilities
- `companion-app`: «Añadir clip» and the firmware version in Dispositivos (added requirements).

## Impact

- Firmware: BLE setup service, NVS settings, reset, OTA with signature check and rollback in `firmware/lente-clip/`.
- Hub: `/firmware/manifest` and `/firmware/<version>.bin`, the clip's version in the device list.
- Android: BLE scan and the setup flow (Bluetooth permissions), firmware version in Dispositivos.
- CI: a release job that builds and signs the image; the signing key is a GitHub secret held by the owner, and only its public half is in the repo.
