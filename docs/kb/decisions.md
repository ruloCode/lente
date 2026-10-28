# Decisions

Newest last. Each one says why, so it can be revisited with data.

### 2026-10-26 · Build Lente, theme "Build for Your World", Indie track

A live meeting copilot for second-language professionals. The author lives the problem every week, which is what the theme and the 30% impact weight reward. It avoids every listed anti-project: it isn't a chatbot, RAG app or image analyzer.

### 2026-10-26 · One job per Meta model

- Hearing and who's speaking: `muse-voice-transcribe-1.0` in `DIARIZATION` mode.
- Fast "say this" cue: Muse Spark Open on Baseten (also enters the open-weights bonus).
- Deep layer and screen share: `muse-spark-1.3` with image input.

Why: the "Use of Meta AI tooling" category (25%) rewards going beyond a single integration; three models with distinct, necessary jobs is the honest version of that. To be confirmed by `docs/benchmarks.md`: if Spark Open's first token isn't under ~1.5 s, the fast layer moves to Spark 1.3 at minimal effort.

### 2026-10-26 · Never the contributor tier

Meeting audio and transcripts belong to everyone in the meeting. The `-contributor` endpoints let Meta train on content, so Lente only calls standard mode, even though it is ~10× cheaper.

### 2026-10-26 · Fresh repo, nothing copied

The rules disqualify work that can't be separated from what existed before. The author's earlier copilot (in hermes-os) is declared in the README, and no code, prompts or assets are copied from it. Lessons (latency targets, the one-card-at-a-time deck, ≤90-character cues) are reimplemented from scratch.

### 2026-10-26 · Node 22 + TypeScript without a build step, zero runtime dependencies

Node 22.18+ runs `.ts` directly and ships `fetch` and `WebSocket`. Fewer moving parts for a ten-day build, and judges can run it with one install. Dev dependencies only for type checking.

### 2026-10-26 · Recordings never enter the repo

`*.wav`, `recordings/` and `results/` are git-ignored. Demo meetings are recorded only with everyone's consent.

### 2026-10-27 · XIAO ESP32-S3 Sense instead of ESP32-S3-CAM + INMP441

The XIAO carries the camera, a PDM microphone, 8 MB PSRAM and LiPo charging on a 21 × 17.8 mm board, and was in stock in Bogotá. Fewer parts to wire, a smaller clip (49.8 × 21.6 × 26.2 mm modelled), and charging through its USB-C without opening the case.

### 2026-10-28 · Free Meta credits: own voice and public media only

Billing states that content sent on free credits may be used for product improvement. That conflicts with "nothing said in a meeting trains models", so tests use the author's voice and public media, and the demo meeting is recorded with informed consent (or on paid usage). The README claim is scoped accordingly.

### 2026-10-28 · Spec-driven with OpenSpec

Behavior lives in `openspec/specs/` (baseline of the pilot, 8 capabilities) and each new piece of work is an OpenSpec change with proposal, specs, design and verifiable tasks. Judges can read what Lente does without reading code, and every task names how it was verified.

### 2026-10-28 · One protocol, two transports

Every audio source (the clip, the desktop page, the emulator) speaks the same versioned frames; TCP on the LAN, WebSocket where TLS and proxies matter. Learned from open glasses projects that keep their wire protocol as a tested, versioned module. Opus is reserved, not used: PCM16 at 256 kbps fits Wi-Fi and decoding Opus in Node would need a dependency.

### 2026-10-28 · Memory as files and long context, not RAG

Meetings, profile and traces are JSON/JSONL in `data/`. The memory prefix only grows at the end, so prompt caching keeps it cheap. Embeddings and a vector store would add a dependency and land on the hackathon's "basic RAG" list.

### 2026-10-28 · MCP is the extension surface

The glasses and memory are exposed as MCP tools with a bearer key, and Lente's agent uses external MCP servers the wearer configures. No plugin store. Consent rules live in the tool handlers.

### 2026-10-28 · ElevenLabs for spoken output only

Meta's API has no text-to-speech. Speech out uses the phone's own voice by default and ElevenLabs when configured; all understanding, replies and decisions stay on Meta's models.

### 2026-10-28 · Brand "Calibre", card "Dilo"

Every competitor site measured (Even Realities, Cluely, Omi, Brilliant Labs, Mentra) is light, gadget or fashion styled, and Cluely sells being undetectable. Lente takes the opposite ground: a dark, calm instrument where cyan marks only the line to say and amber only measured numbers, with a visible listening state. The product keeps the name Lente; its one action is "Dilo".
