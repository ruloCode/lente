# Lente architecture

Lente is an ambient meeting copilot for people who work in their second language. A clip on any pair of glasses hears and sees the meeting; a hub uses Meta's models to notice when the wearer is being asked something and shows one line to say (the **Dilo** card); after the meeting, a verifiable agent turns what was agreed into done work, with the wearer's approval.

This document is the plan before code: the applications, the stack, the interfaces, how it runs, how data is handled, how quality is kept, and the order of work. Behavior is specified in [`openspec/specs/`](../openspec/specs) (what exists) and [`openspec/changes/`](../openspec/changes) (what comes next).

## 1. Applications

One hub, several ways in. Every source of audio and pictures speaks the same clip protocol, so the hub has one code path.

| Application | Job | Runs on | Stack | Status |
|---|---|---|---|---|
| **Clip firmware** | Hear, see, signal (LED, vibration) | Seeed XIAO ESP32-S3 Sense on the glasses | C++ on Arduino-ESP32 3.3.x, `esp32-camera`, `ESP_I2S` (PDM) | Pilot running (`firmware/lente-clip`) |
| **Hub** | Transcription, cues, vision, memory, agents, MCP | Laptop on the LAN today, Modal later | Node 22.18+, TypeScript run natively, zero runtime deps (`node:http`, `node:net`, `fetch`, `WebSocket`) | Pilot running (`src/pilot.ts`) |
| **Companion app** | Read the Dilo card, see the camera, control modes, approve actions | The wearer's phone | One HTML page served by the hub, SSE down, POST up, installable (manifest); side menu, sections, first-run introduction, all copy in Spanish | Running (`src/pilot-page.ts`, `add-app-navigation`) |
| **Android app** | The same companion, native, and the phone as an all-day stand-in for the clip | The wearer's Android phone | Kotlin, Jetpack Compose, OkHttp; same SSE and routes as the page, clip protocol v2 over the `/device` WebSocket from a foreground service (screen off) | Running (`android/`, `add-android-app`) |
| **Phone capture** | Use the phone's microphone and camera when the clip is missing | The wearer's phone | The same page: `getUserMedia` → 16 kHz PCM → clip protocol over WebSocket; needs HTTPS or localhost | Planned (`add-phone-capture`) |
| **Clip emulator** | Run Lente with no hardware (judges, CI, demo fallback) | Any computer | Node script speaking the clip protocol | Done (`harden-clip-protocol`, archived) |
| **Desktop mode** | Use Lente on Meet/Teams/Zoom without the clip | Chrome on a computer | Browser page: tab capture → 16 kHz PCM → clip protocol over WebSocket (the ingest `add-phone-capture` builds) | Planned (`add-desktop-mode`) |
| **MCP server** | Glasses and memory as tools for any agent | Inside the hub | JSON-RPC over Streamable HTTP at `/mcp`, bearer key | Planned (`add-glasses-mcp`) |
| **Site** | Landing with the video, open-hardware build guide, 3D viewer | Static hosting | Static HTML, three.js viewer from `hardware/clip-v1` | Partly built (viewer, guide) |

The native Android app (`add-android-app`) renders the same events as the page, with no logic of its own, and adds what a browser cannot do: capture with the screen off, vibration and the share sheet. BLE provisioning of the clip and an iOS app are post-hackathon steps.

## 2. How it fits together

```mermaid
flowchart LR
  subgraph Wearer
    clip[Clip<br/>XIAO ESP32-S3]
    phone[Companion app<br/>phone browser]
    desk[Desktop mode<br/>Chrome tab capture]
  end
  subgraph Hub[Lente hub · Node 22]
    link[Clip link<br/>TCP · WebSocket]
    asr[Live transcription]
    addr[Addressing]
    cues[Dilo cues]
    vision[Scene vision]
    mem[Memory · profile · briefing]
    agent[Closing agent<br/>approval + traces]
    mcp[MCP server]
    day[(Day record<br/>text, plus sealed audio and keyframes when kept)]
  end
  subgraph Meta[Meta models]
    vt[Muse Voice Transcribe]
    s13[Muse Spark 1.3]
    so[Muse Spark Open<br/>Baseten / Fireworks]
  end
  clip -- frames --> link
  desk -- same frames --> link
  link --> asr --> addr --> cues
  asr <--> vt
  cues <--> so
  cues -. fallback .-> s13
  vision <--> s13
  mem <--> s13
  agent <--> s13
  asr --> day
  cues --> day
  day --> mem --> agent
  cues -- SSE --> phone
  phone -- approve --> agent
  mcp --- mem
  mcp --- link
```

