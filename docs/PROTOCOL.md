# Clip ↔ hub protocol, version 2.0

The wire contract between the clip (XIAO ESP32-S3 Sense) and the hub. It is implemented in
[`src/clip-protocol.ts`](../src/clip-protocol.ts) (pure, no sockets), in the clip firmware
([`firmware/lente-clip`](../firmware/lente-clip)) and in the emulator
([`scripts/fake-clip.ts`](../scripts/fake-clip.ts)). The golden frames in
[`test/fixtures/frames.json`](../test/fixtures/frames.json) are decoded by the hub tests and
byte-compared by the firmware self-test; every hex example below is decoded by a test too.

Transport: one TCP connection from the clip to the hub (port 7070 by default). The clip opens it and
reconnects on its own. All integers are little-endian.

## Uplink: clip → hub

A stream of frames:

| Bytes | Field |
|---|---|
| 1 | type (ASCII) |
| 4 | payload length, u32 |
| n | payload |

A length above 2 MB is a corrupt stream: the hub closes the connection instead of buffering it.

| Type | Payload |
|---|---|
| `H` hello | JSON object, see below. Must be the first frame. |
| `A` audio | 8-byte header, then PCM16 mono samples at the rate declared in the hello. |
| `J` JPEG | One JPEG image, sent when the button is pressed or the hub asks for a photo. |

### Hello

```json
{"proto":"2.0","device":"lente-clip","fw":"pilot-2","codec":"pcm16","rate":16000,"rssi":-55,"camera":false}
```

| Field | Meaning |
|---|---|
| `proto` | `major.minor`. The hub accepts any minor of its own major (2) and refuses other majors. |
| `fw` | Firmware version, for the log. |
| `codec` | `pcm16`. The id is reserved for others (Opus is not implemented). |
| `rate` | Sample rate in Hz. The hub accepts 16000. |
| `device`, `rssi`, `camera` | Extras for the log and the phone page; the hub does not depend on them. |

A hello without `proto` is protocol 1 (the first pilot firmware). The hub refuses it, closes the
connection and shows "update the clip firmware" on the phone. If the first frame is not a hello, the
hub closes the connection too.

### Audio

Payload = 8-byte header + samples:

| Bytes | Field |
|---|---|
| 4 | sequence, u32: 0 when the clip boots, +1 for every frame sent |
| 4 | capture time, u32: ms since the clip booted (wraps after 49 days, irrelevant for sessions) |
| 2·k | k PCM16 mono samples; the clip sends 80 ms frames (1280 samples, 2560 bytes) |

The hub tracks the sequence per connection. A gap of *n* frames counts *n* lost and is filled with *n* × 80 ms
of silence so the audio timeline stays aligned (a gap is capped at 10 s of silence but still counted in
full). A frame behind the expected sequence, late or duplicate, is counted and dropped. Totals are in the
hub's status (`audioLost`, `audioLate`) and the log:

```
[audio] lost 1 frame(s) before seq 25: filled 80 ms with silence · total lost 1, late 0
```

While the hub has paused the microphone the clip keeps draining it but sends nothing, and the sequence
stands still.

## Downlink: hub → clip

Single bytes, no framing:

| Byte | Command |
|---|---|
| `B` | Blink the LED: a cue is on the phone |
| `P` | Take a photo and send a `J` frame |
| `C` / `c` | Camera on / off (off = mic only, saves battery) |
| `M` / `m` | Listen / pause the microphone |

The hub sends the camera and listen state right after a clip connects, so a reconnecting clip picks up the
current settings.

## Handshake

1. The clip connects and sends `H`.
2. The hub checks it ([`parseHello`](../src/clip-protocol.ts)). On refusal it logs the reason, closes the
   connection and puts the reason on the phone page.
3. The hub sends `C`/`c` and `M`/`m`. Audio frames follow, sequence from 0.

## Versioning

- The major version changes when a frame layout changes or a field is removed. Hub and clip refuse each other.
- The minor version changes when something is added that an older peer can ignore (a new hello field, a new
  command byte). A peer ignores fields and bytes it does not know.
- A new codec gets a new `codec` id in the hello; the hub refuses ids it cannot decode.

## Examples

Hello frame (112 bytes): `H`, a payload length of 107, then the JSON above.

```hex hello-v2
48                   # type 'H'
6b 00 00 00          # payload length 107
7b 22 70 72 6f 74 6f 22 3a 22 32 2e 30 22 2c   # {"proto":"2.0",
22 64 65 76 69 63 65 22 3a 22 6c 65 6e 74 65 2d 63 6c 69 70 22 2c   # "device":"lente-clip",
22 66 77 22 3a 22 70 69 6c 6f 74 2d 32 22 2c   # "fw":"pilot-2",
22 63 6f 64 65 63 22 3a 22 70 63 6d 31 36 22 2c   # "codec":"pcm16",
22 72 61 74 65 22 3a 31 36 30 30 30 2c   # "rate":16000,
22 72 73 73 69 22 3a 2d 35 35 2c   # "rssi":-55,
22 63 61 6d 65 72 61 22 3a 66 61 6c 73 65 7d   # "camera":false}
```

An audio frame with eight samples (a real one has 1280):

```hex audio-seq7
41                   # type 'A'
18 00 00 00          # payload length 24 = 8 header + 16 samples bytes
07 00 00 00          # sequence 7
40 e2 01 00          # capture time 123456 ms
00 00  e8 03  18 fc  ff 7f   # samples 0, 1000, -1000, 32767
00 80  7b 00  38 fe  15 03   # samples -32768, 123, -456, 789
```
