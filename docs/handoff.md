# Handoff: from four branches to Lente in production

For whoever picks up Lente's work, a person or a coding agent. It goes step by step from today's state (2026-11-02) to a hub on `main` that other people can sign up to. Read `AGENTS.md` first: its hard rules apply to every step here.

Steps marked **OWNER** need the project owner: keys, billing, consoles, legal review, the hardware's feel. Everything else can be done by anyone with the repository.

## Ground rules

- Never read, print or paste `.env`, `~/.config/lente/`, `data/` or `firmware/**/secrets.h`. Keys reach Modal only through `node --env-file=.env deploy/modal/secret.ts` (OWNER).
- One OpenSpec change and one task group per session. Run each task's verification, tick it in `tasks.md`, and after the group run `pnpm typecheck && pnpm test` and `pnpm exec openspec validate <change> --strict`.
- Tags say who can do a task: `[hw]` the clip, `[phone]` the Android phone over adb (see the `lente-hardware` skill), `[human]` a person, `[key:NAME]` a key in `.env`. An untagged task is code anyone can do.
- Every number in docs or the video comes from a `scripts/` run.
- Test data is synthetic (`PROBE-…`). Nothing from a real meeting goes in tests, logs, docs or commits.
- Don't run `pnpm auto` (the auto lane) while Phase 0 is in progress: it builds from `main`.

## Where things stand (2026-11-02)

| Branch | Carries | Notes |
|---|---|---|
| `main` | Pilot, Android app, cloud hub, roadmap changes | Behind the branches below |
| `feat/add-accounts` | `add-accounts`, `add-hermes-import`, `add-projects`, `add-task-owners`, `add-record-sheet` | Supabase project and migrations are live |
| `feat/web-desktop` | All of the above + `add-web-desktop` (the web app at `/app`) | **This is what production runs** |
| `feat/voice-mode` | `add-voice-mode` (Hablar con Lente) | Forked from an earlier point of `feat/add-accounts` |
| `feat/agent-bridge` | `add-agent-bridge` (MCP per user, `lente` CLI, agent jobs) | Its migration `20261102030000_agent_scopes.sql` is already applied on the live project |

Production: the Modal app `lente-hub`, one container, accounts mode (Supabase and Sign in with Google), deployed from `feat/web-desktop`. **Until Phase 0 is done, do not deploy from `main`.** That would take production back to pairing mode without `/app`.

Conflicts already measured with `git merge-tree` (read-only):

- Every branch conflicts with the others in `README.md` (rows of the "What was built" table) and `docs/kb/decisions.md` (dated entries). Both are append-only: keep every row and entry, ordered by date.
- `feat/voice-mode` against `feat/agent-bridge` also conflicts in three places in `src/pilot.ts` (see Step 2.4).
- No branch touches `AGENTS.md`, `docs/architecture.md` or `openspec/specs/`.

## Phase 0: integrate

### Step 1. Prepare `main`

1. `git status` must be clean apart from untracked assets.
2. **OWNER:** two leftovers in the owner's checkout.
   - An uncommitted `deploy:hub` script in `package.json` and its comment in `deploy/modal/hub.py`: commit them.
   - An untracked `openspec/changes/add-accounts/`: an older copy of the one on the branch. Its `design.md` and `tasks.md` are behind, the rest is identical. It would make `git merge` refuse. Check with `git diff --no-index` against `git show feat/add-accounts:openspec/changes/add-accounts/tasks.md`, then move the folder out of the repo (not delete it) before merging.
3. **OWNER:** decide on the untracked images in `docs/design/image-ref/` and `docs/design/ios-kit/assets/premium/`. They are generated mockups and assets. Commit the ones the README cites. Don't commit `bm-01-recuerdos-anillos.png` as it is: it shows a real company name (task 5.1 of `add-memory-timeline`).
4. Create an integration branch: `git switch -c integrate/2026-11 main`.

### Step 2. Merge in order

