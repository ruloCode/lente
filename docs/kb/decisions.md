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

### 2026-10-28 · Code-only nodes can build in Claude Managed Agents, with no write access

The local lane spends the owner's Claude plan and runs on the machine that holds `.env`, the clip and the phone. Most open nodes need none of that, so `add-cloud-auto-lane` lets them build in a Managed Agents session billed to the "Build Day Fable 5.1" workshop credit. The cloud gets the repository read-only at `origin/main` and returns a patch; the runner checks every touched path, applies it and keeps CI's gates, the local review and the commit, so "only the runner commits" still holds and no GitHub write token ever leaves the Mac. Claude Code's guard hook does not run in the cloud, so isolation replaces it: no secrets in the clone, limited network, web tools off. The Claude Platform key lives in a file outside the repo and never in `.env` or any environment, because the lane spawns `claude`, which would bill the API credit instead of the plan if it found `ANTHROPIC_API_KEY`. Plain `fetch`, no SDK: the API is a handful of JSON calls and SSE.

### 2026-10-28 · Spend control: start paused, a silence gate on the hub, idle auto-pause

An all-day clip must not spend when nobody needs it, so the hub starts paused and only the phone starts listening. The silence gate runs on the hub, from the level of the conditioned audio it already computes, not on the clip: no firmware change, and the clip's level meter and the wearer's loudness keep working while nothing is sent. A frame is speech when its RMS clears both 300 and three times the quietest frame of the last 10 s; the noise-floor rule keeps a fan or an air conditioner from holding the gate open, so a steady tone counts as noise (the smoke test's synthetic audio has syllable gaps for that reason). On the bench, sampled every 200 ms at the clip, a quiet room read 94 to 281 and speech from the Mac speakers at volume 70 read 287 to 491; the wearer's own voice is closer to the microphone. 300 is a starting point (`PILOT_SPEECH_RMS`), to be tuned on real wear. The gate sends a 480 ms pre-roll first and keeps sending for 1.6 s after the last speech frame, because the service needs trailing silence to end a turn. The service closes a session that gets no audio (1008), so the session stays closed in silence and the next speech opens a new one. The cost: a new session means new speaker labels, so the wearer is identified again after each long silence.

Idle auto-pause goes by the wearer's voice once a label is known, so a TV doesn't keep Lente running; with no label it goes by anyone speaking, as the spec says. Once the wearer was identified it keeps going by the wearer until listening starts again, because the session the gate reopens after a silence forgets the labels, and re-identifying takes two speakers and three turns: otherwise the TV after a pause would count. Only a meeting started by hand exempts it: Solo grabar's episodes open on any voice, a TV included, so counting them would undo the point. The usage meter prices from the list prices in `docs/kb/meta-api.md` and keeps numbers only in `data/usage.json`; Spark Open on Baseten has no list price there, so its tokens are counted and left out of the US$.

### 2026-10-30 · A native Android app in Kotlin and Compose, on the hub's existing contract

The wearer leaves home with the clip and the phone, and the phone stays in a pocket. A browser stops the microphone when the screen turns off, opens it only over HTTPS, and cannot vibrate or speak from the background, so the page could not be the all-day stand-in for the clip. The app is Kotlin with Jetpack Compose: it builds with the Android SDK and Gradle alone, its UI is native views, and the parts that matter (a foreground microphone service, Camera2 stills, vibration, text-to-speech) are platform APIs with no bridge. React Native or Expo would add a JS toolchain and a bridge for exactly those parts; a WebView would keep the browser's limits. The hub does not change: the app follows `GET /events`, posts to the same routes and speaks clip protocol v2 on `/device` as `lente-phone`, so there is still one place with logic. Its pure core (`app.lente.core`: frames, SSE, the state reducer, copy, tokens and contrast) is tested on the JVM against `test/fixtures/frames.json`, `src/theme.ts` and an event stream recorded from the stubbed hub. Runtime dependencies live only in the APK: AndroidX Compose and OkHttp, because Android ships no WebSocket client; JSON uses the platform's `org.json`. The release build is shrunk to 2.75 MB and signed with the debug key, a build to sideload, not a store release.


### 2026-11-01 · Sign in with Google on Android through Credential Manager (add-accounts)

The app signs in with the system's Google account picker, not a browser redirect: AndroidX Credential Manager (`androidx.credentials` and `credentials-play-services-auth` 1.6.0) with Google's ID token type (`googleid` 1.2.1), the three runtime dependencies the accounts design names. The picker gets the Web client ID and the SHA-256 of a random nonce; Supabase Auth gets the ID token with the raw nonce over OkHttp, which the app already ships, so no Supabase SDK. The session is sealed with AES-GCM under a key that stays in the Android Keystore. The release APK grows from 2.75 MB to 3.72 MB, measured after R8, almost all of it Play Services Auth. Lint's `InvalidFragmentVersionForActivityResult` is turned off because it reads the fragment version that library declares (1.1.0) rather than the one the build resolves (1.5.7).

### 2026-11-02 · The desktop web app is plain ES modules served by the hub, with no build

Lente on a computer needs every function of the Android app in a browser, against the laptop hub and the cloud hub with accounts. The app (`web/app/`, add-web-desktop) is JavaScript modules the browser loads as they are, one stylesheet, and no framework: the hub has no bundler, the deadline leaves no room for a toolchain, and judges can read the code as it runs. The pure parts (`web/app/lib/`) carry `// @ts-check` and are typechecked through `allowJs` and tested with `node --test`; the views build DOM with a small element helper. What the browser shares with the hub is generated, not copied: `src/web-app.ts` serves the `/desktop` capture pipeline, the transcript reducer and the theme as modules built from the hub's own tested code. The page holds no token (only the hub's `HttpOnly` cookie) and runs under a CSP with no inline script or style, so the mark and the AudioWorklet are served as files. Rejected: React or Preact (a dependency and a build), and TypeScript served through Node's `stripTypeScriptTypes` (still experimental in Node 22, and it warns at start).

