# Proposal

## Why

The project rule is that every number in the docs and the video is measured, and "technical depth & execution" is 20% of the score. Today the latencies shown come from single runs. Lente needs a repeatable eval suite that measures speed and correctness on a fixed, synthetic meeting set, so claims are honest and regressions are caught.

## What Changes

- A synthetic meeting set: short scripted dialogues rendered to audio with distinct synthetic voices and volumes (the wearer louder, others farther), with labels for speakers, questions and who each question is aimed at. No real meeting audio.
- `pnpm eval` replays the set through the real hub path (simulated clip, real Meta models) and reports: transcription finalize latency, cue latency p50/p95, addressing precision and recall, false cue rate, vision latency, and tokens per meeting.
- Results are written as machine-readable files and summarized into docs/benchmarks.md with the date, models and settings used.
- A CI workflow runs typecheck and unit tests on every push (no API keys needed).

Out of scope before 2026-11-04: evals on real recorded meetings, human preference ratings.

Meta models: everything the hub uses, called exactly as in production.

Privacy: synthetic audio only; nothing from real people.

## Capabilities

### New Capabilities
- `evals`: the measured quality and speed of Lente on a fixed synthetic meeting set.

### Modified Capabilities
<!-- none -->

## Impact

- `scripts/eval/` (set generator and runner), `results/` (git-ignored), docs/benchmarks.md, `.github/workflows/ci.yml`.
- Reuses the simulated-clip replay used to verify the pilot.
