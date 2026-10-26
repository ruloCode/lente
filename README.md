# Lente

**A real-time meeting copilot for people who work in their second language.**

Lente listens to a live meeting (your mic plus the Meet or Teams audio), knows who is speaking, and shows one short cue at a time, 90 characters or less, so you can glance at it without losing the conversation:

- **Say this:** when someone asks you something, a sentence you can say right away.
- **What it means:** a one-line explanation of a term or acronym you didn't catch.
- **On screen:** what the slide or chart being shared is actually showing.
- **Say it better:** a sharper rewrite of what you just said, for next time.

When the meeting ends, Lente writes notes, action items and a review of the moments you were addressed and whether you spoke up.

> **Meta Global AI Developer Hackathon · Indie track · Theme: Build for Your World**
> Every line in this repository was written during the hackathon, starting **2026-10-26**. See [What was built during the hackathon](#what-was-built-during-the-hackathon).

## The problem

Millions of engineers, designers and founders work every day in English, their second language. In a live meeting the hard part isn't vocabulary, it's speed: someone asks you directly, a decision is being made, or an unfamiliar term comes up, and by the time you've translated in your head the moment has passed. You end up quiet in the meetings that decide your work.

Lente is built by one of those people, for the meetings he sits in every week.

## How it uses Meta's models

| Job | Model | Where it runs | Why this model |
|---|---|---|---|
| Hear the meeting and tell speakers apart | `muse-voice-transcribe-1.0`, `DIARIZATION` mode | Meta Model API (realtime WebSocket) | Speaker labels let Lente know a question was aimed at *you*, and ignore your own lines |
| Fast cue when you're asked something | Muse Spark Open | Baseten (open weights) | Lowest time-to-first-token for one-sentence answers |
| Deep layer: meeting context and screen share | `muse-spark-1.3` with image input | Meta Model API | Reads the shared slide and reasons over the whole meeting |

Meeting content is sent only to standard-mode endpoints. Lente never uses the `-contributor` tier, so nothing said in a meeting is used to train models.

## Architecture

```
 mic ─┐
      ├─▶ mixer ─▶ PCM16 24 kHz ─▶ Muse Voice Transcribe (DIARIZATION)
 tab ─┘                                  │ speaker · turn · transcript
                                         ▼
                       ┌──────────── opening detector ────────────┐
                       │ named? asked? decision? unknown term?    │
                       ▼                                          ▼
              fast layer: Spark Open                  deep layer: Spark 1.3
              (≤ 90-char "say this")          (context + screen frames → cues)
                       └───────────────▶ cue deck ◀───────────────┘
                                 one card at a time, by priority
```

## Status

Day 0. What runs today:

- `pnpm ping`: one real call to the Meta Model API (lists models and asks Muse Spark for a cue).
- `pnpm bench:llm`: time-to-first-token for Muse Spark 1.3 and Muse Spark Open.
- `pnpm bench:asr <file.wav>`: streams a recording to Muse Voice Transcribe at real-time pace and reports partial lag, turn finalization latency and speaker labels.

Plan and numbers in [docs/benchmarks.md](docs/benchmarks.md). Demo plan in [docs/submission.md](docs/submission.md).

## Run it

Requires Node 22.18 or newer (TypeScript runs natively, no build step).

```bash
pnpm install          # dev tooling only: typescript + @types/node
cp .env.example .env  # add MODEL_API_KEY (and BASETEN_API_KEY for Spark Open)
pnpm ping
pnpm bench:llm 10
ffmpeg -i meeting.m4a -ac 1 -ar 24000 -c:a pcm_s16le meeting.wav
pnpm bench:asr meeting.wav DIARIZATION English,Spanish
pnpm test
```

## What was built during the hackathon

| Date | Built |
|---|---|
| 2026-10-26 | Repo, Meta Model API smoke test, streaming client, LLM and realtime-ASR benchmarks, tests |

**Prior work, declared:** the author previously prototyped a meeting copilot inside his personal assistant project, [hermes-os](https://github.com/ruloCode/hermes-os), on non-Meta models. No code, prompts or assets from it are in this repository; it informed only the problem statement and the latency targets.

## License

MIT