### 2026-11-02 · Voice mode: endpointing, a Spark tool loop on the Responses API, the phone's own voice

Talking with Lente is a separate session (`/voice`), not the meeting pipeline.

- **Transcription.** Meta documents `DIARIZATION` as "not tuned for low-latency voice commands", so the session runs its own transcription in `ENDPOINTING` mode. Measured: the turn is ready 323 ms (p50) after the wearer stops.
- **The agent.** One Muse Spark 1.3 tool loop over the Responses API, because web search exists only there (not on Chat Completions) and can share a request with function tools.
  - It is stateless (`store: false`), so Meta keeps no copy of the conversation.
  - Its instructions go as a `developer` message: the top-level `instructions` field was never served from the prompt cache when measured.
- **Speaking.** Replies reach the phone one sentence at a time, and the phone speaks them with its own text-to-speech, as everywhere else in Lente. It needs no network, and ElevenLabs is not Meta's.
  - The model's commentary before a tool ("Lo anoto en tu lista") is spoken too, so the first sound comes about a second before the answer.
- **Confirmation is code, not prompt.** Completing or deleting leaves one pending action that only a spoken yes runs, checked before any model call. Delegating, without an agent bridge, leaves a task for Lente.
- **Barge-in runs on the hub.** A partial of two or more words that is not an echo of what Lente just said (`NarrationGuard`) cancels the turn's request. The phone records with `VOICE_COMMUNICATION` for the platform's echo canceller.
- **Measured** (`scripts/bench-voice.ts`, 10 turns): first sentence 2.15 s and first answer sentence 3.21 s at p50, US$ 0.0044 per turn.
- **Next.** The 1.5 s target is met only without tools. The next lever is the first step on the fast lane, once Spark Open's function calling is verified.

### 2026-11-02 · Agents reach Lente with per-user scoped tokens, and Lente's jobs run only on the user's machine (add-agent-bridge)

- **MCP server, hand-written.** `add-glasses-mcp` planned one key in `.env`. With accounts, a key must belong to one user, so agent tokens are `mcp` devices with scopes: read by default, task writes and the bridge only when asked. The server is written by hand over the hub's HTTP server, with no dependency:
  - It speaks the current MCP revision (2026-07-28, stateless, headers checked against the body) and the `initialize` revisions, because clients still ship both.
  - Claude Code 2.1.316 turned out to use the current one.
  - Replies are single JSON objects; no tool needs a stream.
- **Jobs.** A job is an `agent_actions` row with tool `run_agent`, so "nothing runs without approval" is the same code path as the closing agent's proposals. Approving only queues the job: the hub never runs a process. The bridge runs it on the user's computer, in a folder from a local allow list, with the most restrictive flags each CLI offers that still let it edit. Its token sees only the queue of approved jobs, never transcripts.
- **The chat.** A command in the chat is recognized by a new `intent` field in the same structured Muse Spark call, not a second call. A pure check on the sentence (an imperative or a named agent) must agree, so a question can never become a job.
- **Copied from nowhere.** Omi's hosted MCP server with per-user keys, read-only defaults and a CLI with `--json` and exit codes was the product reference; no code was used from it.

