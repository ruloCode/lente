# Working on Lente

Instructions for any coding agent (Muse Code, Claude Code, Codex…) and for humans.

Lente: a clip on any glasses (XIAO ESP32-S3 Sense) streams to a Node hub that uses Meta's models to notice when the wearer is asked something and shows one line to say (the "Dilo" card) on their phone. Plan: `docs/architecture.md`.

## Read first

- `docs/kb/hackathon.md`: rules that can disqualify the project.
- `docs/kb/meta-api.md`: the real API surface. Don't invent endpoints or fields; if something isn't there, check the docs at dev.meta.ai and add it.
- `docs/kb/decisions.md`: why things are the way they are.
- `docs/kb/claude-managed-agents.md`: before touching the cloud auto lane. The Claude Platform key lives in `~/.config/lente/anthropic-cloud.key`, never in `.env` or any environment.
- `openspec/specs/`: what Lente does today. `openspec/changes/<name>/`: the next pieces of work.

## Hard rules

1. **Only new work.** Never copy code, prompts or assets from other repositories, including the author's own (hermes-os). Write it fresh. Prior art in README "Related work" is cited, never copied.
2. **Log what you build.** Every day with work adds a row to "What was built during the hackathon" in `README.md`. Judges disqualify what they can't attribute.
3. **No secrets, no meeting data.** Keys live in `.env`, Wi-Fi in `firmware/**/secrets.h`, the day record in `data/` (all git-ignored). Never print, copy or commit them. Never commit audio, transcripts or photos of real meetings or people.
4. **Standard mode only.** Never call `*-contributor` models. Run Muse Code with `--contributor-mode off`.
5. **Every number is measured.** Latencies in docs and the video come from `scripts/` runs, not estimates.

## How to work: one OpenSpec change at a time

Run OpenSpec as `pnpm exec openspec …` (pinned dev dependency). The OpenSpec skills in `.claude/skills/` describe the full workflow.

1. Pick the next change in the build order below and read its `proposal.md`, `design.md`, `specs/` and `tasks.md`.
2. Implement **one task group** per session. Follow the specs; if the code must differ, update the change first.
3. After each task: run its verification, then tick it in `tasks.md` (`- [x]`).
4. After each group: `pnpm typecheck && pnpm test` and `pnpm exec openspec validate <change> --strict`, then commit.
5. When every task is done: `pnpm exec openspec archive <change> --yes` (merges its specs into `openspec/specs/`).

Build order (status 2026-11-04; the step-by-step handoff is `docs/handoff.md`):

