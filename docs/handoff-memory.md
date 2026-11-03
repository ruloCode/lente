# Handoff: the memory engine and the media archive, end to end

For a coding agent working alone, start to finish, on two OpenSpec changes:

- `openspec/changes/add-memory-engine/`: fast recall for chat and voice, consolidation while recording, vectors.
- `openspec/changes/add-media-archive/`: speech audio and keyframes kept next to the text.

It assumes you have read nothing else yet. `AGENTS.md` (also reachable as `CLAUDE.md`) and its hard rules apply to every step.

## How to start the agent

Paste this into a fresh Claude Code session at the repository root (or use it as the `-p` prompt):

> Read `docs/handoff-memory.md` and carry it out end to end. Work one task group at a time, in the order it gives. After each group, run its checks, tick its tasks and commit. Stop only where the handoff says to stop and ask. When you stop, or when everything you can do is done, write the final report it describes.

## The goal

When you are done:

1. A question to the chat, about the whole memory or one project, is answered in **one streamed Muse Spark call**, after **local hybrid retrieval** (BM25 plus vectors plus people, fused by reciprocal rank).
2. Project scope holds in the data.
3. Voice memory questions are answered in the voice model's **first step**.
4. A day of recording becomes searchable segments within seconds, memory cards within minutes, and briefs and people cards in the background.
5. For the owner, Lente keeps **speech audio and keyframes**, sealed and expiring, playable from a source chip.
6. Every latency and quality figure in `docs/benchmarks.md` comes from a `scripts/` run.
7. Every task an agent can do is ticked. Every `[human]`, `[hw]` or `[phone]` task that could not run is listed in the final report.

The targets are in each change's `design.md`, under "Goals" and "Latency budget". Targets are not results: write down what you measure, even when it misses.

## Read first, in this order

1. `AGENTS.md`: hard rules, conventions, commands, map.
2. `docs/kb/hackathon.md`: what can disqualify the project.
3. `docs/kb/decisions.md`, especially the two entries dated **2026-11-03**: "Vectors in the memory index" and "Lente keeps the day as audio, keyframes and text". They are the owner's decisions; do not reopen them.
4. `docs/kb/meta-api.md`: the real API. Don't invent endpoints or fields. Two facts matter most here:
   - The shared prompt prefix caches only as the **first developer message**, not in `instructions`.
   - Streamed Chat Completions carry no `usage`; the Responses API does.
5. `openspec/changes/add-memory-engine/`: `proposal.md`, `design.md`, `specs/*/spec.md` and `tasks.md`, in full.
6. `openspec/changes/add-media-archive/`: the same four.
7. `openspec/changes/add-accounts/design.md`, decisions 5 to 9: sealing, plain columns, the tiers, one runtime per user.

## Ground rules

- **Never read, print, grep or copy `.env`**, `~/.config/lente/`, `data/` or `firmware/**/secrets.h`. The repo's guard hook blocks it.
  - Load keys only through `node --env-file=.env …` or the `pnpm` scripts, which already pass `--env-file-if-exists=.env`.
  - To learn whether a key is set, run the script that needs it and read its error.
- **Synthetic data only.** Invented people and projects with `PROBE-` names. Spanish test speech comes from `say -v Paulina`, English from `say -v Samantha`. Nothing from a real meeting goes in tests, logs, docs or commits.
- **Write it fresh.** mem0, Letta, Zep/Graphiti, LangMem, Memobase, supermemory, HippoRAG, LongMemEval and Omi are cited for ideas (each `design.md` lists which). Never open their source to copy code, prompts or schemas.
- **Standard mode only.** Never call a `*-contributor` model.
- **No new runtime dependency** except the ones these changes allow after a measurement:
  - the hub encoder (`add-memory-engine` 8.4);
  - the Opus encoder (`add-media-archive` 1.2).
  - Each one goes in `docs/kb/decisions.md` with its rejected zero-dependency alternative.
- **Spend.** Benches and evals may spend up to **US$ 10 in model calls** in total without asking. Each bench prints its cost; keep a running total for the final report.
- **Never deploy.** Never run `pnpm deploy:hub`, never push to `main`, never merge into `main`. Production runs `feat/web-desktop` (Phase 0 in `AGENTS.md`).
- **Don't run `pnpm auto`.** It builds from `main`.

## Setup

1. **Don't touch the owner's working tree.**
   - The main checkout (`phase1/overnight`) holds the owner's uncommitted work from other sessions. Never stash, reset, checkout or add those files.
   - First commit only the planning artifacts of this handoff, from the main checkout, naming each path:
     ```bash
     git add openspec/changes/add-memory-engine openspec/changes/add-media-archive \
       docs/handoff-memory.md docs/kb/decisions.md AGENTS.md openspec/changes/add-accounts/design.md
     git commit -m "add-memory-engine, add-media-archive: propose fast recall, vectors and the media archive"
     ```
   - **Stop and ask the owner** if any of those paths has changes you did not expect (`git diff --cached --stat`). Today's edits to `decisions.md` are the two 2026-11-03 entries only. Today's edits to `add-accounts/design.md` are two "(Superseded …)" notes only.