### 2026-11-03 · Vectors in the memory index (add-memory-engine)

The owner decided that the memory index ranks by meaning as well as by words. This supersedes "Memory as files and long context, not RAG" (2026-10-28) and the embeddings line under "Rejected" in `add-accounts` decision 7. Wearers ask in Spanish, in their own words, about meetings held in English. Lexical search and bilingual keys catch names and numbers but miss paraphrases. The model call that translated terms (the lookup plan) took 1.5–6.2 s per question in the 2026-11-03 probe.

- **How the old objections are met.**
  - "They leak meaning": vectors are content, sealed in per-user snapshots, searched only in the wearer's runtime, never stored or logged in plain text.
  - "A model Lente does not use": the Meta Model API has no embedding model (`GET /v1/models`, 2026-11-03). A bake-off (`add-memory-engine` 8.4) picks between a Meta open-weights encoder on Modal (preferred within the limits) and a small multilingual encoder in the hub. The winner, its numbers and, for the hub encoder, the runtime dependency and the rejected zero-dependency alternative are added here.
  - "Basic RAG": the vectors are one list in a hybrid ranking inside a wearable's consolidated memory (segments, cards, briefs, validity windows). It lands after the hackathon submission.

### 2026-11-03 · Lente keeps the day as audio, keyframes and text (add-media-archive)

The owner decided that Lente keeps speech audio and scene-change keyframes next to the text, so a remembered moment can be heard and seen again. This supersedes "Solo grabar keeps text only" (2026-10-28) and "Photos. Never stored" in `add-accounts` decision 6, once `add-media-archive` lands. Until then every screen and doc keeps saying text only, because that is what runs.

- **What stays.**
  - Speech only, never silence.
  - Frames only on a scene change.
  - Sealed per chunk with the wearer's data key.
  - Expiring (30 days by default).
  - Never shared, never sent back to a model.
- **Defaults.** On by default for the owner. For any other account, only after it accepts a terms version that describes media (`add-consent`). Consent is a legal duty toward the people recorded, not a product promise, so it is not dropped with the old promise.
- **Hardware.** The clip sends JPEG frames, not video. "Video" means a keyframe timeline.

#### The encoder: a small multilingual encoder in the hub (add-memory-engine 8.1–8.4, 2026-11-03)

**Candidates (8.1).**
- The Meta Model API still lists no embedding model (`GET /v1/models`, 2026-11-03): `muse-image-1.0`, `muse-spark-1.1`, `1.2`, `1.3` (and their contributor variants), `muse-voice-transcribe-1.0`, `muse-wonder-1.0`, `sam-3.1`.
- **C, a Meta open-weights encoder on Modal.** SONAR (facebookresearch) has MIT code, but its checkpoints on Hugging Face (`facebook/SONAR`) are **CC-BY-NC-4.0**. It gives 1024-dimension vectors for about 200 languages and needs fairseq2 with a matching PyTorch build.
  - The non-commercial licence fails the check for a product that will ship. The fairseq2 runtime rules out measuring it from a local run on the owner's Mac.
  - C is **pending**. `deploy/modal/encoder.py` and `ModalEncoder` are written, not deployed. The Modal function serves the hub's encoder until a Meta encoder with a fitting licence is found.
  - LASER is the next Meta family to check (not checked here).
- **B, the hub encoder:** `multilingual-e5-small`. MIT licence, 384 dimensions, 93 languages, run as its int8 ONNX build (`Xenova/multilingual-e5-small`) through transformers.js.

**The bake-off (8.4)** ran `scripts/eval/bake-off.ts` on `scripts/eval/recall-set.ts`: 105 answerable questions, 30 of them cross-lingual. The card keys came from the real notes call (US$ 0.47, cached). recall@10 / MRR:

| Configuration | All | Cross-lingual | Paraphrase | Exact | Time |
|---|---|---|---|---|---|
| Lexical only, no card keys | 0.362 / 0.342 | 0.133 / 0.133 | 0.267 | 0.833 | 0.067 |
| **A** lexical + bilingual card keys (baseline) | 0.524 / 0.425 | 0.400 / 0.286 | 0.200 | 0.833 | 0.800 |
| **B** A fused with e5-small | **0.686 / 0.554** | **0.600 / 0.463** | 0.500 | 0.833 | 0.933 |
| e5-small vectors alone (reference) | 0.676 / 0.628 | 0.767 / 0.725 | 0.700 | 0.833 | 0.133 |

