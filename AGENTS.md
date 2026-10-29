# Working on Lente

Instructions for any coding agent (Muse Code, Claude Code, Codex…) and for humans.

Lente: a clip on any glasses (XIAO ESP32-S3 Sense) streams to a Node hub that uses Meta's models to notice when the wearer is asked something and shows one line to say (the "Dilo" card) on their phone. Plan: `docs/architecture.md`.

## Read first

- `docs/kb/hackathon.md`: rules that can disqualify the project.
- `docs/kb/meta-api.md`: the real API surface. Don't invent endpoints or fields; if something isn't there, check the docs at dev.meta.ai and add it.
- `docs/kb/decisions.md`: why things are the way they are.
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

Build order (status 2026-10-28): done `harden-clip-protocol`, `add-meeting-memory` (archived) · finishing `apply-dilo-identity` (2.1 install check), `add-addressed-to-you` (3.3 motor, hardware 2026-10-30), `add-app-navigation` (1.2), `add-evals` (3.1, CI) · next `add-record-only-mode` → `add-closing-agent` → `add-phone-capture` (builds the WebSocket ingest) → `add-fast-reply-lane` (needs `BASETEN_API_KEY`) → `add-glasses-mcp` → `add-desktop-mode` (reuses that ingest) / `add-cloud-hub`.

## Map

- `src/pilot.ts` hub (TCP clip link, SSE + HTTP routes, model calls) · `src/pilot-page.ts` phone page · `src/clip-protocol.ts` frames, pacing, audio cleanup (pure) · `src/asr-session.ts` realtime transcription · `src/day-log.ts` text-only day record · `src/chat.ts`, `src/providers.ts` model clients
- `firmware/lente-clip/` clip firmware · `firmware/selftest/` hardware self-test
- `hardware/clip-v1/` parametric case (`clip.py` → STL, GLB) and 3D viewer
- `scripts/` benchmarks · `test/` unit tests (`node --test`)

## Commands

- `pnpm pilot` hub (prints the phone URL) · `pnpm test` · `pnpm typecheck` · `pnpm ping` · `pnpm bench:llm` · `pnpm bench:asr <wav>` · `pnpm smoke` (end to end, stubbed Meta API, no keys)
- Clip: `arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p /dev/cu.usbmodem* firmware/lente-clip`

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