After **each** merge, before the next one:

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm smoke
for c in $(ls openspec/changes | grep -v archive); do pnpm exec openspec validate "$c" --strict || echo "FAIL $c"; done
pnpm android:e2e        # when the merge touched android/
```

1. `git merge feat/add-accounts`: resolve `README.md` by keeping every row, ordered by date.
2. `git merge feat/web-desktop`: should be clean, since it sits on top of the previous one.
3. `git merge feat/voice-mode`: resolve `README.md` and `docs/kb/decisions.md` as above.
4. `git merge feat/agent-bridge`: resolve `README.md`, `docs/kb/decisions.md` and three places in `src/pilot.ts`:
   - **`actionsEvent()`:** keep agent-bridge's `decided` mapping, which adds `job`. For `tasks`, keep voice-mode's `projectName`, which first reads `t.projectId` (from the later `add-task-owners` commits).
   - **`POST /ask`:** the two branches call the answer function by different names (`answer` vs `answerAsk`) with different sentinels (`"no-project"` vs `"no_project"`). Keep the one whose definition survives in the merged file, make the 404 check use its sentinel, and keep voice-mode's `[ask]` log line (lengths and counts only).
   - **`busy()`:** combine both, so the runtime is busy if `clients.size > 0 || jobClients.size > 0 || device !== undefined || status.listening || current !== undefined || voiceSession !== undefined`. Update the comment to name both bridges and voice sessions.

   Then search for the losing name and sentinel: `grep -n "answerAsk\|no_project\|no-project" src/`.
5. Supabase: the files in `supabase/migrations/` must match what the live project has applied (Supabase MCP `list_migrations`). Nothing should be pending. If something is, stop and ask the OWNER.
6. Open a PR from `integrate/2026-11` to `main` and wait for CI to go green. **OWNER** merges.

### Step 3. Deploy from `main`

1. **OWNER:** if any key changed, `node --env-file=.env deploy/modal/secret.ts`.
2. **OWNER:** `pnpm deploy:hub` from a clean `main` checkout. Always with `--strategy recreate`: with a single container, a rolling deploy keeps the old one alive.
3. Check:
   - `/health` is ok, including the database;
   - signing in with Google on `/app` works;
   - the Android app signs in against the Modal hub;
   - a meeting recorded from test speech appears in Reuniones.
4. Only after that, **OWNER** deletes the merged worktrees and branches.

## Phase 1: hackathon close (deadline 2026-11-04, 21:00 ET)

Do only what the demo and the submission need. Each item is a task in its change:

| Change | Task | Who |
|---|---|---|
| `add-accounts` | 8.1 web sign-in against Modal; 7.4 first run starts with sign-in; 7.2 e2e with the stub hub | OWNER `[human]`, `[phone]`, anyone |
| `add-web-desktop` | 6.3 use the app on Modal with accounts; 2.4 Grabar with a real source | OWNER |
| `add-voice-mode` | 3.3 screenshots of each state with `say` speech | `[phone]` |
| `add-android-app` | 5.3 a pocket meeting with the screen off | `[phone]` + OWNER |
| `add-record-sheet` | 1.3 record into a project with the clip off | `[phone]` |
| `add-accounts` | 9.3 the privacy note in the app and README | anyone |
| Submission | Video (numbers from `scripts/`), README, platform form, X post the same night | OWNER |

Then archive every change whose tasks are **all** ticked: `pnpm exec openspec archive <change> --yes`, one at a time and in dependency order, with `pnpm exec openspec validate --strict` after each. `add-live-transcript` is already complete. If two changes add requirements with the same name to one capability, rename one in its change before archiving.

## Phase 2: production v1 (before anyone but the owner signs up)

Work through these in order. Each is an OpenSpec change with its own `tasks.md`:

1. **`add-accounts`, the rest:**
   - 6.3 spend cap per user (measure the cost of one hour of listening first);
   - 6.4 capacity on Modal, which sets `LENTE_MAX_LISTENING`;
   - 4.6 nightly backups;
   - 4.7 import the owner's files;
   - 5.4–5.5 the profile and the long-history eval;
   - 9.4 the decisions.
2. **`add-consent`:** terms and privacy policy (lawyer review: OWNER), acceptance, the room notice, the recording light, retention, and the sign-up gate. 4.2 (paid model billing) is OWNER only and is what opens the gate.
3. **`add-production-ops`:** deploy from `main` through CI, `/health` with the commit, alerts, Supabase Pro before the gate opens, the restore drill, `docs/kb/operations.md`.
4. **`add-clip-setup`:** Wi-Fi and token over BLE from the app, reset, signed updates with rollback. The signing key belongs to the OWNER.
5. **`add-store-release`:** Play signing, the OAuth SHA-1s, the listing, `/cuenta/borrar`, the testing tracks (OWNER in the Console).

**The gate opens** (sign-up beyond the allow list) only when all of these hold:

- terms accepted on sign-up;
- paid billing on every model provider;
- the spend cap is on;
- one backup has been restored;
- alerts arrive;
- production was deployed by CI from `main`;
- capacity is measured.

## Phase 3: product

- Finish `add-ask-lente`, `add-closing-agent` (Muse Spark function calling, `[key:MODEL_API_KEY]`), `add-meeting-library` and `add-memory-review`.
- Then `add-memory-timeline` (Tu historia · Revivir), `add-fast-reply-lane` (Baseten, after the OWNER rotates the key), `add-glasses-mcp` and `add-desktop-mode`.
- `add-cloud-auto-lane` can run alongside once the OWNER rotates its key.

## OWNER-only work, in one list

- Keys in `.env` and the Modal secret.
- Google Cloud OAuth clients and their SHA-1s.
- The Supabase plan.
- Meta and Baseten billing and key rotation.
- The Play Console.
- The legal review.
- The firmware signing key.
- The alert webhook and the CI Modal token.
- Merging PRs to `main`, deploying, and deleting branches.
- Anything that needs a real person's voice or the clip's feel.

## When to stop and ask

- A merge conflict outside the files listed above.
- A failing test that the merge didn't obviously cause.
- A pending Supabase migration.
- A task that would need a key you don't have.
- Anything that would delete data on the live project.
