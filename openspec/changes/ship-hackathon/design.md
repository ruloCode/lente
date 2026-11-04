# Design

## Context (2026-11-04, 10:00 Bogotá)

### Production

- The Modal app `lente-hub` runs `main` at `90ed166`: one container, `cpu=0.25`, `memory=512`, accounts mode (Supabase + Sign in with Google).
- Sign-up is limited by `LENTE_ALLOWED_EMAILS`, read in `src/pilot.ts` near the accounts setup.
- Listening is capped by `LENTE_MAX_LISTENING`.
- Media is kept only for `LENTE_OWNER_USER_ID`.
- Supabase project `erufopbceodmnqbilovo` (Free plan) has the 7 migrations in `supabase/migrations/` applied.

### Uncommitted work in the main checkout

From the stopped Android agent (Ver's conversation, voice, location):
- `android/…/core/{Place,SpeechQueue}.kt`, `platform/{Locator,SightSpeaker}.kt` and their tests;
- edits to `LenteViewModel.kt`, `Sight.kt`, `Speech.kt`, `VoiceClient.kt`, `HubClient.kt`, `Prefs.kt`, `Home.kt`, `Sections.kt`, `Shell.kt` and `AndroidManifest.xml`.

`pnpm android:test` passed on it at 10:00. The APK was not rebuilt.

### Open owner items

- Google Cloud's OAuth consent screen may still be in "Testing", which only lets listed test users sign in.
- The Android OAuth client must carry the SHA-1 of the key the APK is signed with (the debug key on the owner's Mac).

### Cost basis

- Meta's free credit is USD 150.
- Spend per hour of listening is measured in `docs/benchmarks.md` (the consolidation bench's cost per recorded hour).
- The hub's usage meter (`src/usage-meter.ts`) already prices every call.

## Decisions

### 1. Open sign-up is a mode with an end date, not a removed check

`LENTE_SIGNUP` ∈ `allowlist` (default) | `open`, with `LENTE_SIGNUP_UNTIL` (ISO date).
- In `open`, any verified Google email may create an account until that date. After it, only existing accounts may sign in, and new ones see «Las inscripciones están cerradas por ahora».
- Both are plain config in `deploy/modal/hub.py`'s environment, not secrets, so turning sign-up off is a one-line deploy.
- The pure check goes in `src/access-gate.ts`: `mayCreateAccount({ mode, until, now, email, allowList })`.

Rejected: emptying the allow list's meaning («empty = everyone»). An empty list must keep meaning «nobody»; it is the safe failure.

### 2. Two spend caps, checked before every model call

`src/spend-cap.ts` (pure): `capCheck({ userTodayUsd, allTodayUsd, userCapUsd, globalCapUsd, isOwner })` returns `ok` or `{ blocked: "user" | "global" }`.
- **Per user:** `LENTE_USER_DAY_CAP_USD`, default **1.00**. At today's measured costs that is many hours of chat and look, and about two hours of listening.
- **Global:** `LENTE_GLOBAL_DAY_CAP_USD`, default **12.00**: Meta's USD 150 credit over 12 judging and voting days.
- **Owner:** exempt.

Daily spend per user is kept in a new `usage_daily` table: user, day, USD, no content, RLS with no policies, written only by the hub with the service key. It survives restarts. The hub also sums the day in memory for the global check and reloads it from the table at start.

When blocked:
- model calls return a friendly Spanish line («Por hoy llegaste al límite de la prueba. Vuelve mañana.» / «La demo llegó a su límite de hoy.»);
- listening pauses with that reason;
- nothing errors.

### 3. Capacity

The container goes to `memory=2048`, `cpu=1.0` in `deploy/modal/hub.py`. That is about 340 MB per hot memory index measured in `docs/benchmarks.md`, plus headroom for several judges at once.

`LENTE_MAX_LISTENING` defaults to **4** until task 4.3 measures it. Beyond the cap, starting to listen answers «Lente está ocupada, prueba en unos minutos» (already built). Chat, look and voice are not capped by it.

### 4. Preview terms, accepted once

`src/terms.ts` holds `TERMS_VERSION = "preview-2026-11-04"` and the Spanish and English text, served at `/terminos` and `/privacidad`. The text covers:
- what Lente is: a hackathon prototype, not a medical or mobility device;
- what it keeps: text memory sealed per user; audio and photos only for the owner;
- that model calls go to Meta's Model API on free credits, which allow content to be used for product improvement, so nothing sensitive should be shared;
- that the account can be deleted at any time, with all its data;
- who to write to: the repository's issues.

Each account has `terms_version` and `terms_accepted_at`. Until it has accepted the current version, the hub answers every data route with 428 and `{ needsTerms: true }`, except the terms routes themselves and sign-out. The web app and Android show one screen with the summary, the two links and «Acepto».

This is a subset of `add-consent` tasks 1.1 (without legal review), 1.3, 1.4 and 1.5. Those tasks stay open in `add-consent` for version 1.

### 5. The sample memory

On an account's first sign-in, after terms, the hub writes a sample through the same sealed stores as everything else:
- one project «PROBE · Proyecto de ejemplo»;
- two synthetic meetings from `scripts/eval/memory-set.ts`'s generator: one in Spanish, one in English, with notes, decisions and tasks;
- three open tasks;
- two kept facts.

All of it is marked `sample: true`, and «Borrar ejemplo» in Ajustes removes it. A judge can ask «¿Qué se decidió sobre la beta?» in the first minute and get an answer with sources.

### 6. The website

`site/` holds plain static files with no build step: `index.html`, `en/index.html`, `styles.css`, `assets/` with WebP images from the existing renders and screenshots. It is published by `.github/workflows/pages.yml` (`actions/upload-pages-artifact` + `actions/deploy-pages`) on every push to `main` that touches `site/`.

Sections, in order:
1. **Hero:** one line («Unas gafas que te ayudan a hablar, a ver y a recordar»), the video, and two buttons: «Entrar con Google» (to `https://<modal host>/app`) and «Descargar para Android» (to `releases/latest/download/lente.apk`, with a QR code).
2. **Three uses**, each with a measured number and a real screenshot from a judge test account with synthetic data:
   - Dilo, in meetings;
   - Ver, for people who are blind or have low vision;
   - Practicar, at the piano.
3. **How it uses Meta's models**, the README table in short.
4. **Try it in five minutes:** sign in, the sample project, three things to ask, how to use the phone as the camera and microphone without the clip.
5. **Build the clip:** parts, case STLs, firmware, link to `hardware/`.
6. **Built during the hackathon,** with a link to the README's table, and the repository.
7. **Privacy,** the preview terms in short.
8. **Footer:** the hackathon, the track, the license.

Screenshots are taken only from an account with synthetic (PROBE) data, never the owner's.

### 7. The APK

- Built with `pnpm android:apk` on the owner's Mac. It is signed with the debug key whose SHA-1 the Android OAuth client must list. `-P lente.supabaseUrl/…` comes from `gradle.properties` as today.
- `versionName 0.2.0`, `versionCode 2`.
- Published with `gh release create v0.2.0-hackathon android/app/build/outputs/apk/release/app-release.apk#lente.apk --title "Lente 0.2.0 (hackathon)" --notes-file …`, so the asset is named `lente.apk`.
- The release notes say:
  - Android 10+;
  - allow installing from this source;
  - sign in with Google;
  - what to try first.

### 8. Working in lanes

Agents work in separate git worktrees on branches `close/<lane>`. One orchestrator merges into `main` at fixed checkpoints after the full checks. Only the orchestrator deploys, and only from a clean `main`. File ownership per lane is in `docs/handoff-closing.md`. A lane that must touch another lane's file asks the orchestrator first.

## Risks

- **Google "Testing" mode** blocks every judge. The owner's first action, task 0.1, is to publish the consent screen; basic scopes (openid, email, profile) need no Google verification.
- **Free-credit data clause.** Judges' content reaches Meta under the free-credit terms. The preview terms say so plainly. If the owner turns on paid billing for the Meta Model API (`add-consent` 4.2), that line changes.
- **Cost.** The caps bound it. The orchestrator checks the global spend at each checkpoint and after the post goes out.
- **Many judges at once on one container.** The listening cap and the 2 GB container bound it. Chat, look and voice do not hold a transcription session.
- **Time.** Code freeze at 18:00. Anything not green by then is left out of the website and the video, not rushed in.