2. **Work in your own worktree:**
   ```bash
   git worktree add ../lente-memory -b feat/memory-engine phase1/overnight
   cd ../lente-memory && pnpm install && pnpm typecheck && pnpm test
   ```
   - If the baseline is red, **stop and ask**. Don't fix unrelated failures.
   - Run every command below from `../lente-memory`.
   - `.env` lives only in the main checkout. Pass it as `node --env-file=../lente/.env …`, or symlink it with `ln -s ../lente/.env .env`; it is git-ignored.
3. **Check that nothing else is listening** on the hub's ports before starting one (`lsof -iTCP:7070 -iTCP:8080 -sTCP:LISTEN`).

## The loop for each task group

1. Re-read the group's tasks and the `design.md` decisions they cite.
2. If the code must differ from the change, **update the change first** (`design.md` or `specs/`) and say why in the commit.
3. Implement. Follow these conventions:
   - Pure logic goes in its own module with a test in `test/`.
   - Sockets, files and model calls stay at the edges.
   - Constants are named, with units (`RECALL_MIN_SCORE`, `SEGMENT_MAX_MS`).
   - Errors say what failed and why.
   - Match the comment density of the code around you.
   - On a hub with accounts, log lines never quote content: lengths only (`‹42 chars›`).
4. Run each task's verification as written, then tick it (`- [x]`).
5. Run `pnpm typecheck && pnpm test && pnpm exec openspec validate <change> --strict`. Run `pnpm smoke` when the group touched `src/pilot.ts`.
6. Commit once per group. Use the repo's style: `add-memory-engine 3.4: stream fast answers over SSE` (the change, the last task number, then what it does). End the message with the attribution line from your session instructions.
7. Add a row for today to "What was built during the hackathon" in `README.md` (hard rule 2), or extend today's row.

## What is already known (don't re-derive it)

### Where the code lives today

- `src/ask.ts` is the laptop path: `buildMemory` puts 60k characters of the last 7 days into one structured call, and `parseAsk` validates the citations.
- `src/ask-tiers.ts` is the production path: `askTiers` runs context, a plan call, `lookUp` (term counting), then the answer call.
- `src/pilot.ts`:
  - `answerAsk` chooses the path and applies the project scope through `scopeMeetings`.
  - `askWhole` loads the digests **unscoped** (the bug in task 1.3).
  - `callSpark` and `structured` are the model calls.
  - `rewriteProfile` and `runDigests` write the digests.
- `src/chat.ts`:
  - `completeChat` (Chat Completions, not streamed, with `usage`) does not return `finish_reason` (task 1.2).
  - `streamResponse` and `toResponsesInput` already speak the streamed Responses API.
- `src/voice-agent.ts` declares the `ask_memory` tool. `src/voice-tools.ts` handles it through `VoiceBackend.ask`, which `pilot.ts` wires to `answerAsk`.
- `src/meetings.ts` holds `NOTES_PROMPT` and `notesSchema`, which the card fields extend (task 6.2), and `episodeEnd` (Solo grabar episodes: 5 min of silence or 60 min).
- `src/digests.ts` and `src/nightly.ts` hold the digest scopes and the catch-up. `brief` and `person` are new scopes (task 6.5).
- `src/supabase-stores.ts`, `src/cached-stores.ts` and `src/stores.ts` are the sealed and file stores. `src/seal.ts` seals values with AAD.
- Test doubles: `test/fake-postgrest.ts`, `scripts/stub-meta.ts` (streams Responses), and the voice stub in `test/voice-stub.test.ts`.
- The Meta model list (`GET /v1/models`, 2026-11-03) has no embedding model.

### Baseline (scratch probe, 2026-11-03, n=10 per path, synthetic)

| Path | p50 | p90 |
|---|---|---|
| Production, two calls | 6.8 s | 13.6 s |
| Laptop, one call | 3.5 s | 5.3 s |

The probe also found:
- **Truncation:** «¿Qué prometí entregar esta semana?» answered "not found" in 2 of 2 runs, at 500 output tokens.
- **The concrete fact never surfaced:** the 18,000-dollar budget did not appear in 4 tries.
- **Project scope:** an out-of-project question was declined in 2 of 2 runs, but with the other project's digests in the prompt.

Task 1.1 rebuilds this probe as `pnpm bench:ask`: same scenarios, bigger memory, and an out-of-project probe. It should reproduce these numbers within noise before you change anything.

## Order of work

### `add-memory-engine`, groups 1 to 9, in order

