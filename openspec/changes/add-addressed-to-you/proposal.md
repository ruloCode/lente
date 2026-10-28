# Proposal

## Why

Today every question in the room produces a cue, including the wearer's own questions and questions aimed at someone else. The product promise is narrower and more valuable: notice the moment the wearer is the one being asked, buzz, and show one line. That moment is what no competitor detects, and it is the demo.

## What Changes

- Identify which diarized speaker is the wearer, automatically from loudness (the microphone sits on the wearer's head) with a spoken enrollment phrase as a fallback.
- Decide whether a question is aimed at the wearer: from another speaker, and either names the wearer, replies to the wearer's last turn, or is confirmed by a fast Muse Spark check when ambiguous.
- Cue only when addressed (a setting keeps the current "every question" behavior for testing).
- Buzz the vibration motor on the clip together with the LED.
- Show "who asked" on the card and in the timeline.

Out of scope before 2026-11-04: voiceprints that persist across sessions; addressing in group chats or calls without the clip.

Meta models: Muse Voice Transcribe (DIARIZATION speaker labels and turn timing), Muse Spark 1.3 at minimal effort for the ambiguous-case check.

Privacy: no new data is stored; the wearer's name and aliases are local settings.

## Capabilities

### New Capabilities
- `addressing`: knowing which voice is the wearer and whether a turn is aimed at them.

### Modified Capabilities
- `reply-cues`: cues fire only for questions aimed at the wearer, and carry who asked.
- `clip-device`: the cue signal also drives the vibration motor.

## Impact

- `src/pilot.ts` (turn handling), a new pure module for speaker loudness and addressing rules with tests, `src/asr-session.ts` (turn timing for loudness windows).
- Firmware: motor on D0 through an S8050 transistor (hardware arrives 2026-10-30); until then the LED stands in.
- Phone page: "asked by" on the card; a setting for the wearer's name and aliases.
