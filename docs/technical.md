# Lente: technical overview

What each Meta model does, every measured number, privacy, the architecture, the status of each surface and the prior art. Back to the [README](../README.md).

## How it uses Meta's models

Each model has its own job, and every job is timed by a script in [`scripts/`](../scripts).

| Job | Model and mode | How Lente uses it |
|---|---|---|
| Hear the meeting and tell speakers apart | `muse-voice-transcribe-1.0`, `DIARIZATION`, realtime WebSocket | Speaker labels let the hub decide a question was aimed at *you*, and never answer your own lines |
| Hear you talk to Lente | `muse-voice-transcribe-1.0`, `ENDPOINTING` | Your turn is ready about a third of a second after you stop |
| The Dilo reply and its Spanish meaning | `muse-spark-1.3`, minimal reasoning, streamed over the Responses API | One sentence in the language of the question, plus `ES:` with its meaning, in one call |
| Read what the camera sees | `muse-spark-1.3` with image input | The slide, screen or whiteboard in front of you, and live reads while you walk |
| Eyes for someone who cannot see (Ver) | `muse-spark-1.3` with image input, minimal reasoning, streamed | One spoken sentence, the most important thing first, or `=` and silence when nothing changed; a look answers the person's own question or reads all the text; never guides movement, never names a person |
| The voice agent | `muse-spark-1.3` with function calling and `web_search` | Tools over your memory, projects and tasks, the recording sheet, the web and delegation to an agent |
| Notes, titles, topics, memory cards, day/week/month digests | `muse-spark-1.3` with structured output | Every item carries the turn it came from; ungrounded items are dropped |
| Answers from your memory | `muse-spark-1.3`, one streamed call over a local index (words + vectors) | Cites the meeting and the turn; says «No lo encuentro» instead of guessing |
| Fast lane | Muse Spark Open (`meta-models/muse-spark-open-1026`) on Baseten, open weights | Provider routing with fallback and a cool-down after three failures |

<!-- TODO(orch): once Practicar's Android screen merges (L4), add a row: | Coach the piano (Practicar) | `muse-spark-1.3`, one streamed call per attempt | One or two warm, specific sentences after each try, from the notes the phone heard; the attempt is kept as one line of text so «¿cómo voy con el piano?» has an answer | -->

## Measured

Every number comes from a script run recorded in [docs/benchmarks.md](benchmarks.md), on synthetic speech and synthetic memories (no real meeting data).

| What | Result | Run |
|---|---|---|
| Question ends → Dilo card on the phone | 3.02 s p50 · 4.75 s p95 (n = 17) | `pnpm eval`, 10 dialogues, 2026-10-28 |
| Reply model time | 1.29 s p50 · 1.86 s p95 | same run |
| "Was this question for me?" | 76% precision · 81% recall | same run |
| Look → description card | 1.26 s p50 · 1.51 s p95, 5 of 5 | same run |
| Talk with Lente: you stop → turn ready | 323 ms p50 (n = 10) | `scripts/bench-voice.ts`, 2026-11-02 |
| Talk with Lente: you stop → first sentence of the answer | 3.21 s p50 · 4.78 s p90 | same run |
| Memory answers: accurate with the right source | 90 of 105 (the earlier two-call path: 17 of 105) | grounding eval, 2026-11-03 |
| Memory answers: refusals on out-of-memory and out-of-project traps | 25 of 25 | same run |
| Memory answers: time to the answer | 3.01 s p50 · 4.30 s p90 | same run |
| Memory index, 90 days (108,000 units) | 12.2 ms p95 per query | `pnpm bench:ask --index-only` |
| Turn on the hub → event on the phone | 6 ms p50 (USB) | 2026-10-29 |
| Speech audio kept per hour | 28.8 MB (IMA ADPCM, no dependency) | `scripts/bench-media.ts` |
| Ver, live read with the first (checklist) prompt: frame → description on the phone | 5.33 s p50 · 6.27 s p90 (n = 13); 11 of 33 reads silent because nothing changed | `scripts/bench-sight.ts` on the clip, 2026-11-04 |
| Ver, live prompt A/B: time to the first token | one sentence 3.08 s p50 against the checklist's 5.50 s (n = 6 each, half the output tokens) | `scripts/bench-sight-prompts.ts`, 2026-11-04 |

<!-- TODO(orch): ship-hackathon 6.3 (sight-v2 on the clip, one-sentence prompt) row here, and replace the checklist row if it is better; add-practice-mode 5.2 rows (note accuracy, onset → note shown, attempt → coaching line). Numbers only from docs/benchmarks.md. -->

**Privacy.** Lente only calls standard-mode endpoints, never the `-contributor` tier. Each user's memory is sealed with AES-256-GCM under their own data key before it reaches the database. For the hub's owner, and with «Guardar audio» and «Guardar fotos» on, Lente also keeps the speech audio of each segment and a photo when the scene changes: sealed with the wearer's key, played only through the hub, deleted after 30 days by default (7 or 90 to choose), with a forgotten day or a deleted meeting. Other accounts keep the text alone until they accept terms that describe media (`openspec/changes/add-media-archive`). During the hackathon Lente runs on Meta's free credits, which allow content to be used for product improvement, so the author's own testing uses his voice and public media, and anyone in the demo meeting agreed to it.

