# Proposal

## Why

There are days the wearer does not want suggestions (a day in their own language, a focus block, a workshop where they only listen) but still wants Lente to remember. Today Lente only learns from meetings the wearer starts by hand, and every question it hears costs model calls for a cue nobody asked for. A "Solo grabar" mode keeps the day as text and learns from it on the go, with no real-time cues: cheaper, quieter, and the memory, glossary and phrases keep growing.

## What Changes

- An assist mode owned by the hub, persisted with the profile: **Asistir** (today's behavior, cues on) and **Solo grabar** (record only).
- In Solo grabar, transcription and the day record continue; question detection, addressing and reply calls are skipped, so there are no DILO cards, no buzz and nothing spoken. Mirar still works on demand.
- Learning on the go: in Solo grabar the day is split into episodes automatically (a silence gap or a maximum length), and each episode gets notes with the same extraction meetings use, feeding memory, the glossary, asked versus answered and the wearer's phrases. Manual meetings still work inside the mode.
- The phone shows the mode: an Asistir / Solo grabar switch on Ahora, the listening pill reads "GRABANDO" with the same red visibility, and Dispositivos shows how long has been recorded today (measured).

Out of scope: storing audio (Lente keeps text only, in this mode too), summaries of the whole week.

Meta models: Muse Voice Transcribe (unchanged), Muse Spark 1.3 for episode notes only; no per-question calls in Solo grabar.

Privacy: recording all day makes consent more important, not less. The red strip, the pill and the clip's LED stay on while recording, pause works everywhere, the introduction and Ajustes say that only text is kept, and episodes are deletable like meetings.

## Capabilities

### New Capabilities
- `record-only-mode`: record and learn without real-time cues.

### Modified Capabilities
- `reply-cues`: cues only while assisting.
- `companion-app`: the mode switch, the "GRABANDO" pill and recorded time.

## Impact

- `src/pilot.ts` (mode in status and profile, cue pipeline gated, automatic episodes), a pure episode-splitting policy in `src/meetings.ts` or its own module with tests, `src/pilot-page.ts`.
- Eval runner gains a replay in Solo grabar to measure that it makes zero cue calls.
