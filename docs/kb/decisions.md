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

### 2026-10-28 · Side menu, planned features visible as "Pronto", phone copy in Spanish

The phone page follows the layout system measured from the Meta AI app (`docs/kb/ui-reference.md`): a calm Ahora with the live loop, everything else one tap away in a side menu. Planned features are listed greyed out with "Pronto" and a one-sentence screen, so the whole product is legible while nothing unbuilt is presented as working (the rules disqualify a demo that does). All phone copy is Spanish for the wearer; the DILO line stays in the meeting's language; docs and code stay in English.

### 2026-10-28 · The phone can stand in for the clip; Solo grabar keeps text only

When the clip is missing, the phone's microphone and camera feed the hub over the same clip protocol (WebSocket ingest shared with desktop mode); browsers require HTTPS or localhost for that. "Solo grabar" records the day and learns from automatic episodes without real-time cues; "recording" means the transcript as text, never audio, the same promise as the rest of Lente.


### 2026-10-28 · Cards stream over the Responses API so every stage is timed

A slow DILO has to be blamed on one stage (audio at the hub, transcription, speaker label and addressing, first token, rest of the reply, hub, delivery), so the reply must be streamed to time its first token. Streamed Chat Completions on the Meta API report no token usage, which the eval needs; streamed Responses calls report it, cache hits included. So the cue, Look and live calls stream over `/v1/responses`; notes and briefing keep Chat Completions with `response_format`, where the whole answer is needed anyway. Delivery is timed by the phone acknowledging each card (`POST /seen`): measured on the hub's clock, an upper bound by one Wi-Fi hop, with no clock sync between laptop and phone.

### 2026-10-28 · Lente is built by an auto lane, with brakes a model can't talk past

Seven days remain and most tasks are agent work. One lane, not a fleet: almost every change touches `src/pilot.ts`, so parallel lanes would spend their gains on merge conflicts. The lane's brakes are deterministic: the runner (not the model) runs CI's checks, a guard hook enforces the hard rules, and only the runner commits. The second opinion is Muse Code, a different model from the builder and Meta's own coding agent, in standard mode. Hardware stays in the loop over USB (the clip via arduino-cli, the Android phone via adb and Chrome DevTools), and anything only a person can judge is tagged `[human]` and shown on the progress page instead of guessed. No dependency added: the runner shells out to `claude`, `muse`, `git`, `arduino-cli` and `adb`.


### 2026-10-28 · The Spanish meaning rides in the reply call

The wearer reads Spanish and says English, so an English DILO line carries what it means in Spanish. It comes from the same Muse Spark 1.3 call as a second line (`ES: …`), not from a second call: a second call would add a full round trip (about 1.3 s of model time) or a card that changes after it appears. Measured on the eval set (`docs/benchmarks.md`), the cue went from 2.94 s to 3.25 s at p50 and from 3.74 s to 3.77 s at p90, and 14 of 14 English cards carried a meaning. The parser in `src/briefing.ts` drops the meaning when it is missing, when the question or the line is Spanish, or when it repeats the line, so the card never waits or retries for it. If the median cost holds up, the next step is to publish the line at the first newline of the stream and the meaning just after it, on the same call. Meeting notes follow the same rule: written in Spanish whatever the meeting language, with names and terms as they were said; transcription is biased Spanish first but stays in the language spoken.

### 2026-10-28 · Meta's models run inside Lente, not in the lane that builds it

The owner chose to keep the Meta Model API credit for the product: transcription, DILO replies, notes, vision and the evals that measure them. The auto lane's second opinion was Muse Code; it is now a fresh Claude Code session in read-only plan mode that gets only the diff, the builder's report and the repository, with none of the builder's context. It is the same model family as the builder, so it is a second reader rather than a second model; the deterministic brakes (CI's gates, the guard hook, only the runner commits) are unchanged. Its cost counts against the lane's budget like the builder's. Muse Code stays documented for anyone who runs it by hand (standard mode only).

### 2026-10-28 · The phone runs the hub's transcript reducer, not a copy of it

The live view's rows (one per turn, a live row for the turn in progress, no duplicate when a turn completes or a reconnect snapshot repeats it) are the part most likely to drift if written twice. `src/transcript-view.ts` is pure and import-free, and `TRANSCRIPT_PAGE_SCRIPT` carries its functions into the page as Node prints them after stripping the types, so the page and the unit tests run the same code with no bundler and no runtime dependency. A test runs the page's copy against the module's on the same events.
