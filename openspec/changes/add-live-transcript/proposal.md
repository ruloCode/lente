# Proposal

## Why

When the wearer picks Asistir or Solo grabar, the first thing they want to know is that Lente is hearing the room, and what it heard. Today the transcript sits at the bottom of Ahora, below the camera view, mixed with summaries and cues, and the turn in progress is a loose italic line with no speaker. The owner asked for the transcript in real time as soon as either mode is on, the way a live meeting or a live class looks: who said what, the current sentence growing as it is spoken, and the newest line always in view.

The pattern (transcript with speakers as the main live view, the turn in progress updated in place, full state on connect, one big suggestion at a time) follows the owner's earlier phone meeting screen in hermes-phone. It is written fresh for Lente's page and hub; no code, prompts or assets are reused.

## What Changes

- With Lente listening in Asistir or Solo grabar, Ahora opens a full-screen live view, laid out from the owner's sketch: a strip with the state and elapsed time ("Escuchando · m:ss" / "Grabando · m:ss") and Detener; a row with collapse, the mode and the clip state; the reply slot (Asistir); the transcript filling the screen; help actions (Asistir); and a bottom bar with pause, a hint ("Puedes bloquear el teléfono: el clip sigue escuchando.") and stop.
- The transcript has one row per turn with its speaker, and a live row for the turn in progress whose text updates in place as partials arrive and becomes that turn's row when it completes, with no duplicate. It follows the newest line unless the wearer scrolls back ("Nuevo ↓").
- The reply slot shows a placeholder until a card arrives, then the newest card: the DILO line (with its Spanish meaning) or a help card.
- Help on demand in Asistir: Aportar (a sentence to add now), Pregunta (a question to ask now) and ¿De qué hablan? (what is being discussed, in Spanish), one Muse Spark 1.3 call each, with the measured time on the card. Solo grabar makes no model calls, so it shows none of them.
- Pause stops the time and shows "En pausa"; stop and Detener need a second tap and end an open meeting with its notes. Collapsing keeps listening behind a compact bar that reopens the view.
- Opening or reconnecting the page catches up: the turns of the session, the partial in progress (now in the connect snapshot) and the elapsed time from the hub's status.

Out of scope: marking "soy yo" by tapping a speaker (voice enrollment already names the wearer), translating the transcript, the English-class companion, keeping the phone's own microphone alive with the screen locked (that belongs to `add-phone-capture`).

Meta models: Muse Voice Transcribe (partials, turns, speaker labels), Muse Spark 1.3 (help on demand).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `companion-app`: the live transcript view on Ahora.
- `live-transcription`: the partial in the connect snapshot, the session time in the status.
- `reply-cues`: help on demand.

## Impact

- `src/pilot-page.ts` (live view), `src/pilot.ts` (partial for the snapshot, session time, help route), `src/briefing.ts` (help prompts).
- A pure reducer for transcript rows (snapshot, partial, turn, speaker revision) in its own module with tests.
- Delays shown to the wearer are measured and recorded in `docs/benchmarks.md`.
