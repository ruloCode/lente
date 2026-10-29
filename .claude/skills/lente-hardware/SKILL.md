---
name: lente-hardware
description: How an agent drives Lente's bench with no human around - flash and read the clip (XIAO ESP32-S3) on the right serial port, run the hub, open and control the phone page on the Android phone over adb (screenshots, taps, DOM checks through Chrome DevTools), and play test speech from the Mac. Use for any task that says "verify on the phone", "with the clip", "flash", or tags [hw] / [phone].
---

# Lente's bench, hands-free

The auto lane sets `LENTE_BOARD_PORT` (the clip) and `LENTE_PHONE_SERIAL` (the phone's adb serial). In an interactive session, find them with `arduino-cli board list` (the "ESP32 Family Device" row) and `adb devices` (the USB serial, not `ip:port`).

**The phone is a `/dev/cu.usbmodem*` too.** Always name the clip's port exactly; the guard refuses a glob.

## Clip

- Build and flash: `arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p "$LENTE_BOARD_PORT" firmware/lente-clip`
- Serial log for 20 s: `timeout 20 arduino-cli monitor -p "$LENTE_BOARD_PORT" -c baudrate=115200`. The clip resets on flash, then joins Wi-Fi and connects to the hub on port 7070 (the host comes from `secrets.h`, which you never read).
- The clip hears the room through the Mac speakers: `osascript -e "set volume output volume 70"` then `say -v Samantha "Hey, what do you think about moving the launch to Friday?"`. For a second speaker, use `say -v Daniel`. The eval renderer (`pnpm eval:render`) has longer scripted dialogues.
- Its camera sees whatever is in front of it; Mirar works on anything (a test card opened full screen on the Mac).
- Never claim a physical result you can't observe from a log, a screenshot or an event (motor feel, LED colour by eye). Leave those tasks for the human.

## Hub

- The human's hub may already run on 7070/8080 from the main checkout: `lsof -nP -iTCP:7070 -sTCP:LISTEN`. In the auto lane you may stop it (`kill <pid>`) and start this checkout's hub in the background with `pnpm pilot`. Stop yours when done.
- Watch events without the phone: `curl -sN localhost:8080/events` (SSE).

## Phone (Android, adb)

```sh
P="adb -s $LENTE_PHONE_SERIAL"
$P shell svc power stayon usb                       # screen stays on while plugged in
$P shell input keyevent KEYCODE_WAKEUP
$P reverse tcp:8080 tcp:8080                        # phone's localhost:8080 → hub (a secure context, so the mic works)
$P shell pm grant com.android.chrome android.permission.RECORD_AUDIO
$P shell pm grant com.android.chrome android.permission.CAMERA
$P shell am start -a android.intent.action.VIEW -d "http://localhost:8080" com.android.chrome
$P exec-out screencap -p > /tmp/phone.png           # then Read /tmp/phone.png to see it
$P shell input tap 540 1800                         # coordinates from the screenshot (check `wm size`)
$P shell uiautomator dump /sdcard/ui.xml && $P exec-out cat /sdcard/ui.xml   # element bounds by text
```

For exact checks, drive the page through Chrome DevTools rather than pixels:

```sh
$P forward tcp:9222 localabstract:chrome_devtools_remote
curl -s localhost:9222/json                         # pick the page's webSocketDebuggerUrl
```

Then send `Runtime.evaluate` over that WebSocket from a throwaway Node script in `/tmp` (Node 22 has a global `WebSocket`), e.g. `document.querySelector('#cue-label')?.textContent`.

If the screen is locked with a PIN, stop and report it blocked: only the human can unlock it.

## Evidence

Every verification you report names the command and what it showed: the serial line, the SSE event, the DOM value, or the screenshot path and what is on it. Keep screenshots in `/tmp`; never commit photos of people or real meetings.