One question, end to end: the clip sends 80 ms audio frames → the hub paces them into Muse Voice Transcribe → a completed turn arrives with its speaker label → addressing decides it is aimed at the wearer → the fast lane writes one line → the phone shows the Dilo card and the clip buzzes. Every stage is timestamped (see `add-evals`).

## 3. Stack, layer by layer

| Layer | Choice | Why | Rejected |
|---|---|---|---|
| Device | XIAO ESP32-S3 Sense, OV3660, PDM mic | Camera, mic, PSRAM and LiPo charging on a 21 × 17.8 mm board | ESP32-S3-CAM + INMP441 (bigger, more parts) |
| Firmware | Arduino-ESP32 3.3.12, C++ | Mature camera and I2S drivers, fast iteration with arduino-cli | ESP-IDF (slower for a 7-day build), Zephyr |
| Wire protocol | Typed frames (type, length, payload), versioned hello, sequenced audio; TCP on the LAN, WebSocket in the cloud | One readable contract, two transports, testable with fixtures | Opus (codec id reserved; PCM16 at 256 kbps fits Wi-Fi), BLE streaming |
| Hub runtime | Node 22.18+, native TypeScript, zero runtime deps | Judges run it with one install; every line is visible | Bun/Deno, frameworks |
| Phone UI | Server-rendered HTML + vanilla JS, SSE + POST; a native Android app on the same contract (`docs/kb/hub-api.md`) | No build step, works on any phone on the LAN; the app adds background capture | React app; React Native or Flutter for the app (a JS or Dart bridge for the microphone service, the camera and vibration) |
| Speech in | Muse Voice Transcribe, realtime, DIARIZATION, PCM 16 kHz | Speaker labels make "addressed to you" possible | Other STT vendors (not Meta) |
| Fast reply | Muse Spark Open on Baseten → Fireworks → Muse Spark 1.3 minimal | Lowest latency; open-weights bonus | Single provider |
| Vision, memory, agent | Muse Spark 1.3 (image input, structured output, function calling, prompt caching) | One model family, measured 1.1 s per photo | Separate vision model |
| Optional | SAM 3.1 (crop the slide), Muse Wonder (long analysis), Muse Glimmer (private mode) | Distinct jobs that judges can see | |
| Voice out | Phone speech synthesis; ElevenLabs when configured | Meta has no text-to-speech; output only, never the intelligence | |
| Storage | Append-only JSONL and JSON files in `data/` (git-ignored) | Readable, zero deps; long context + prompt caching instead of RAG | Vector DB/embeddings (generic pattern, extra dependency) |
| Agents | Own two-phase loop (plan → approve → act), tool registry, JSONL traces | Small, auditable, approval enforced in code | Agent frameworks |
| Extension | MCP server and client | Open standard; consent enforced in tool handlers | Plugin store |
| Hosting | Laptop on LAN; Modal for always-on (spike first) | Modal token set 2026-10-28; same code with config | |
| Tooling | OpenSpec (specs and changes), `node --test`, `tsc --noEmit`, arduino-cli, GitHub Actions | Spec-driven work judges can follow | |

## 4. Interfaces