B's costs, from the hub process on the owner's Mac:
- query embedding 2.4 ms p50, 3.9 ms p95 (limit 50 ms: qualifies);
- 8.1 ms per passage;
- vectors 43 MB per 100k units (limit 300 MB: qualifies);
- the encoder's runtime adds about **616 MB** of fixed RSS to the process.

**The choice: B.** By decision 7's rule, B qualifies and C is not measured, so B ships, and C stays pending. Lexical search with card keys alone (A) was not enough: cross-lingual recall@10 0.40 against 0.60, paraphrases 0.20 against 0.50.

- **The dependency.** `@huggingface/transformers` 3.8.1 (Apache-2.0), with the native `onnxruntime-node`.
  - It is an `optionalDependency`, loaded only when `LENTE_ENCODER=hub`. Without it the index ranks by words, and every other path is unchanged.
  - The Modal image installs no packages today (zero dependencies), so turning B on in production needs an install step in `deploy/modal/hub.py`. That change waits for the owner, with the deploy.
- **Rejected zero-dependency alternative:** A alone, numbers above. Also rejected: an encoder through a model API, because no Meta API offers one and text must not leave Lente's infrastructure.
- **Two cautions.**
  - The 616 MB is per process, not per wearer. It must be in the capacity measure (`add-accounts` 6.4) before B is turned on in the shared container.
  - Fusing the lists cost cross-lingual recall against vectors alone (0.60 vs 0.77) but gained time questions (0.93 vs 0.13). Weighting the lists is the next tuning. It is not tuned on this set, which is also the eval.

### 2026-11-04 · Ver describes and never guides movement (add-sight-mode)

Ver lets a person who is blind or has low vision use the clip's camera as eyes. It reads text, says what is held up, how many people are where, and the rest of the scene. It never tells the wearer to move, cross, wait or go, never says a path is safe, and never names or profiles a person from a face. Asked «¿puedo cruzar?», it describes what it sees and says it cannot know whether moving is safe.

- **Why:** a vision model at 2–7 s per frame (baseline in `docs/benchmarks.md`) cannot keep up with a street, and a wrong "go" can hurt someone. Describing is useful even when it is a few seconds late; guiding is not. Naming people from faces is out for consent and for the hackathon's rules.
- **Where it holds:** in every sight prompt (`src/sight.ts`), in a guard that adds the safety sentence to questions about moving (`movementGuard`), in the voice agent's instructions, and in tests for all three.
- **Rejected:** obstacle warnings and walking directions (too slow and too risky at this latency); face recognition («es Ana») (consent, and a profile of people who never agreed).

### 2026-11-04 · Sight is an assist mode, not a pipeline (add-sight-mode)

Ver is `assistMode: "sight"` beside Asistir and Solo grabar. It reuses the device link, the frame pacing and the live reads, and only swaps the prompt, turns cues off, and adds `look()` for taps and for the voice agent's `look` tool.

- **Silence is an answer.** The sight prompt answers `=` when nothing changed, and nothing is spoken. The meeting prompt never stayed silent in the baseline (0 of 36).
- **Late is dropped.** A description that arrives more than 6 s after its frame (`SIGHT_STALE_MS`) is not said: the wearer has moved on.
- **A failed look is said too,** as a `VER` card («No hay cámara conectada»), since the wearer can't see the screen.
- **Rejected:** a separate `/sight` endpoint (it would duplicate the device link and the runtime), and sending the frame to the voice agent's own call (one focused vision call is simpler to test and shows its own time).

### 2026-11-04 · Ver's live read is one sentence; the detail is a look (add-sight-mode)

Live reads say one short sentence, the most important thing first. The first prompt was a checklist (text, then what is held up, then people, then the rest).

- **Why:** on the clip the checklist doubled the time to the first token (3.92 s against 1.94 s p50), and 9 of 33 reads came too late to be said. On the same frames, one sentence took 3.08 s and 174 output tokens against 5.50 s and 327 (p50), and still read text word for word. Numbers in `docs/benchmarks.md`, «Sight mode».
- **The detail moved to a look,** which the person asks for by tap or by voice and which has room for three sentences, or for all the text (`SIGHT_READ_PROMPT`).

### 2026-11-04 · Judges sign in with Google: open sign-up with an end date and two spend caps (ship-hackathon)

During judging (Nov 5–16), anyone can sign in with Google on the web app and on Android and get their own sealed memory. A judge who cannot try the product scores only the video.