- **Group 1: fixes and the bench.** It changes no stored data and makes today's chat correct. Commit it on its own; the owner may cherry-pick it early.
- **Group 2: the index core.** Do task 2.4's microbench before group 3. If 90 days of lexical search exceeds 30 ms p95, revise decision 3 of `design.md` (smaller hot window, or shards per week) before you go on.
- **Group 3: fast text recall.**
  - Keep the JSON reply for clients that don't send `Accept: text/event-stream`. Old Android builds exist.
  - The fast path stays behind `LENTE_RECALL=fast` until task 9.2.
  - `src/time-phrases.ts` is shared with `add-memory-timeline` 3.1. Build it to serve both, and tick 3.1 there too if its tests cover that task.
- **Group 4: clients.**
  - Android: `pnpm android:test` and `pnpm android:e2e`.
  - Web: the `/app` chat panel.
  - Task 4.3 is `[phone]`. Use the `lente-hardware` skill if the bench is connected (`adb devices` shows the phone); otherwise leave it for the report.
- **Group 5: voice.**
  - Check what the realtime ASR sends in `ENDPOINTING` mode (`docs/kb/meta-api.md`, `src/asr-session.ts`). If no partials arrive, speculative recall runs on `speechComplete` only. Update decision 9 of `design.md` to say so.
- **Group 6: consolidation.** The card fields go into the **same** notes call. Never add a second call per meeting.
- **Group 7: persistence.**
  - Write the migration file in `supabase/migrations/` like the existing ones.
  - **Applying it to the live project (task 7.4) needs the owner's yes.** Stop and ask. It is the production database.
- **Group 8: vectors.**
  - Vectors are decided. The bake-off picks the encoder by the selection rule in decision 7.
  - Candidate C, a Meta open-weights encoder on Modal, needs a Modal function. Write it next to `deploy/modal/hub.py`, but **don't deploy it without the owner**. Measure C from a local run of the same code, or stop and ask for a deploy.
  - If C cannot be measured, decide between A and B and record that C is pending.
- **Group 9: the eval and the default flip.**
  - Flip `LENTE_RECALL` to `fast` only if task 9.1 shows its accuracy is at or above the tiers'.
  - Task 9.4 is `[human]`.

### `add-media-archive`, after `add-memory-engine` group 6

`add-consent` has 0 of 13 tasks done (2026-11-03). Media can therefore be on **for the owner only**:
- Build groups 1 to 3 and task 4.1 with the gate exactly as task 2.2 says.
- Leave the path for other accounts closed: no account but the owner has accepted terms that describe media.

Other notes:
- **Task 1.2 (codec)** needs the owner's listening check. Measure, write the numbers, then stop and ask before choosing Opus. ADPCM needs no dependency and is the default if nobody answers.
- **Task 2.4 (live bucket and migration)** follows the same rule as 7.4: stop and ask.
- **Task 4.4 retires the text-only promise** in the same commit that turns media on for the owner, never before. Until then, every «solo texto» line stays, because it is still true.

## Tagged tasks

| Tag | What to do |
|---|---|
| `[key:MODEL_API_KEY]` | Run it. The key is in `.env`; the script errors clearly if it is not. |
| `[key:SUPABASE_SECRET_KEY]` | Prepare everything, then **stop and ask** before touching the live project. |
| `[hw]`, `[phone]` | Run with the `lente-hardware` skill only if the clip or phone is connected. Otherwise leave it unticked and list it. Name the clip's port exactly; the guard refuses globs. |
| `[human]` | Never tick it yourself. List what the owner needs to do and how long it takes. |

## Stop and ask when

- The planning commit in Setup step 1 would include anything you did not expect.
- The baseline `pnpm typecheck && pnpm test` is red before you change anything.
- A task would touch the live Supabase project, deploy anything, or push to `main`.
- A measurement makes a target in `design.md` impossible, and the change does not already say what to do in that case.
- Model spend would pass US$ 10.
- The same check fails after two honest attempts at a fix.
- A spec seems to contradict a decision dated 2026-11-03. The decision wins; ask before changing the spec's meaning.

Asking means ending the session with the final report, with the question as its first line.

## Final report

Write it as your last message, and as a comment at the top of the last commit message if you stop mid-change. Include:

1. **Question for the owner**, if you stopped to ask one.
2. **Done:** each group, with the commit hash and one line.
3. **Measured:** the rows added to `docs/benchmarks.md`, each against its target (met or missed).
4. **Waiting on the owner:** every unticked `[human]`, `[hw]`, `[phone]` and live-project task, with the exact command or steps.
5. **Spend:** model calls, in dollars, by bench.
6. **Changed in the plan:** every place `design.md` or `specs/` changed during the build, and why.
7. **Next:** whether `openspec archive` can run. It runs only when every task in the change is ticked, so as a rule not until the owner's tasks are done.