**Preview terms for everyone who signs in.** Before anything else, each new account accepts short terms, in Spanish and English, at [/terminos](https://drew-lizcano--lente-hub-hub.us-east.modal.run/terminos) and [/privacidad](https://drew-lizcano--lente-hub-hub.us-east.modal.run/privacidad); until then every data route answers 428 `needsTerms`. They say that Lente is a hackathon prototype, not a medical or mobility device; that memory is kept as text, sealed per account, and that audio and photos are kept only for the owner, whatever the switches say; that model calls run on Meta's free credits, which allow content to be used for product improvement, so nothing sensitive should be shared; and that deleting the account deletes everything in it.

**Ver describes; it never guides.** It never tells the wearer to move, cross, wait or go, never says a path is safe, and never names a person or guesses who someone is from a face. Asked «¿puedo cruzar?», it says what it sees and that it cannot know whether moving is safe. This holds in every sight prompt, in a guard on questions about moving, and in the voice agent's instructions, each with tests. The address behind «¿dónde estoy?» is worked out on the phone and goes to the model only, never stored or logged.

## Architecture

```
 clip on the glasses ─────┐      (XIAO ESP32-S3 Sense: camera, mic, LED, motor)
 the phone as mic/camera ─┼─WebSocket─▶ Lente hub (Node 22, no runtime dependencies, on Modal)
 a Meet/Zoom tab (web) ───┘                │
                                           ├─▶ Muse Voice Transcribe: diarization · endpointing
                                           ├─▶ Muse Spark 1.3: Dilo, vision, notes, voice agent, memory answers
                                           ├─▶ Muse Spark Open on Baseten: fast lane
                                           ├── per-wearer memory index (words + vectors), sealed in Supabase
                                           └── /mcp · lente CLI · agent bridge ─▶ Claude Code / Codex, after you approve
                                           │
                                         SSE
                                           ▼
          Android app · web app at /app: Dilo card, live transcript, chat, voice, Recuerdos, tasks, meetings
```

The full plan is in [docs/architecture.md](architecture.md). What Lente does is specified in [`openspec/specs/`](../openspec/specs); what comes next is in [`openspec/changes/`](../openspec/changes).

## Status

The hosted hub runs `main` on Modal at <https://drew-lizcano--lente-hub-hub.us-east.modal.run/app> (`/health` is public). During judging, through 2026-11-16, anyone can sign in with Google on the web app or the Android app and gets their own sealed memory, starting with a small synthetic sample («PROBE · Proyecto de ejemplo») to ask about; «Borrar ejemplo» in Ajustes removes it. Each account has a daily spend cap of US$ 1.00 and the whole demo one of US$ 6.00, so the free credit lasts through judging and the vote; past a cap Lente says so kindly and pauses. On 2026-11-17 sign-up closes again to the allow list, and existing accounts keep signing in. The project website is <https://rulocode.github.io/lente/>. Without an account, a key or a clip, `pnpm demo` runs the whole app locally on a synthetic sample ([Run it locally](#run-it-locally)).

What runs today:

- **The hub:** `pnpm pilot` locally or on Modal in cloud mode. Accounts with Sign in with Google, one live runtime per user, memory sealed per user in Supabase Postgres (Row Level Security, no policies), device tokens for clips and phones.
- **The clip:** firmware in [`firmware/lente-clip`](../firmware/lente-clip) for the Seeed XIAO ESP32-S3 Sense (audio and photos over Wi-Fi, the microphone on its own task so a photo never drops speech, LED and motor cues) and a hardware self-test in [`firmware/selftest`](../firmware/selftest). Parametric cases for any glasses in [`hardware/`](../hardware) with STL files and a 3D viewer.
- **The Android app:** a native app in [`android/`](../android) (Kotlin, Jetpack Compose): Inicio with the Dilo card, the live transcript and summary, chat and voice with Lente, Recuerdos with the day's real moments, meetings, projects, tasks by owner, notifications, and the phone as an all-day stand-in for the clip with the screen off.
- **The web app:** `/app` on the hub, plain ES modules with no build: the same sections, a chat beside every screen, ⌘K search, and recording from this computer's microphone, camera or a Meet/Zoom/Teams tab.
- **Agents:** an MCP server per user at `/mcp`, a `lente` CLI and an agent bridge that runs approved jobs with Claude Code or Codex on your own machine.
- **Ver:** an assist mode beside Asistir and Solo grabar, for someone who is blind or has low vision. The hub narrates the clip's view one sentence at a time and stays silent when nothing changed, drops a description that would arrive more than 6 s after its frame, and answers a look by tap or by voice (a question about the view, or all the text read aloud). The Android Ver screen is one large target (tap to look, long press to talk, two-finger tap to pause narration), with every action reachable from TalkBack and the app's own voice silent while TalkBack speaks. A guest session keeps nothing. In conversation, Lente welcomes the person in a Colombian voice, learns their name and what they want help with (kept only while the session runs), explains how it works, and narrates when asked; «¿dónde estoy?» answers with the street and neighbourhood from the phone's own location; «quédate callada» keeps recording quietly until a long press.
<!-- TODO(orch): the hub's practice routes are live (lessons, attempts, coaching); once the Android screen merges and add-practice-mode 5.2 is green, add: "- **Practicar:** the piano. Three short public-domain lessons; the phone hears each note itself (a YIN pitch tracker in Kotlin, no audio sent), marks each one right or wrong, and after each try Lente says one or two sentences of coaching in the same voice. The attempt is kept as one line of text, so «¿cómo voy con el piano?» has an answer." -->

Not done yet, and not shown in the demo: the full consent change (legal review, a room notice, the recording light, retention; the preview terms cover judging), Wi-Fi setup over Bluetooth, the Play Store release, a full benchmark of the Muse Spark Open lane against Spark 1.3, the closing agent running on its own after each meeting, and the clip's battery life.

Planned next, specified but not built:
- **Lente apps** (`openspec/changes/add-lens-apps`), planned: a catalog of apps for the glasses, each a declarative manifest the hub interprets, with permissions granted at install, a sealed trial and review before listing; Dilo, Ver and Practicar would be the first listings.
- **A language coach** (`openspec/changes/add-language-coach`), planned: Portuguese and French on the glasses, a spoken placement with an estimated level, «Dime cómo se dice», «Nombra lo que veo», «Tradúceme» and gentle corrections.

## How it's built

- **Spec first.** Every feature is an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change with a proposal, a design, specs and tasks; finished changes are archived into `openspec/specs/`. Decisions and their rejected alternatives are in [docs/kb/decisions.md](kb/decisions.md).
- **No runtime dependencies on the hub.** The WebSocket server, the MCP server (Streamable HTTP), the IMA ADPCM codec, the memory index and the Supabase client are written in TypeScript in [`src/`](../src) and run on Node 22 without a build step.
- **Pure core, edges at the edges.** Logic lives in pure modules with unit tests (863 in [`test/`](../test)); sockets, files and model calls stay in the hub. `pnpm smoke` runs clip emulator → hub → stubbed Meta API end to end; `pnpm android:e2e` drives the app on an emulator or phone.

## Related work

Lente is built around the moment you are addressed in a second language, works on any glasses (or none, with the planned desktop mode), and keeps its agents approval-gated and verifiable. These projects are prior art; nothing from them is copied:

- [Omi / omiGlass](https://github.com/BasedHardware/omi): open-source AI wearable; omiGlass uses the same XIAO ESP32-S3, over BLE.
- [OpenGlass](https://github.com/BasedHardware/OpenGlass): the original "turn any glasses into AI glasses" clip.
- [MentraOS](https://github.com/Mentra-Community/MentraOS): smart-glasses OS with a cloud transcription service.
- [Brilliant Labs SDK](https://github.com/brilliantlabsAR/brilliant_sdk): open AR glasses with an on-device runtime.
- [Even Realities EvenDemoApp](https://github.com/even-realities/EvenDemoApp): published protocol for display glasses with conversation prompts.
- [free-cluely](https://github.com/Prat011/free-cluely) and [Recap](https://github.com/RecapAI/Recap): desktop meeting assistants and capture.
- "The Entire History of You" (Black Mirror, series 1, episode 3, 2011): a timeline of rings and re-watching any moment, cited as the idea behind the planned Tu historia · Revivir (`openspec/changes/add-memory-timeline`); Lente turns its ending around (private and sealed, a nudge instead of a loop, forgetting a day) and uses no image, layout or text from the series.

Agent memory (the memory engine, `openspec/changes/add-memory-engine`). These are cited for ideas only, listed in the change's `design.md` with what each one inspired; no code, prompt or schema was opened to copy, and their published benchmark numbers are theirs, not Lente's:

- [mem0](https://github.com/mem0ai/mem0): hybrid retrieval with an entity layer; the move to add-only fact extraction.
- [Letta](https://github.com/letta-ai/letta): sleep-time agents that consolidate memory while the user is idle.
- [Zep](https://github.com/getzep/zep) and [Graphiti](https://github.com/getzep/graphiti): episodes as the source of truth, validity windows on facts, relative dates resolved before search.
- [LangMem](https://github.com/langchain-ai/langmem): memory formed in the background, namespaces as scope.
- [Memobase](https://github.com/memodb-io/memobase): a profile plus a timeline, written in buffered batches.
- [supermemory](https://github.com/supermemoryai/supermemory): a static and a dynamic profile answering before search.
- [HippoRAG 2](https://github.com/OSU-NLP-Group/HippoRAG): passages kept as nodes next to the facts drawn from them.
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval): fact-augmented key expansion and time-aware query expansion; its question kinds shaped the recall set.
- [Omi](https://github.com/BasedHardware/omi): conversations closed by a silence timeout.
