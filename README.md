# Lente

**A real-time meeting copilot for people who work in their second language.**

A small clip on any pair of glasses hears the meeting and sees what you see. Lente knows who is speaking, notices when a question is aimed at you, and puts one line on your phone, 90 characters or less, that you can say right away: the **Dilo** card ("say it"). It can also tell you what is on the slide in front of you, keep your day as text, and after the meeting prepare the follow-up for you to approve.

- **Dilo:** when someone asks you something, a sentence you can say now.
- **What it means:** a one-line explanation of a term or acronym you didn't catch.
- **On screen:** what the slide, screen or whiteboard in front of you is showing.
- **What's happening:** a short summary every few minutes, read out loud if you want.

> **Meta Global AI Developer Hackathon · Indie track · Theme: Build for Your World**
> Every line in this repository was written during the hackathon, starting **2026-10-26**. See [What was built during the hackathon](#what-was-built-during-the-hackathon).

## The problem

Millions of engineers, designers and founders work every day in English, their second language. In a live meeting the hard part isn't vocabulary, it's speed: someone asks you directly, a decision is being made, or an unfamiliar term comes up, and by the time you've translated in your head the moment has passed. You end up quiet in the meetings that decide your work.

Lente is built by one of those people, for the meetings he sits in every week.

## How it uses Meta's models

| Job | Model | Where it runs | Why this model |
|---|---|---|---|
| Hear the meeting and tell speakers apart | `muse-voice-transcribe-1.0`, `DIARIZATION` mode | Meta Model API (realtime WebSocket) | Speaker labels let Lente know a question was aimed at *you* |
| One-line reply when you're asked something | `muse-spark-1.3`, minimal reasoning (Muse Spark Open on Baseten planned as the fast lane) | Meta Model API | Short, natural answers in the language of the question |
| Read what the camera sees | `muse-spark-1.3` with image input | Meta Model API | Reads the slide or screen in front of you |
| Summaries, memory, follow-up agent | `muse-spark-1.3` (structured output, function calling) | Meta Model API | One model family across the product |

Single measured runs on 2026-10-28 with the real clip and hub: a question to a Dilo card in 1.5–1.6 s after the turn closed, a photo described in 1.1–1.4 s. Full measurements come from the eval suite in [docs/benchmarks.md](docs/benchmarks.md).

**Privacy.** Lente only calls standard-mode endpoints, never the `-contributor` tier. Audio and photos are never stored; the day is kept as text on the hub. During the hackathon Lente runs on Meta's free credits, which allow content to be used for product improvement, so testing uses the author's own voice and public media, and anyone in the demo meeting agreed to it.

## Architecture

```
 clip on the glasses ──frames──▶ Lente hub (Node 22) ──▶ Muse Voice Transcribe ──▶ turns + speakers
 (XIAO ESP32-S3:                     │                                                  │
  camera, mic, LED)                  ├──▶ Muse Spark 1.3: Dilo replies, vision, summaries ◀┘
        ▲                            │
        └── blink / mode ◀───────────┴──SSE──▶ phone app: Dilo card · camera · day timeline · voice
```

The full plan (applications, stack, interfaces, data and consent, order of work) is in [docs/architecture.md](docs/architecture.md). What Lente does is specified in [`openspec/specs/`](openspec/specs); what comes next is in [`openspec/changes/`](openspec/changes).

## Status

What runs today:

- **The pilot:** `pnpm pilot` starts the hub. The clip streams audio over Wi-Fi; the phone page shows live transcription with speakers, Dilo cards, Look and Live camera descriptions, summaries, the day timeline, mic-only and pause modes, and reads aloud.
- **The clip:** firmware in [`firmware/lente-clip`](firmware/lente-clip) for the Seeed XIAO ESP32-S3 Sense, and a hardware self-test in [`firmware/selftest`](firmware/selftest).
- **The case:** a parametric clip for any glasses in [`hardware/clip-v1`](hardware/clip-v1) with printable STL files and an interactive 3D viewer.
- **Benchmarks:** `pnpm ping`, `pnpm bench:llm`, `pnpm bench:asr <file.wav>`.

## Run it

Requires Node 22.18 or newer (TypeScript runs natively, no build step).

```bash
pnpm install                       # dev tooling only: typescript + @types/node
cp .env.example .env               # add MODEL_API_KEY (optional: BASETEN_API_KEY, ELEVENLABS_API_KEY)
pnpm ping                          # one real call to the Meta Model API
pnpm pilot                         # the hub; open the printed URL on your phone
pnpm test
```

The clip: copy `firmware/lente-clip/secrets.example.h` to `secrets.h` (git-ignored), set your 2.4 GHz Wi-Fi and the hub's address, then:

```bash
arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p <port> firmware/lente-clip
```

## What was built during the hackathon

| Date | Built |
|---|---|
| 2026-10-26 | Repo, Meta Model API smoke test, streaming client, LLM and realtime-ASR benchmarks, tests |
| 2026-10-26 | Hardware: parametric clip-on pod for any glasses (`hardware/clip`), printable STL, renders, parts list |
| 2026-10-27 | Clip v1 redesigned around the XIAO ESP32-S3 Sense (`hardware/clip-v1`): parametric model, clearance check, STL, interactive 3D viewer with exploded view; hardware self-test firmware (PSRAM, camera, microphone, Wi-Fi) |
| 2026-10-28 | Pilot end to end: clip firmware streaming audio and photos over Wi-Fi; hub with realtime transcription, Dilo cues, Look and Live vision, day record, summaries, mic-only and pause modes, voice output; phone app; protocol, pacing and day-log modules with tests |
| 2026-10-28 | Planning: architecture document, OpenSpec baseline specs for the pilot (8 capabilities) and ten specified changes; brand direction and concept images |
| 2026-10-28 | Protocol v2, hub side: versioned hello (major-version check), sequenced and timestamped audio, lost-frame counting with silence fill, turns anchored to offsets in the session audio, shared golden fixtures `test/fixtures/frames.json` decoded by the tests and compared byte for byte by the firmware self-test (`fixtures.h` is generated from it); clip emulator `scripts/fake-clip.ts` (WAV + JPEG folder over the real protocol, verified end to end with no clip); `docs/PROTOCOL.md` with hex examples decoded by a test; "update the clip firmware" message on the phone; firmware sends the v2 hello and audio header, verified on the clip against the hub log with a deliberate one-frame-in-25 drop (counted and filled with 80 ms of silence), then removed |
| 2026-10-28 | Calibre identity on the phone app: graphite surfaces, cyan only on the line to say and amber only on measured numbers (guarded by a test), Barlow Condensed / Atkinson Hyperlegible / IBM Plex Mono, lens-and-line logo drawn in code, reply card renamed "DILO", distinct listening / paused / waiting states; installable manifest and icons served by the hub (device check pending) |
| 2026-10-28 | Wearer identification: per-frame loudness ring, per-speaker median over each turn's audio span (2× margin, ≥2 speakers and ≥3 turns), "Lente, soy …" enrollment phrase, reset on every transcription session; the phone shows "You" for the wearer (unit tests; checked with two synthetic voices at different levels, not yet with real people) |
| 2026-10-28 | Addressing rules: `isAddressed` decides from the wearer's name or aliases, a reply right after the wearer spoke, or the wearer asking it themself, and records which rule decided; only a two-voice exchange with no sign goes to Muse Spark 1.3 (minimal effort, yes/no, 1.6–1.9 s measured on 2 calls); the wearer's name and aliases are set on the phone and kept in `data/profile.json` (decisions are logged, not yet gating cues) |

**Prior work, declared:** the author previously prototyped a meeting copilot inside his personal assistant project, [hermes-os](https://github.com/ruloCode/hermes-os), on non-Meta models. No code, prompts or assets from it are in this repository; it informed only the problem statement and the latency targets.

**Tools used to build it:** Claude Code as a coding agent (commits it helped with are co-authored), [OpenSpec](https://github.com/Fission-AI/OpenSpec) for specs (its generated commands live in `.claude/`, MIT), Matiz for brand references, and GPT Image 2.5 through Higgsfield for the concept images in [`docs/promo`](docs/promo), which are illustrations, not product photos. Spoken output can use ElevenLabs; every understanding and decision runs on Meta's models.

## Related work

Lente is built around the moment you are addressed in a second language, works on any glasses (or none, with the planned desktop mode), and keeps its agents approval-gated and verifiable. These projects are prior art; nothing from them is copied:

- [Omi / omiGlass](https://github.com/BasedHardware/omi): open-source AI wearable; omiGlass uses the same XIAO ESP32-S3, over BLE.
- [OpenGlass](https://github.com/BasedHardware/OpenGlass): the original "turn any glasses into AI glasses" clip.
- [MentraOS](https://github.com/Mentra-Community/MentraOS): smart-glasses OS with a cloud transcription service.
- [Brilliant Labs SDK](https://github.com/brilliantlabsAR/brilliant_sdk): open AR glasses with an on-device runtime.
- [Even Realities EvenDemoApp](https://github.com/even-realities/EvenDemoApp): published protocol for display glasses with conversation prompts.
- [free-cluely](https://github.com/Prat011/free-cluely) and [Recap](https://github.com/RecapAI/Recap): desktop meeting assistants and capture.

## License

MIT
