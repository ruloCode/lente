# Handoff: closing the hackathon (2026-11-04)

For the orchestrator and the lane agents who finish Lente for the submission while the owner records the video. Read `AGENTS.md` first: its hard rules apply to everyone. The plan is three OpenSpec changes:

| Change | What it is | Lanes |
|---|---|---|
| `openspec/changes/ship-hackathon/` | Judge access (open Google sign-up with caps, terms, sample memory), the website, the APK release, the docs, the checkpoints | L1, L2, L5, L6, orchestrator |
| `openspec/changes/add-practice-mode/` | The piano demo | L3, L4 |
| `openspec/changes/add-sight-mode/` | Ver: what is left (phone checks, numbers) | L1, L6 |

**Deadline: 21:00 Bogotá (= 21:00 ET).** Code freeze 18:00. Submission 19:30.

---

## The orchestrator

You are the only one who merges into `main`, applies migrations and deploys. You start the lane agents, watch the checkpoints, and keep the owner's interruptions to a minimum: they are recording the video.

### Prompt to start the orchestrator (paste into a fresh Claude Code session in `/Users/rulocode/dev/side/lente`)

> You are the orchestrator for Lente's last day of the Meta hackathon (deadline 21:00 Bogotá today). Read `AGENTS.md`, then `docs/handoff-closing.md` (this plan), then `openspec/changes/ship-hackathon/` (proposal, design, tasks) and `openspec/changes/add-practice-mode/`. Do this:
>
> 1. **Worktrees.** In this order: commit the plan files on `main` (second sub-bullet), then create one worktree per lane from `main` (`git worktree add ../lente-L<n> -b close/L<n> main` for L1–L6), then move the Android work to L1 (first sub-bullet).
>    - First move the uncommitted Android work, tracked and untracked files, from the main checkout to `close/L1` (it belongs to L1): `git stash push -u -m L1-android -- android` in the main checkout, then `git -C ../lente-L1 stash pop`. Check `git status` in both, and commit it on `close/L1` as «add-sight-mode: Ver's conversation on Android (work in progress from the stopped agent)».
>    - Also commit the plan files themselves on `main` first: `openspec/changes/add-practice-mode/`, `openspec/changes/ship-hackathon/`, `docs/handoff-closing.md`, after `pnpm exec openspec validate add-practice-mode --strict` and `… ship-hackathon --strict` pass. Fix any validation error in those files before anything else.
>    - Leave the main checkout on a clean `main`.
> 2. **Start the six lane agents** with the Agent tool, in the background, each with its prompt from § Lanes below and its worktree path. Use `isolation` off: they work in their own worktree folder.
> 3. **Your own tasks** in `ship-hackathon` § 7, at the checkpoint times. Merging a lane:
>    - `git -C ../lente-L<n> rebase main` (resolve README/decisions conflicts by keeping every row and entry in date order);
>    - `git merge --ff-only close/L<n>` in the main checkout;
>    - then the full checks in § Gates.
>    - A lane that is red at a checkpoint waits for the next one; never merge red.
> 4. **Migrations:** only additive ones, only through the Supabase MCP (`apply_migration`, project `erufopbceodmnqbilovo`), only after `list_migrations` matches `supabase/migrations/` except the new files.
> 5. **Deploys:** only `pnpm deploy:hub` from a clean `main` after the gates; then check `/health`, that the clip reconnects (`modal app logs lente-hub -f </dev/null | grep '\[clip\]'` for 30 s), and one signed-in request.
> 6. **Owner messages:** ask the owner only for what § Owner lists, in one short message per checkpoint. Everything else, decide by `design.md` and say what you decided in the checkpoint report.
> 7. **After each checkpoint,** post a 5-line report:
>    - what merged and its commit;
>    - what was deployed;
>    - the spend today;
>    - what is late;
>    - what you need from the owner.
>
> Never print or read `.env`, `~/.config/lente/`, `data/`, `firmware/**/secrets.h`. Never push anything but `main`. Never commit media, real transcripts, or screenshots of the owner's account.