- **Clip ↔ hub**: frames `H` hello (JSON), `A` audio (PCM16 mono 16 kHz, 80 ms), `J` JPEG; single-byte commands `P`, `B`, `C`/`c`, `M`/`m`. Versioned and documented in `docs/PROTOCOL.md` with `harden-clip-protocol`.
- **Hub ↔ phone**: `GET /events` (SSE: status, history, partial, turn, speaker, cue, live, summary), `POST /look`, `/live/on|off`, `/mode/camera|mic`, `/listen/on|off`, `/assist-mode/assist|record`, `/summary`, `/tts`.
- **Hub ↔ Meta**: `wss://api.meta.ai/v1/asr/realtime`; `POST /v1/chat/completions` (OpenAI shape, `reasoning_effort`, `image_url` parts: both verified 2026-10-28).
- **Hub ↔ agents**: MCP over Streamable HTTP at `/mcp` with a bearer key.

## 5. Data, privacy and consent

| Data | Where | Kept | Notes |
|---|---|---|---|
| Audio | Streamed to Muse Voice Transcribe; with «Guardar audio» on (owner, or terms that describe media), speech only is kept per segment, sealed, in `data/media/` or the private `media` bucket | 30 days by default (7 or 90), a forgotten day, a deleted meeting | Paused = nothing sent; switch off = nothing kept from then on |
| Photos | Sent to Muse Spark to be described; with «Guardar fotos» on, a frame is kept only when the scene changes (at most one every 30 s), sealed | Same as audio | Mic-only mode powers the camera down |
| Day record | `data/days/*.jsonl` | Until deleted | Text, also in Solo grabar, which keeps the whole day with no real-time cues; its audio and keyframes follow the rows above |
| Recorded time | `data/recorded.json` | Today only, replaced each new day | How long audio was received today, no content; shown in Dispositivos |
| Memory, profile, traces | `data/meetings/`, `data/profile.json`, `data/traces/` | Until deleted | Solo grabar's automatic episodes are kept as meetings (notes, glossary, phrases); delete one or all from the phone. The profile remembers the assist mode |
| Secrets | `.env`, `firmware/**/secrets.h` (git-ignored); platform secrets in the cloud | — | Rotated after the demo |

