# Proposal

## Why

When the wearer picks Asistir or Solo grabar, the first thing they want to know is that Lente is hearing the room, and what it heard. Today the transcript sits at the bottom of Ahora, below the camera view, mixed with summaries and cues, and the turn in progress is a loose italic line with no speaker. The owner asked for the transcript in real time as soon as either mode is on, the way a live meeting or a live class looks: who said what, the current sentence growing as it is spoken, and the newest line always in view.

The pattern (transcript with speakers as the main live view, the turn in progress updated in place, full state on connect, one big suggestion at a time) follows the owner's earlier phone meeting screen in hermes-phone. It is written fresh for Lente's page and hub; no code, prompts or assets are reused.

## What Changes

- With Lente listening in Asistir or Solo grabar, Ahora shows the live transcript as its main view, above the camera view: one row per turn with its speaker, and a live row for the turn in progress whose text updates in place as partials arrive and becomes that turn's row when it completes, with no duplicate.
- In Asistir the DILO card stays above the transcript, one thing at a time. In Solo grabar there is no card and the transcript takes the space.
- The transcript follows the newest line while the wearer is at the bottom; if they scroll up it stays put and a "Nuevo ↓" button brings them back.
- Opening or reconnecting the page shows the turns of the current session already said and the partial in progress (the hub adds the partial to the connect snapshot), with no duplicates.
- Paused: the transcript stays, the live row goes away, and "En pausa" says why nothing moves.
- Summaries, cues and photos stay in the day timeline; the live transcript shows only what was said.

Out of scope: marking "soy yo" by tapping a speaker (voice enrollment already names the wearer), translating the transcript, the English-class companion.

Meta models: Muse Voice Transcribe (partials, turns, speaker labels). No new model calls.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `companion-app`: the live transcript view on Ahora.
- `live-transcription`: the connect snapshot carries the partial in progress.

## Impact

- `src/pilot-page.ts` (transcript view, live row, follow and catch-up), `src/pilot.ts` (partial kept for the snapshot).
- A pure reducer for transcript rows (snapshot, partial, turn, speaker revision) in its own module with tests.
- Delays shown to the wearer are measured and recorded in `docs/benchmarks.md`.
