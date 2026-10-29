# Proposal

## Why

The hub starts listening the moment it boots and keeps streaming the clip's audio to transcription for as long as the clip is on, whether anyone is talking to the wearer or not: silence, a TV in the room, an evening with the clip on the desk. Transcription is billed per second of audio sent and every five minutes of new turns triggers a summary call, so an idle clip quietly spends the owner's credit. A wearable that is on all day has to know when not to spend.

## What Changes

- The hub starts paused. Connecting the clip does not start transcription; the wearer starts it from the phone (Asistir, Solo grabar or the pill).
- A silence gate: while listening, audio goes to transcription only around speech. The hub keeps a short pre-roll and sends audio while the clip's level is at speech level, plus a hangover; in silence it sends nothing, and if the service closes the idle session it reopens on the next speech with the pre-roll.
- Idle auto-pause: with no meeting open, when the wearer has not spoken for a configurable time (default 20 minutes; with no wearer label yet, when nothing was said at all), Lente pauses itself and the phone says why. Ambient talk such as a TV doesn't keep it running.
- A usage meter: the hub counts today's seconds sent to transcription and tokens per model, prices them with the list prices in `docs/kb/meta-api.md`, and the phone shows "Hoy" in Dispositivos (minutes, tokens, approximate US$).

Out of scope: on-device speech detection on the clip (the gate runs on the hub), wake words.

Meta models: Muse Voice Transcribe (only around speech), Muse Spark 1.3 (unchanged).

## Capabilities

### New Capabilities
- `spend-control`: start paused, silence gate, idle auto-pause and the usage meter.

### Modified Capabilities
- `companion-app`: start control at boot, the idle-pause note and "Hoy" in Dispositivos.

## Impact

- New pure modules for the gate, the idle policy and the meter, each with tests; `src/pilot.ts` (listening default, streaming, status); `src/pilot-page.ts`; `data/usage.json` (git-ignored, numbers only).
