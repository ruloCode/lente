# Working on Lente

Instructions for any coding agent (Muse Code, Claude Code, Codex…) and for humans.

## Read first

- `docs/kb/hackathon.md`: rules that can disqualify the project.
- `docs/kb/meta-api.md`: the real API surface. Don't invent endpoints or fields; if something isn't there, check the docs at dev.meta.ai and add it.
- `docs/kb/decisions.md`: why things are the way they are.

## Hard rules

1. **Only new work.** Never copy code, prompts or assets from other repositories, including the author's own (hermes-os). Write it fresh.
2. **Log what you build.** Every day with work adds a row to "What was built during the hackathon" in `README.md`. Judges disqualify what they can't attribute.
3. **No secrets, no meeting data.** Keys live in `.env` (git-ignored). Never commit audio, transcripts or screenshots of real meetings.
4. **Standard mode only.** Never call `*-contributor` models.
5. **Every number is measured.** Latencies in docs and the video come from `scripts/` runs, not estimates.

## Conventions

- Node 22.18+, TypeScript run natively (`.ts` imports with extension, erasable syntax only), zero runtime dependencies unless one clearly earns its place.
- Code and docs in English (the judges read them).
- `pnpm typecheck && pnpm test` before every commit. Pure logic gets a test in `test/`.
