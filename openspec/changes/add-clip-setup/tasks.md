# Tasks

## 1. Setup over BLE

- [ ] 1.1 Check BLE provisioning options on the Arduino-ESP32 3.3 core (Espressif's protocol vs a small GATT service), their memory cost next to the camera, and record the choice in `docs/kb/decisions.md`
- [ ] 1.2 Firmware: setup mode when nothing is saved, the BLE service, the blinked 4-digit code, NVS settings, `secrets.h` still winning; compiles in CI with the example secrets
- [ ] 1.3 Firmware: 10-second button reset and fallback to setup mode after repeated refusals from the hub; flash and check on the bench clip [hw]
- [ ] 1.4 Android: «Añadir clip» (Bluetooth permissions, scan, confirm the blinks, send network, hub and a token minted with `POST /devices`), with a fake BLE peer in JVM tests
- [ ] 1.5 On the phone with the bench clip: set it up from zero against the Modal hub, revoke it from the app, see it refused, reset it and set it up again [hw] [phone]

## 2. Updates over the air

- [ ] 2.1 Hub: `/firmware/manifest` and `/firmware/<version>.bin` from the volume, the clip's reported version in `GET /devices`; tests (`pnpm test`)
- [ ] 2.2 CI release job: build, sign with ECDSA P-256 from a GitHub secret, publish the image and manifest; the owner creates the key pair and keeps the private key offline [human]
- [ ] 2.3 Firmware: check at boot and daily (not while listening), download over TLS, verify the signature, write to the inactive partition, mark good after a hello, roll back otherwise [hw]
- [ ] 2.4 On the bench: one good update, one image with a broken signature refused, one image that can't reach the hub rolled back; record times in `docs/benchmarks.md` [hw]

## 3. Docs

- [ ] 3.1 `docs/kb/hub-api.md` for the firmware routes; the clip setup in README; firmware version in Dispositivos noted in `docs/architecture.md`
