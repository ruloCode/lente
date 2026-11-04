# Tasks

Depends on: `add-sight-mode`, `add-practice-mode`, `add-accounts`, `add-web-desktop`, `add-android-app`

All times are Bogotá on 2026-11-04 (the same as ET today). The deadline is **21:00**. The plan:
- checkpoints at **12:15**, **14:30** and **16:30**;
- **code freeze at 18:00**;
- the submission at **19:30**.

Lanes and their files are in `docs/handoff-closing.md`. `[orch]` = the orchestrator, `[owner]` = the owner (minutes, between video takes), `L1`–`L6` = lane agents. Every code task ends with `pnpm typecheck && pnpm test` (and `pnpm android:test` for Android), a tick here, and a commit on the lane's branch.

## 0. Owner actions (5–10 minutes total, before 12:15)

- [ ] 0.1 Google Cloud → APIs & Services → OAuth consent screen → **Publish app** (from "Testing" to "In production"). Basic scopes need no verification. Without this, no judge can sign in [owner]
- [ ] 0.2 Google Cloud → Credentials → the Android OAuth client lists the SHA-1 of the debug key that signs the release APK (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1`); add it if missing [owner]
- [ ] 0.3 Supabase → Authentication → URL configuration: the Modal hub's `/auth/callback` is listed. Google provider on. No change expected [owner]
- [ ] 0.4 Confirm the Meta USD 150 credit is claimed (deadline today 21:00 ET) and a spend limit is set in Meta's Billing [owner]
- [ ] 0.5 Give the orchestrator the go to deploy to Modal and apply additive Supabase migrations today without asking again (one line in the orchestrator's chat) [owner]

## 1. Ver on Android, finished (L1, 10:30–12:00)

- [ ] 1.1 Review the stopped agent's uncommitted Android work (see `design.md` Context) against the contract in `docs/handoff-closing.md` § L1; finish what's missing: `start` with persona sight and intro, `narration`, `quiet`, `locate`/`location`, `/tts` voice `sight` with fallback, TalkBack actions; `pnpm android:test`, `pnpm android:apk`
- [ ] 1.2 On the Samsung against Modal: open Ver for the first time → Lente speaks first in the Colombian voice, asks name, age and wishes, explains, asks to narrate; «¿qué tengo en la mano?» answers; «¿dónde estoy?» answers with the street and neighborhood; «quédate callada» → «Grabando en silencio», long press talks again; screenshots of each step into `results/` (git-ignored) [phone] [hw]
- [ ] 1.3 Tick `add-sight-mode` 4.3 and 4.4 with what was checked; commit `add-sight-mode 4.3–4.4 …`

## 2. Judge access on the hub (L2, 10:30–14:30)

- [x] 2.1 `mayCreateAccount` in `src/access-gate.ts` (design decision 1) with tests: open before the date, closed after, allowlist mode, an empty allow list; wire it where `LENTE_ALLOWED_EMAILS` is read in `src/pilot.ts`; the closed message on the sign-in page (`pnpm test`)
  - 2026-11-04 (L2): `mayCreateAccount` and `parseSignup` in `src/access-gate.ts` (a plain `LENTE_SIGNUP_UNTIL` date closes at its start in Bogotá; `open` without a valid date, or an unknown mode, falls back to the allow list with a warning). `Accounts` takes the policy; an existing account keeps signing in whatever the list says (the spec's «existing accounts SHALL keep signing in»; the old «left the list = refused» test changed accordingly). The sign-in page and every refusal carry «Las inscripciones están cerradas por ahora…». Unit tests in `test/access-gate.test.ts`, `test/accounts.test.ts`; hub test `test/judge-access-hub.test.ts` (open → in, after the date → 403 `signup_closed` for a newcomer, the earlier judge and the allow list still in, allowlist mode → `closed_test`). `pnpm typecheck && pnpm test` (750/750) and `pnpm smoke` green.
- [x] 2.2 `src/spend-cap.ts` (design decision 2) with tests (user cap, global cap, owner exempt, day rollover in America/Bogota); migration `supabase/migrations/20261104000000_usage_daily.sql` (user_id, day, usd numeric, updated_at; RLS on, no policies); the store in `src/supabase-stores.ts` and a file store for the laptop hub; the check before every Spark, Baseten, ElevenLabs and transcription call for non-owners; the limit message and listening pause; tests on the fake PostgREST and a hub test on the stub with a tiny cap (`pnpm test`)
  - 2026-11-04 (L2): `usage_daily` already existed (`20261101000000_accounts_schema.sql`: per user, day, provider and model, numbers only, RLS on, no policy) and every runtime already writes it, so `20261104000000_usage_daily.sql` is additive only: an index on `day` for the cross-user read at start. A user's spend is its rows' `cost_micro_usd` with transcription priced from `audio_seconds` (`SupabaseUsage` now writes the transcription row's cost too). `src/spend-cap.ts` (pure: `capCheck`, `SpendLedger` by Bogotá day, `MeterDelta`, the limit lines, `cappedRoute`); `SupabaseDaySpend` (via the named `system.usageOnDay` read) and `FileDaySpend` (`data/usage-daily.json`). In the hub: `callSpark` (Spark and Baseten) throws `SpendCapError` before any call; `/ask` answers the limit line (JSON and stream), `/listen/on` 503, `/help` `/briefing` `/look` `/summary` `/live/on` 429, `/tts` 404 (the phone falls back to its own voice), `/voice` sends the line and closes; listening started any other way pauses with `{ reason: "limit", message }`, and every 5 s a capped runtime pauses listening and ends its voice session. The owner is never capped and not counted in the global sum (orchestrator decision 2026-11-04: its own buffer). Global default 6.00 (US$ 98.26 credit left on 2026-11-04). In Ver, reaching the cap stops live narration and says the line once as a «VER» card; a look answers with it (looks and live reads are not refused up front, so the line is spoken). Tests: `test/spend-cap.test.ts` (caps, owner, Bogotá rollover, ledger, usage_daily round trip on the fake PostgREST, the file store), `test/judge-access-hub.test.ts` (a tiny cap on the stub: the second question is the limit line with no model call, another account and the owner unaffected; after a restart the read-back spend caps per user and globally, the owner's spend caps nobody; in Ver with the clip emulator, narration stops and the limit is said once). 761/761, smoke green. No scratch Postgres on this machine (no `psql`/`postgres`): the SQL is checked by `test/schema.test.ts` only.
- [x] 2.3 `src/preview-terms.ts` (`src/terms.ts` is the memory index's word normalizer) and `/terminos`, `/privacidad` (design decision 4); migration `20261104010000_terms.sql` (`accounts.terms_version`, `terms_accepted_at`); `POST /terms/accept`; 428 `needsTerms` on data routes until accepted; tests (`pnpm test`)
  - 2026-11-04 (L2): `TERMS_VERSION = "preview-2026-11-04"`, the Spanish and English text (prototype, not a medical or mobility device; text only, sealed; audio and photos not kept for test accounts; Meta's free-credit clause; delete any time; the repository's issues), `/terminos` and `/privacidad` open to anyone. Migration `20261104010000_terms.sql`: two nullable columns on `accounts`, additive. `GET /terms` (`{version, needsTerms, summary:{es,en}, links}`), `POST /terms/accept` with `{version}` or `{}` (none accepts the current one; a stale version answers **409** with the current version in the body). Until accepted, every data route answers 428 `{needsTerms:true, version, message, links}` and the `/device` and `/voice` sockets get 428; allowed before: the terms routes, `/auth/signout`, `/account*`, the static shells. **The owner (`LENTE_OWNER_USER_ID`) is exempt**, so the owner's installed app, clip and voice keep working before L1's terms screen ships. On by default when sign-up is open (`LENTE_TERMS=required|off` overrides), so the existing accounts-mode tests (allowlist) are unchanged. The terms columns are read apart from sign-in, so a hub deployed before the migration still signs everyone in (a non-owner then sees 428 and the accept answers 503 until the migration is applied). Tests: `test/preview-terms.test.ts` (the gate, the text, the file and Supabase stores on the fake PostgREST), `test/judge-access-hub.test.ts` (428 → 409 stale → accept → 200, sockets 428 then 101, owner never asked, acceptance survives a restart). 767/767, smoke green.
- [ ] 2.4 `src/sample-memory.ts` (pure, from `scripts/eval/memory-set.ts`'s generator, PROBE names only) and the first-use write after terms, marked `sample`; `POST /sample/delete`; tests: the sample answers «¿Qué se decidió sobre la beta?» with a source, deletion leaves the person's own data (`pnpm test`)
- [ ] 2.5 Media for the owner only, whatever the switches say: a hub test with a non-owner account recording with the camera on → no media object (`pnpm test`)
- [ ] 2.6 `deploy/modal/hub.py`: `memory=2048`, `cpu=1.0`, and plain env `LENTE_SIGNUP=open`, `LENTE_SIGNUP_UNTIL=2026-11-17`, `LENTE_USER_DAY_CAP_USD=1.00`, `LENTE_GLOBAL_DAY_CAP_USD=6.00`, `LENTE_MAX_LISTENING=4` (non-secret config, documented in `docs/kb/modal.md`)

## 3. Judge access on the clients (L1 after 12:00, L5 for the web)

- [ ] 3.1 Android: a fresh install opens on «Iniciar sesión con Google» against the Modal hub (no pairing screen); after sign-in, the terms screen (summary, the two links, «Acepto») on 428 `needsTerms`; Ajustes → «Borrar ejemplo»; `pnpm android:test`, checked on the Samsung with a second Google account the owner provides [phone] [human]
- [ ] 3.2 Web app (`web/app/`): the terms screen on `needsTerms`, «Borrar ejemplo» in Ajustes; checked in Chrome against Modal with the same second account [human]

## 4. Piano (L3 hub, L4 Android): `add-practice-mode`

- [ ] 4.1 L3: `add-practice-mode` group 1 by 12:00, then 6.1 if 5.2 is green by 16:00
- [ ] 4.2 L4: `add-practice-mode` groups 2 and 3 by 15:00, then 6.2 if 5.2 is green
- [ ] 4.3 Owner at the piano (10 minutes, can be filmed for the video): `add-practice-mode` 5.2 [owner] [phone]

## 5. Website and release (L5, 10:30–18:00)

- [ ] 5.1 `site/index.html`, `site/en/index.html`, `site/styles.css`, `site/assets/` per design decision 6: plain HTML and CSS, no framework, accessible (landmarks, alt text, contrast AA, works with a screen reader), fast (images as WebP under 200 KB each), Open Graph tags with the share card from `web/` assets; placeholders for the video and screenshots
- [ ] 5.2 `.github/workflows/pages.yml` publishing `site/` on pushes to `main` that touch it; the repository's Pages source set to GitHub Actions (orchestrator, `gh api -X POST repos/ruloCode/lente/pages -f build_type=workflow` if not set)
- [ ] 5.3 A QR code to `https://github.com/ruloCode/lente/releases/latest/download/lente.apk` as an SVG generated by a small zero-dependency script (`scripts/qr.ts`, a test for one known payload) or hand-checked with a phone camera
- [ ] 5.4 Screenshots for the site from the judge test account with only sample (PROBE) data: Inicio, the chat answering from the sample, Ver with a description, Practicar mid-lesson, the web app; never the owner's account (`adb exec-out screencap`, cropped, WebP)
- [ ] 5.5 `docs/release-notes-0.2.0.md`: Android 10+, how to allow the install, sign in with Google, the three things to try, the privacy line, known limits
- [ ] 5.6 Web app terms screen (task 3.2)

## 6. Numbers, docs and the repository (L6, 10:30–18:30)

- [x] 6.1 `docs/benchmarks.md`, under «Sight mode», the run already measured with `scripts/bench-sight.ts` on the real clip on 2026-11-04 (label `sight`, 155 s, the checklist prompt): live model 4.14 s p50 / 6.17 s p90 / 9.61 s max (n = 33); frame → phone 5.33 / 6.27 / 6.31 s (n = 13); between descriptions 8.05 / 22.19 / 28.03 s (n = 12); look model 6.28 / 7.84 s (n = 3); look frame → phone 6.69 / 8.18 s (n = 3); unchanged 11 of 33; stale dropped 9 of 33; stage split: asked → first token 3.92 s p50 against 1.94 s in the baseline. Say what it means: the checklist prompt made Spark reason about twice as long, which led to the one-sentence prompt
  - 2026-11-04: recorded in `docs/benchmarks.md` § Sight mode «With Ver's first prompt, the checklist», every number as given here, with what it means (twice the reasoning, 9 of 33 stale, 13 of 33 shown) and why the live prompt became one sentence
- [x] 6.2 Port the throwaway prompt A/B into `scripts/bench-sight-prompts.ts` (three synthetic or promo frames from `docs/promo/`, each prompt × frames × 2, time to first token, total, output tokens), run it once (about US$ 0.10) and record the table in `docs/benchmarks.md`; if the numbers differ from those quoted in `src/sight.ts`'s comment (3.98 s / 331 tokens checklist, 3.16 s / 202 tokens one sentence), update the comment to the new run [key:MODEL_API_KEY]
  - 2026-11-04 10:15: `scripts/bench-sight-prompts.ts` written fresh (checklist from `5ee0323` against `SIGHT_LIVE_PROMPT`, the hub's live-read call, `lente-hero.jpg`, `lente-ecosistema.jpg`, `clip-rig-in-hand.png`, × 2, interleaved), run once: checklist 5.50 s first token / 327 output tokens p50, one sentence 3.08 s / 174; US$ 0.035. Table in `docs/benchmarks.md`; the numbers differed from the comment, so `src/sight.ts`'s comment now quotes this run
- [ ] 6.3 After 1.2 and 4.3: a sight bench run with the one-sentence prompt (`modal app logs lente-hub -f </dev/null | node scripts/bench-sight.ts --seconds 120 --skip 5 --label sight-v2` while Ver narrates) and the practice bench, both recorded [hw] [phone]
- [ ] 6.4 README:
  - What runs today: Ver (conversation, look, «¿dónde estoy?», quiet recording) and Practicar.
  - The Measured table gains only the numbers from 6.1–6.3 and `add-practice-mode` 5.2.
  - Status: anyone can sign in with Google during judging, with the caps.
  - The website and download links at the top.
  - The privacy note: the preview terms, the free-credit clause, media only for the owner, no guidance to move, no identities.
  - The «What was built» row for 2026-11-04 (Ver, the companion, location, quiet recording, piano, judge access, website, release).
  - The video link once the owner gives it.
- [ ] 6.5 `docs/submission.md` rewritten for the form:
  - a one-line description;
  - the problem and the users (second-language professionals; blind and low-vision people; learners);
  - how each Meta model is used;
  - measured numbers only;
  - what was built during the hackathon;
  - links: repo, website, video, APK, X post;
  - the bonus prizes we claim (Most Viral, Community Vote, Best Agentic: the agent bridge and the voice tools); open weights only if `add-fast-reply-lane` was measured, else not claimed;
  - the X post and LinkedIn post texts in Spanish and English;
  - the gallery blurb.
- [x] 6.6 `docs/kb/decisions.md`: open sign-up with an end date and caps; the preview terms; the sample memory; the website and release
  - 2026-11-04: five entries in `docs/kb/decisions.md` (the one-sentence live read; open sign-up with an end date and two caps; the preview terms; the synthetic sample; the website and the APK release), from design decisions 1–7, each cost figure from `docs/benchmarks.md`
- [ ] 6.7 Archive every change whose tasks are all ticked, one at a time in dependency order, `pnpm exec openspec validate --strict` after each (`add-live-transcript`, `add-record-sheet`, `apply-ios-look`, and any that close today)
- [ ] 6.8 Repository hygiene: no stray files in the root; the 231 MB of untracked design assets stay out (the owner decided); `.gitignore` covers `results/`; CI green on `main`

## 7. Checkpoints (orchestrator)

- [ ] 7.1 **12:15:** merge the lanes that are green, in this order: L6 (docs only), L1, L3, L2. After each: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm smoke`, `pnpm android:test`, `openspec validate --strict` for every open change. Apply migrations 2.2/2.3 through the Supabase MCP after `list_migrations` shows nothing pending but them. Deploy (`pnpm deploy:hub` from a clean `main`), then check:
  - `/health` ok;
  - the owner's account still works;
  - the clip reconnects;
  - a non-owner account in the test hub is capped [orch]
- [ ] 7.2 **14:30:** merge L1 (sign-in, terms), L2 (sample), L4 (piano Android), L5 (site skeleton) the same way; deploy; install the APK on the Samsung; the owner's second Google account signs in on the web and on Android; Pages is live [orch]
- [ ] 7.3 **16:30:** merge P1/P2 if green; L5 screenshots; site content complete; spend so far read from the hub (`usage_daily`) [orch]
- [ ] 7.4 **18:00 freeze:** last merges; full checks; deploy; `versionName 0.2.0` / `versionCode 2`; `pnpm android:apk` on the owner's Mac; `gh release create v0.2.0-hackathon …#lente.apk` with `docs/release-notes-0.2.0.md`; download it from the website on the Samsung, install over the old one, sign in, ask the sample a question [orch] [phone]
- [ ] 7.5 **18:30:** the video link from the owner into the README, the website and `docs/submission.md`; final README pass; push `main`; CI green; Pages updated [orch]
- [ ] 7.6 **19:30:** the owner submits on the Cerebral Valley platform with `docs/submission.md`: repo, video (public or unlisted, plays without login), website, team, X post link [owner]
- [ ] 7.7 **20:00:** the X post with the 30-second cut, the gallery link, LinkedIn; watch the global spend after the post [owner] [orch]
- [ ] 7.8 After the deadline: keep the hub up through Nov 16; check spend and errors once a day; close sign-up (`LENTE_SIGNUP=allowlist`) on Nov 17 [orch]
