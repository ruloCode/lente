# Design

## Context

Muse Voice Transcribe in DIARIZATION mode labels speakers per session (A, B, C…); labels carry no identity and reset when a session restarts (60-minute limit, reconnects). The clip's microphone is a few centimeters from the wearer's mouth and one to three meters from everyone else. Turns arrive with `turnId` and `audioProcessedMs`, which lets the hub map a turn back to the audio it buffered. Measured on 2026-10-28: the wearer's voice at the clip reads RMS ~310 after gain against ~16 for room silence.

## Goals / Non-Goals

**Goals:**
- Decide "addressed to the wearer" in under 50 ms for the common cases (named, reply), with no model call.
- Keep every decision explainable and replayable for evals.

**Non-Goals:**
- Recognizing who other people are by name.
- Persisting voiceprints between sessions or devices.

## Decisions

1. **Loudness, not embeddings, to find the wearer.** The hub keeps a short ring of RMS values per 80 ms frame indexed by audio time; when a turn completes it takes the median RMS over that turn's span and accumulates it per label. The label with the highest median (with a margin of 2× over the next) is the wearer. Alternative considered: speaker embeddings on the hub; rejected because it needs a model and a dependency for something the hardware gives us for free.
2. **Rules first, model second.** A pure function `isAddressed(turn, history, profile)` checks name/alias mentions (accent- and case-insensitive) and "reply to the wearer's last turn within 20 s". Only questions that pass neither and come from a non-wearer within a two-person exchange go to Muse Spark 1.3 with a yes/no structured answer. Alternative: always ask the model; rejected for latency and cost.
3. **Enrollment phrase as override.** "Lente, soy <name>" (or "Lente, I'm <name>") assigns the label directly; it is the fallback for one-person demos and noisy rooms.
4. **One downlink byte stays.** `B` keeps meaning "signal a cue"; the firmware drives LED and motor from it. No protocol change.

## Risks / Trade-offs

- [Wearer whispers or a colleague is very close] → the 2× margin leaves the wearer unknown instead of guessing; the enrollment phrase fixes it.
- [Labels swap after a session restart] → identification reruns; the timeline shows "You" only once the rules agree.
- [Model check adds ~1–2 s] → used only for the ambiguous slice; the cue still appears, just later, and the decision source is shown.

## Open Questions

- Exact margin and minimum turns are tuned on the eval set from `add-evals`; the defaults above are starting values.