- **Phase 0, integrate: done (2026-11-04).** `feat/add-accounts`, `feat/web-desktop`, `feat/voice-mode`, `feat/agent-bridge`, `feat/memory-engine` and `auto/lente` are all in `main`, and production on Modal runs `main` (`pnpm deploy:hub` from a clean `main` checkout, always `--strategy recreate`).
- **Phase 1, hackathon close (until 2026-11-04 21:00 ET).** Only the `[human]`/`[phone]` checks the demo needs (sign-in on web and phone, voice mode, a pocket meeting), the privacy note (`add-accounts` 9.3), the video, the README and the submission. Then archive every change whose tasks are all ticked.
- **Phase 2, production v1 (before anyone but the owner signs up).** `add-accounts` remainder (6.3 spend cap, 6.4 capacity, 4.6 backups, 4.7 import, 5.4–5.5, 9.3–9.4) → `add-consent` (terms, the room, retention, the sign-up gate) → `add-production-ops` (deploy from main, alerts, restore drill) → `add-clip-setup` (BLE setup, signed updates) → `add-store-release` (Play).
- **Phase 3, product.** `add-memory-engine` first (fast recall for chat and voice, consolidation while recording, vectors; its group 1 fixes today's chat; end-to-end brief in `docs/handoff-memory.md`). Then finish `add-ask-lente`, `add-closing-agent` (function calling), `add-meeting-library`, `add-memory-review`, then `add-memory-timeline` (Tu historia · Revivir) → `add-fast-reply-lane` → `add-glasses-mcp` → `add-desktop-mode` (tab capture) · `add-cloud-auto-lane` alongside. `add-media-archive` (opt-in audio and keyframes) only after `add-consent`.
- **Done and archived:** `harden-clip-protocol`, `add-meeting-memory`, `add-evals`, `add-app-navigation`, `add-record-only-mode`, `add-spanish-first`. **Waiting on one check:** `add-live-transcript` (complete, archive), `add-idle-pause`, `apply-dilo-identity`, `apply-ios-look`, `add-addressed-to-you`, `add-android-app`, `add-phone-capture`, `add-cloud-hub`, `add-agent-harness`.

## Auto lane

`pnpm auto` builds ready task groups unattended: a headless Claude Code session per group in the worktree `.claude/worktrees/auto` (branch `auto/lente`), then CI's checks, a review by a fresh read-only Claude Code session, and a commit fast-forwarded onto `main`. Meta's models run inside Lente, not in the lane that builds it. Hooks in `.claude/settings.json` enforce the hard rules in every session. To keep the graph honest:

- Keys: every `[key:NAME]` in the open changes has its key in `.env` (2026-10-28: `MODEL_API_KEY`, `BASETEN_API_KEY`, `MODAL_TOKEN_ID`), so key-tagged tasks wait only on their dependencies.
- Tag open tasks with what they need: `[hw]` clip board, `[phone]` Android phone over adb, `[human]` a person, `[key:NAME]` a key in `.env`. Untagged tasks are fair game for the lane.
- A change that needs another first says so under its title: ``Depends on: `add-phone-capture` ``.
- The bench (clip, phone, test speech) is described in the `lente-hardware` skill.
- Cloud builds (`add-cloud-auto-lane`, in progress): `pnpm auto --cloud` sends code-only nodes to Claude Managed Agents, read-only, and merges their patch through the same gates.

## Map

- `src/pilot.ts` hub (TCP clip link, SSE + HTTP routes, model calls) · `src/pilot-page.ts` phone page · `src/clip-protocol.ts` frames, pacing, audio cleanup (pure) · `src/asr-session.ts` realtime transcription · `src/day-log.ts` text-only day record · `src/chat.ts`, `src/providers.ts` model clients
- `firmware/lente-clip/` clip firmware · `firmware/selftest/` hardware self-test
- `hardware/clip-v1/` parametric case (`clip.py` → STL, GLB) and 3D viewer
- `scripts/` benchmarks · `scripts/auto/` auto lane (runner, guard, stop gate) · `scripts/progress/` progress page · `test/` unit tests (`node --test`)

## Commands

- `pnpm pilot` hub (prints the phone URL) · `pnpm test` · `pnpm typecheck` · `pnpm ping` · `pnpm bench:llm` · `pnpm bench:asr <wav>` · `pnpm smoke` (end to end, stubbed Meta API, no keys) · `pnpm progress` (live progress, port 7171) · `pnpm auto` (auto lane; `--dry-run` first)
- Clip: `arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p "$LENTE_BOARD_PORT" firmware/lente-clip`. Name the port exactly (`arduino-cli board list`, the "ESP32 Family Device" row): the Android phone is a `/dev/cu.usbmodem…` too, and the guard refuses a glob.

## Conventions

- Node 22.18+, TypeScript run natively (`.ts` imports with extension, erasable syntax only), zero runtime dependencies unless one clearly earns its place (record why in `docs/kb/decisions.md`).
- Code and docs in English (the judges read them). Phone copy may be Spanish for the wearer.
- Pure logic in its own module with a test in `test/`; sockets, files and model calls stay at the edges. Named constants with units (`FRAME_MS`). Errors say what failed and why.
- Match the surrounding code's comment density and naming. No stray report or plan files in the root.
- `pnpm typecheck && pnpm test` before every commit.

## Working efficiently

- Stay inside the current change and task group; don't refactor unrelated code.
- Read only the files the task names; don't dump whole logs or files into the conversation.
- The hub may already be running in the background on ports 7070/8080; check before starting another.
