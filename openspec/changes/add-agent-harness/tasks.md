# Tasks

## 1. Graph

- [x] 1.1 Task tags and `Depends on:` parsed as pure code; ready nodes and held tasks per bench; unit tests (`node --test test/progress.test.ts`)
- [x] 1.2 Tag every open task across the changes and add the dependencies; verify `pnpm auto --dry-run` lists ready nodes and held tasks with reasons, and `openspec validate --changes --strict` passes

## 2. Brakes

- [x] 2.1 Hard rules as a pure policy with tests (`node --test test/policy.test.ts`): secrets, contributor mode, force push, forbidden adds, root deletes, the lane's git, the clip's exact port
- [x] 2.2 PreToolUse guard and Stop gate wired in `.claude/settings.json`; verify with hook payloads that `cat .env`, a `usbmodem*` upload and a lane commit exit 2 and `pnpm test` passes

## 3. Auto lane

- [x] 3.1 Runner: worktree, bench detection (clip via arduino-cli, phone via adb, key names only), builder via `claude -p` with a structured result, CI gates, Muse Code review, fix rounds, evidence commit, fast-forward of main, budget and state file; verify `pnpm auto --dry-run` and typecheck
- [x] 3.2 `lente-hardware` skill for the bench
- [x] 3.3 Progress page shows the lane, ready nodes, held tasks and history, reading tasks from the lane while it runs; verify with a screenshot
- [ ] 3.4 First unattended run merges one node end to end; check the commit's evidence and the page [human]
