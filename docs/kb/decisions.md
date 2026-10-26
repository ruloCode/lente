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