### Gates (every merge)

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm smoke
pnpm android:test                      # when android/ changed
for c in $(ls openspec/changes | grep -v archive); do pnpm exec openspec validate "$c" --strict || echo "FAIL $c"; done
git status --short                     # clean apart from the untracked design assets
```

### Checkpoints

| Time | Merge | Deploy | Checks |
|---|---|---|---|
| 12:15 | L6, L1 (Ver), L3 (piano hub P0), L2 (sign-up, caps, terms on the hub) | migrations `usage_daily`, `terms`; hub | `/health`; owner still works; clip reconnects; a stub hub test shows a capped non-owner |
| 14:30 | L1 (sign-in + terms on Android), L2 (sample), L4 (piano Android P0), L5 (site skeleton + Pages) | hub; APK on the Samsung | owner's second Google account signs in on web and Android, accepts terms, asks the sample; Pages live |
| 16:30 | P1/P2 if `add-practice-mode` 5.2 is green; L5 screenshots and content | hub | site complete; spend read from `usage_daily` |
| 18:00 | freeze: last merges | hub; release `v0.2.0-hackathon` with `lente.apk` | download from the site on the Samsung, install, sign in, ask |
| 18:30 | video link into README, site, submission | — | push; CI green; Pages updated |

### Owner (the only things to ask them)

- **Before 12:15:** `ship-hackathon` 0.1–0.5 (publish the OAuth consent screen; the Android SHA-1; the Meta credit; the go for deploys and additive migrations).
- **At 14:30:** sign in once with a second Google account on the web and on the Samsung (2 minutes).
- **About 15:30:** 10 minutes at the piano for `add-practice-mode` 5.2 (can be filmed for the video).
- **18:30:** the video link.
- **19:30:** the submission.
- **20:00:** the posts.

---

## Lanes

Each lane agent works only in its worktree, commits on its branch with messages that start with the change and task (`ship-hackathon 2.2: …`), ticks its tasks with a dated sub-bullet of what was checked, and never deploys, merges or pushes. When it finishes or is blocked, it reports:
1. the question, if any;
2. its commits;
3. checks run and their results;
4. what it could not do.

### File ownership

| Lane | Owns | May read | Must ask the orchestrator before touching |
|---|---|---|---|
| L1 Android Ver + sign-in | `android/app/src/main/java/app/lente/{ui/Sight.kt,ui/Voice.kt,ui/Shell.kt,platform/*,core/Sight.kt,core/SpeechVoice.kt,core/SpeechQueue.kt,core/Place.kt,core/VoiceState.kt}`, the sign-in and terms screens, `AndroidManifest.xml` | all | `ui/Home.kt`, `ui/Sections.kt` (shared with L4: L1 edits them before 14:00, L4 after) |
| L2 Hub access | `src/access-gate.ts`, `src/spend-cap.ts`, `src/terms.ts`, `src/sample-memory.ts`, `src/supabase-stores.ts`, `supabase/migrations/2026110400*`, `deploy/modal/hub.py`, `docs/kb/modal.md`; the access, caps and terms parts of `src/pilot.ts` | all | the voice and practice parts of `src/pilot.ts` (L3) |
| L3 Hub piano | `src/practice.ts`, `src/day-log.ts` (`practice` kind), the practice routes and the piano persona in `src/pilot.ts`, `src/voice-agent.ts`, `src/voice-tools.ts`, `src/voice-hub.ts`, `src/voice-session.ts`, `scripts/stub-meta.ts`, `scripts/bench-practice.ts` | all | the access parts of `src/pilot.ts` (L2) |
| L4 Android piano | `android/…/core/{Pitch,NoteTracker,Lesson}.kt`, `platform/PitchListener.kt`, `ui/Practice.kt`, their tests | all | `ui/Home.kt`, `ui/Sections.kt` after 14:00; `LenteViewModel.kt` (add only, in its own section) |
| L5 Site + web terms | `site/`, `.github/workflows/pages.yml`, `scripts/qr.ts`, `docs/release-notes-0.2.0.md`, the terms screen and «Borrar ejemplo» in `web/app/` | all | — |
| L6 Docs + numbers | `README.md`, `docs/benchmarks.md`, `docs/submission.md`, `docs/kb/decisions.md`, `scripts/bench-sight-prompts.ts`, `src/sight.ts` (the comment's numbers only), openspec archives | all | any code file |

`src/pilot.ts` is shared by L2 and L3. Keep edits in separate functions and blocks, and rebase often (`git rebase main` after each checkpoint).

### L1: Android, Ver finished, then sign-in and terms

> Worktree `../lente-L1`, branch `close/L1`. Read `AGENTS.md`, `openspec/changes/add-sight-mode/` and `openspec/changes/ship-hackathon/` (tasks 1.x and 3.1).
>
> **Part 1 (until 12:00).** The branch starts with a stopped agent's uncommitted work for Ver's conversation. Review it against this contract, finish it, and test it.
>
> - **Voice WebSocket `/voice`.** After it opens, send `{"type":"start","persona":"sight","intro":true|false}`. With `intro:true` Lente speaks first (the welcome).
> - **Events from the hub:**
>   - all of today's, plus `{"type":"narration","on":bool}` (on/off only stops speaking live lines);
>   - `{"type":"quiet","on":true}`: after speaking the current reply, close the voice session, POST `/listen/on`, mute narration, and show «Grabando en silencio · mantén presionado para hablarme»; a long press reopens the session with `intro:false`;
>   - `{"type":"locate","id"}`: reply on the same socket within 8 s with `{"type":"location","id","ok":true,"lat","lon","accuracy","address","place"}` or `{"type":"location","id","ok":false,"reason"}`. Use `LocationManager.getCurrentLocation` and `Geocoder` with `Locale("es","CO")`. Never store or log the coordinates or the address.
> - **Voice.** POST `/tts` `{"text","voice":"sight"}` returns `audio/mpeg` (a neutral Colombian woman's voice), or 404. In Ver, every spoken line goes through it sentence by sentence, in order; barge-in stops it. Fall back to the phone's TTS (female es-CO/es-US if found) on failure or after 2.5 s. With TalkBack on, announce instead of playing. Always call the echo guard `narrated(text)`.
> - **First time** (`sightMet` false): POST `/assist-mode/sight`, then `/live/off`, open voice with `intro:true`; set `sightMet` after the first reply. **Later:** `intro:false`.
> - **Ajustes:** «Volver a conocernos» resets `sightMet`.
> - **The Ver screen:** shows the latest line large and a state line (Escuchando / Pensando / Hablando / Narrando / Narración en pausa / Grabando en silencio).
> - **Gestures:**
>   - tap = look (POST `/look`);
>   - long press = pause/resume listening;
>   - two-finger tap = narration on/off;
>   - all of them, plus «Grabar en silencio», «Volver a conversar», «Repetir» and «Salir», as TalkBack custom actions.
> - **Narration** never talks over a voice reply.
>
> `pnpm android:test`, `pnpm android:apk`. Install on the Samsung (`adb -s RFGYB098QCN install -r …`). Do `ship-hackathon` 1.2 against the Modal hub; the clip is connected to it. Commit.
>
> **Part 2 (12:00–14:00).** `ship-hackathon` 3.1:
> - a fresh install opens on «Iniciar sesión con Google» against the Modal hub, never the pairing screen;
> - after sign-in, a 428 `{needsTerms:true}` from any data route shows the terms screen (a summary in Spanish, links to `/terminos` and `/privacidad`, «Acepto» → POST `/terms/accept`);
> - «Borrar ejemplo» in Ajustes (POST `/sample/delete`).
>
> Test the 428 handling in a pure reducer with JVM tests. Commit. Release `ui/Home.kt` and `ui/Sections.kt` to L4 at 14:00.

### L2: Hub, judge access

> Worktree `../lente-L2`, branch `close/L2`. Read `AGENTS.md`, `openspec/changes/ship-hackathon/` (design decisions 1–5, tasks 2.x) and `docs/kb/supabase.md`. Do tasks 2.1 → 2.6 in order. Commit after each, with tests first.
> - Migrations go in `supabase/migrations/` and are tested on the fake PostgREST and, if you can, a scratch Postgres. **Do not apply them**: the orchestrator does.
> - Every limit message is Spanish, short and kind.
> - Spend is counted with the existing usage meter's prices (`src/usage-meter.ts`).
> - The owner (`LENTE_OWNER_USER_ID`) is never capped.
> - Keep your edits to `src/pilot.ts` in clearly separate blocks; L3 edits other parts of it.
> - Have 2.1–2.3 committed by 12:00 and 2.4–2.6 by 14:15.

### L3: Hub, piano

> Worktree `../lente-L3`, branch `close/L3`. Read `AGENTS.md` and `openspec/changes/add-practice-mode/` (all of it). Do group 1 by 12:00 and 5.1 by 13:00. Then wait for 5.2 (the owner at the piano, about 15:30); if it is green, do 6.1 and 6.3 by 17:30. Tests first, commit per task. L2 edits the access parts of `src/pilot.ts`; keep yours in separate blocks.

### L4: Android, piano

> Worktree `../lente-L4`, branch `close/L4`. Read `AGENTS.md` and `openspec/changes/add-practice-mode/` (all of it). Do group 2 (pure Kotlin with JVM tests: YIN pitch, the note tracker with repeated-note onsets, the alignment) by 13:00, and group 3 by 15:00.
> - The «Practicar» tile goes in `ui/Home.kt` after 14:00, when L1 releases it.
> - Logcat tag `LentePractice`, numbers only.
> - Install on the Samsung and check that the scale is heard: the owner can play it, or play a keyboard sound from the Mac (`afplay` a generated WAV of the C scale made by a small script in `/tmp`).
> - If 5.2 is green, 6.2 by 17:30.

### L5: Website, release notes, web terms

> Worktree `../lente-L5`, branch `close/L5`. Read `AGENTS.md`, `README.md`, and `openspec/changes/ship-hackathon/` (design decisions 6–7, tasks 5.x and 3.2).
> - Build `site/` as plain, accessible, fast HTML/CSS in Spanish (`/`) and English (`/en/`), with the sections in design decision 6.
> - Use `web/` assets and `docs/promo/clip-rig-in-hand.png` (a real photo) for images; the other `docs/promo` images are generated concepts and must be labelled as such or left out.
> - Leave placeholders for the video and the screenshots; the orchestrator fills them at 16:30 and 18:30.
> - Write `.github/workflows/pages.yml`, `scripts/qr.ts` (with a test), `docs/release-notes-0.2.0.md`, and the web app's terms screen and «Borrar ejemplo» (task 3.2).
> - Every number on the site must be in `docs/benchmarks.md`.
> - Commit at 12:00 (skeleton) and 14:15 (content).

### L6: Numbers, docs, archives

> Worktree `../lente-L6`, branch `close/L6`. Read `AGENTS.md`, `README.md`, `docs/benchmarks.md`, `docs/submission.md`, `docs/kb/hackathon.md` and `openspec/changes/ship-hackathon/` tasks 6.x.
> - **By 12:00:** 6.1 (the sight numbers are written in the task), 6.2 (port the prompt A/B into `scripts/bench-sight-prompts.ts` and run it once; up to US$ 0.20) and 6.6.
> - **By 18:00:** 6.4 and 6.5 as features land. 6.7 after the 18:00 merges, with the orchestrator.
> - **Throughout:** 6.8.
> - **Rule:** every number comes from `docs/benchmarks.md`; anything not measured is not claimed. The README's «What was built» table is the attribution judges check: one row for today, complete.

---

## What every agent must know

- **Production** is the Modal app `lente-hub` at `https://drew-lizcano--lente-hub-hub.us-east.modal.run`. The clip on the owner's desk is flashed to it (cloud build) and reconnects after every deploy.
- **The phone** is the owner's Samsung, adb serial `RFGYB098QCN`, with the Lente app signed into the owner's account. The `lente-hardware` skill explains the bench. Do not sign out the owner's account; L1 uses a second account the owner gives at 14:30.
- **Tests** use synthetic `PROBE-` data only. Screenshots for the site come only from the second account with the sample data.
- **Spend:** benches and evals together up to US$ 3 today without asking. The hub's own spend is watched by the orchestrator.
- **Stop and ask the orchestrator** when:
  - a check fails twice after honest fixes;
  - a task needs a new runtime dependency, a destructive migration, a secret, or a change to another lane's files;
  - something would put real people's data in the repository.
