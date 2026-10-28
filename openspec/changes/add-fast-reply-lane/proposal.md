# Proposal

## Why

The reply has to land while the question still hangs in the air. Muse Spark 1.3 at minimal effort measured 1.5–2.0 s from turn to cue; Muse Spark Open served on partner GPUs is the candidate for a faster first line. Running on it also qualifies Lente for the Best Build on Meta Open Weight Models bonus, which a partner verifies.

## What Changes

- Route reply cues to a fast lane on Muse Spark Open (Baseten, model `meta-models/muse-spark-open-1026`), with Fireworks as a second provider and Muse Spark 1.3 minimal as the last resort.
- Per-request timeouts and automatic fallback, so a slow or failing provider never blocks the cue.
- Record which model and provider served each cue and its latency, visible in the timeline and in evals.
- Keep scene vision, summaries, extraction and the agent on Muse Spark 1.3 unless evals show Spark Open is better for them.

Out of scope before 2026-11-04: self-hosting Spark Open on Modal (kept as an option if partner credits are not granted), streaming the cue token by token to the clip.

Meta models: Muse Spark Open (fast lane), Muse Spark 1.3 (fallback).

Privacy: the cue context (recent turns) goes to the chosen provider; providers are listed in the README.

## Capabilities

### New Capabilities
- `model-routing`: which model and provider serve each job, with timeouts and fallbacks.

### Modified Capabilities
- `reply-cues`: each cue reports the model and provider that produced it.

## Impact

- `src/providers.ts` (Fireworks target), a routing module with timeout and fallback (pure policy tested), `src/pilot.ts`.
- `.env`: `BASETEN_API_KEY`, optional `FIREWORKS_API_KEY` (pending partner approval).