Consent is a product feature, not a footnote: a clear listening state on the phone (the red strip and the pill; the clip's LED only blinks for a cue), pause everywhere, agents and MCP tools obey the same rules, and nothing leaves the hub without approval. Only standard (non-contributor) Meta endpoints are used; while on the free credits, content may be used for product improvement, so tests use the author's voice and public media and the demo meeting uses informed consent.

Solo grabar makes consent matter more, not less, because it listens all day instead of during one meeting. It keeps text, and the speech audio and keyframes only for the owner with the switches on (`add-media-archive`). On the phone the listening pill reads "GRABANDO" on the same red strip, and a tap on it pauses, which stops the clip sending audio. The first-run introduction and Ajustes say that only text is kept and what Solo grabar does, and every episode it opens can be deleted like a meeting. The clip itself shows no recording light (its LED is dark unless a cue arrives), so in Solo grabar the wearer should tell the people around them, as with any meeting.

## 6. Engineering practices

Adopted from what the strongest open projects in this space do well (studied read-only, no code reused): a versioned protocol module with fixtures (MentraOS, Omi), sequence numbers and audio positions (Omi, MentraOS), an emulator for hardware-free runs (Brilliant Labs, Even Realities), protocol docs with byte tables (Brilliant Labs), and recorded decisions.

- **Specs first.** Every change starts as an OpenSpec proposal with specs, design and tasks; `openspec validate --all --strict` stays green.
- **Pure core, thin edges.** Parsing, pacing, addressing rules, routing policy, glossary merges and metrics are pure modules with unit tests; sockets, files and model calls stay at the edges.
- **Small, named units.** Functions do one thing; constants are named with units (`FRAME_MS`, `SUMMARY_EVERY_MS`); modules are named after the domain (addressing, memory), not the technology.
- **Dependency direction.** web/transport → hub services → pure domain modules; domain modules import nothing from the edges.
- **Explicit failures.** Errors carry what failed and why; degraded states are visible on the phone (no key, clip offline, transcription reconnecting).
- **Measured, not claimed.** Stage timestamps on every cue; numbers in docs come from `pnpm eval` and `scripts/`.
- **One CI workflow.** Typecheck, unit tests, firmware compile, and an emulator-driven end-to-end smoke test with the Meta API stubbed.
- **Keep the root clean.** Plans live in `openspec/`, knowledge in `docs/kb/`, decisions in `docs/kb/decisions.md`; no stray report files.

Target layout as changes land (moved gradually, never in a big-bang refactor):

```
src/protocol/   frames, hello, fixtures (pure)        src/memory/  meetings, profile, briefing
src/transport/  tcp, websocket                         src/agent/   loop, tools, traces
src/asr/        session, pacing, offsets               src/mcp/     server, client
src/cues/       addressing, routing, replies           src/web/     page, SSE, routes
scripts/        bench, eval, fake-clip                 test/fixtures/
docs/           architecture, PROTOCOL, benchmarks, kb  firmware/, hardware/, openspec/
```

## 7. Order of work (status 2026-11-02)

The day-by-day plan for 28 Oct – 2 Nov is in git history; what landed each day is in README "What was built during the hackathon". From here the order is by phase. `docs/handoff.md` has the step-by-step for each.

| Phase | Changes | Exit condition |
|---|---|---|
| 0 · Integrate | Merge `feat/add-accounts` → `feat/web-desktop` → `feat/voice-mode` → `feat/agent-bridge` into `main`; deploy the hub from `main` | `main` = production; typecheck, tests, smoke and every change's `validate --strict` green |
| 1 · Hackathon close (until 2026-11-04 21:00 ET) | The demo's `[human]`/`[phone]` checks, `add-accounts` 9.3 privacy note, video, README, submission, X post; archive complete changes | Submitted, with every number in the video from `scripts/` |
| 2 · Production v1 | Rest of `add-accounts` (spend cap, capacity, backups) → `add-consent` → `add-production-ops` → `add-clip-setup` → `add-store-release` | The sign-up gate can open: terms accepted, paid model billing, alerts, backups restored once, a clip set up from the app, the app on Play |
| 3 · Product | Finish `add-ask-lente`, `add-closing-agent`, `add-meeting-library`, `add-memory-review`; `add-memory-timeline`; `add-fast-reply-lane`; `add-glasses-mcp`; `add-desktop-mode` | Each change archived |

Must (Phase 0–1): integration, sign-in working on web and phone, the privacy note, the submission. Should (Phase 2): every Phase 2 change, since no one but the owner signs up before they are done. Could: `add-memory-timeline` (Tu historia · Revivir), whose slice «Revivir» from a meeting's detail may enter the video if there is time. Post-hackathon: iOS and Sign in with Apple, payments, teams and shared meetings, more than one hub container, the blind index (`add-accounts` group 10), HUD and Meta Ray-Ban Display, the "Later" ideas in `add-memory-timeline`.

## 8. Related work

- [Omi / omiGlass](https://github.com/BasedHardware/omi): open-source AI wearable; omiGlass uses the same XIAO ESP32-S3, over BLE.
- [OpenGlass](https://github.com/BasedHardware/OpenGlass): the original "turn any glasses into AI glasses" clip.
- [MentraOS](https://github.com/Mentra-Community/MentraOS): smart-glasses OS with a cloud transcription service.
- [Brilliant Labs SDK](https://github.com/brilliantlabsAR/brilliant_sdk) and [Frame](https://github.com/brilliantlabsAR/frame-codebase): open AR glasses with an on-device Lua runtime.
- [Even Realities EvenDemoApp](https://github.com/even-realities/EvenDemoApp): published BLE protocol for display glasses.
- [free-cluely](https://github.com/Prat011/free-cluely) and [Recap](https://github.com/RecapAI/Recap): desktop meeting assistants and capture.

Lente differs in three ways: it is built around the moment the wearer is addressed in a second language, it works on any glasses or none (desktop mode), and its agents are verifiable and approval-gated. Nothing from these projects is copied; they are cited as prior art.
