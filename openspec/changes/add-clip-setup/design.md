# Design

## Decisions

- **BLE, not a SoftAP page.** The ESP32-S3 has BLE, and the Android app is native, so the phone stays on its own Wi-Fi during setup and the flow lives in the app the wearer already signed in to. The GATT layout and whether to use Espressif's provisioning protocol or a small service of our own are checked first against the Arduino-ESP32 3.3 core (task 1.1) and recorded in `docs/kb/decisions.md`. Neither is assumed here.
- **What the clip stores.** In NVS (`Preferences`): SSID, password, hub host, device token, setup flag. `secrets.h` values, when present, win, which keeps the bench and CI as they are.
- **Pairing is proven, not trusted.** During setup the clip shows a 4-digit code on its serial log and blinks it on the LED. The app asks the wearer to confirm the blinks match before it sends the token, so a stranger nearby can't capture a clip in setup mode by being first.
- **Signed updates with ECDSA P-256.** mbedTLS on the ESP32 verifies it natively. The private key is a GitHub secret used only by the release job; the public key is compiled into the firmware. The image is written to the inactive OTA partition and the boot is marked good only after the clip completes a hello with the hub. A failed boot rolls back on the next restart.
- **Update checks stay quiet.** At boot and every 24 hours, never during a meeting or while listening, with a random delay of up to an hour so clips don't all ask at once.

## Risks

- **BLE and the camera share radio and memory.** Setup mode runs with the camera and audio off, then restarts into normal mode.
- **A bricked clip.** Rollback covers a bad boot. It doesn't cover a firmware that boots and then misbehaves, so every release runs on the bench clip for an hour before its tag is published.