- **A mode with an end date, not a removed check.** `LENTE_SIGNUP` is `allowlist` (the default) or `open`, with `LENTE_SIGNUP_UNTIL`, set to 2026-11-17. After that date only existing accounts sign in, and a new one hears «Las inscripciones están cerradas por ahora». Both are plain config in `deploy/modal/hub.py`, so closing it is a one-line deploy. The check is pure: `mayCreateAccount` in `src/access-gate.ts`.
  - **Rejected:** reading an empty allow list as «everyone». An empty list keeps meaning «nobody»: that is the safe failure.
- **Two caps, checked before every model call** (`src/spend-cap.ts`, pure):
  - **US$ 1.00 a day per user.** At the measured US$ 0.267 per recorded hour (cards and transcription, 2026-11-03) that is over three hours of recording, or over 200 voice turns at US$ 0.0044 each (p50). Live narration in Ver makes a vision call every few seconds (36 in 125 s in the baseline), so it spends the cap fastest, and the cap bounds it the same way.
  - **US$ 12.00 a day across everyone:** Meta's US$ 150 credit spread over the 12 judging and voting days.
  - **The owner is exempt.**
  - The day's spend per user is kept in `usage_daily` (user, day, US$, no content; RLS on, no policies; written only by the hub), so a restart does not reset it. Days roll over in America/Bogota.
  - **When a cap is hit, nothing errors.** Model calls answer a short, kind Spanish line, and listening pauses with that reason.
- **Capacity:** the container grows to 2 GB and one CPU. `LENTE_MAX_LISTENING` stays at 4 until a measure says otherwise. Chat, look and voice hold no transcription session, so they are not capped by it.
- **Media (audio and keyframes) stays owner-only,** whatever the switches say.
- **Rejected:** a paid plan for the hackathon (Supabase Pro, a bigger Modal footprint). The caps keep the free credit safe instead.

### 2026-11-04 · Preview terms, accepted once (ship-hackathon)

A short terms and privacy page (`/terminos`, `/privacidad`, `TERMS_VERSION = "preview-2026-11-04"`), in Spanish and English, accepted once per account.

- **What it says:**
  - Lente is a hackathon prototype, not a medical or mobility device;
  - text memory is sealed per user, and audio and photos are kept only for the owner;
  - model calls go to Meta's Model API on free credits, which allow content to be used to improve the product, so nothing sensitive should be shared;
  - the account can be deleted at any time, with all its data;
  - questions go to the repository's issues.
- **How it holds:** until an account accepts the current version, every data route answers 428 `{ needsTerms: true }`, except the terms routes and sign-out. The web app and Android show one screen with the summary, the two links and «Acepto».
- **Why not the full `add-consent`:** legal review, the room notice, the recording light and retention take longer than a day. The preview terms say plainly what Lente is and is not during judging. The full change stays open for version 1.

### 2026-11-04 · New accounts start with a synthetic sample (ship-hackathon)

On first sign-in, after the terms, the hub writes a sample through the same sealed stores as everything else:
- one project, «PROBE · Proyecto de ejemplo»;
- two synthetic meetings from `scripts/eval/memory-set.ts`'s generator, one in Spanish and one in English, with notes, decisions and tasks;
- three open tasks;
- two kept facts.

All of it is marked `sample`, and «Borrar ejemplo» in Ajustes removes it and nothing else.

- **Why:** an empty memory has nothing to ask about. With the sample, a judge can ask «¿Qué se decidió sobre la beta?» in the first minute and get an answer with sources, before recording anything.
- **Only PROBE names,** from the eval generator: no real person or meeting enters a judge's account. The site's screenshots come from a test account holding only this sample.

### 2026-11-04 · A static website on GitHub Pages and the APK as a release asset (ship-hackathon)

- **The website** is `site/`: plain HTML and CSS in Spanish (`/`) and English (`/en/`), no framework and no build step, published by `.github/workflows/pages.yml` on pushes to `main` that touch it.
  - It links to the web app («Entrar con Google») and to the APK («Descargar para Android», with a QR code).
  - Every number on it is in `docs/benchmarks.md`.
  - The generated concept images in `docs/promo/` are labelled as concepts or left out.
  - **Why:** it is the zero-dependency way to give judges one page with the video, the two ways in and how to build the clip. It is served from the repository the judges already read.
- **The release** is a GitHub Release whose asset is named `lente.apk`, so `releases/latest/download/lente.apk` stays the same link from one version to the next (`v0.2.0-hackathon`, `versionName 0.2.0`).
  - It is built on the owner's Mac, signed with the key whose SHA-1 the Android OAuth client lists. Google sign-in refuses an APK signed with any other key.
  - **Rejected:** building the APK in CI (a different key, so sign-in fails) and the Play Store for now (that is `add-store-release`, after `add-consent`).
