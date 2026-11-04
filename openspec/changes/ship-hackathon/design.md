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
- **Global:** `LENTE_GLOBAL_DAY_CAP_USD`, default **6.00**. Meta's billing showed **US$ 98.26** of free credit left on 2026-11-04, with no card on file (calls fail at zero, they are not billed). 13 days (Nov 4–16) at 6.00 is about US$ 78, which leaves a buffer for the owner and the benches.
- **Owner:** exempt, and not counted in the global sum: the owner's use comes out of that buffer, so it never caps a judge.

Daily spend per user is kept in a new `usage_daily` table: user, day, USD, no content, RLS with no policies, written only by the hub with the service key. It survives restarts. The hub also sums the day in memory for the global check and reloads it from the table at start. (`usage_daily` already exists from `add-accounts`, one row per user, day, provider and model with `cost_micro_usd`; the migration only adds an index on `day`.)

When blocked:
- in Ver, narration stops and the line is said once as a «VER» card; a look answers with it;
- model calls return a friendly Spanish line («Por hoy llegaste al límite de la prueba. Vuelve mañana.» / «La demo llegó a su límite de hoy.»);
- listening pauses with that reason;
- nothing errors.

### 3. Capacity

The container goes to `memory=2048`, `cpu=1.0` in `deploy/modal/hub.py`. That is about 340 MB per hot memory index measured in `docs/benchmarks.md`, plus headroom for several judges at once.

`LENTE_MAX_LISTENING` defaults to **4** until task 4.3 measures it. Beyond the cap, starting to listen answers «Lente está ocupada, prueba en unos minutos» (already built). Chat, look and voice are not capped by it.

### 4. Preview terms, accepted once

`src/preview-terms.ts` (`src/terms.ts` was taken by the memory index's word normalizer) holds `TERMS_VERSION = "preview-2026-11-04"` and the Spanish and English text, served at `/terminos` and `/privacidad`. The text covers:
- what Lente is: a hackathon prototype, not a medical or mobility device;
- what it keeps: text memory sealed per user; audio and photos only for the owner;
- that model calls go to Meta's Model API on free credits, which allow content to be used for product improvement, so nothing sensitive should be shared;
- that the account can be deleted at any time, with all its data;
- who to write to: the repository's issues.

Each account has `terms_version` and `terms_accepted_at`. Until it has accepted the current version, the hub answers every data route with 428 and `{ needsTerms: true, version }`, except the terms routes themselves, sign-out and the account rights; the clip and voice sockets are refused with 428 too. The owner is exempt: they wrote the terms, and their clip and phone must never be locked out mid-demo. The web app and Android show one screen with the summary, the two links and «Acepto».

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

### 6b. Look and feel

The website looks like Lente's own app on a bigger canvas, calm and confident, with the product as the hero.
- **Principles taken (measured with Matiz on 2026-11-04; measurements and principles only, no code, copy, images or assets):**
  1. *The product alone on a quiet field, as big as the viewport allows* (apple.com/airpods-pro: the hero is the product on #F5F5F7 with the headline below it). Lente's hero shows the clip on the glasses, large, in a rounded lit card.
  2. *Sections alternate two calm surfaces instead of dividing lines or boxed cards* (apple.com/airpods-pro section rhythm: #F5F5F7 ↔ #FFFFFF, 160 px top padding as the most common value). Lente alternates `--bg` and `--surface` with `clamp(96px, 12vw, 160px)` of padding.
  3. *Depth from a 0.5 px inset hairline and one soft shadow, not borders* (apple.com/airpods-pro: `inset 0 0 0.5px` on every card, radius 28 on cards and images; mentraglass.com: a five-step shadow ladder that ends at `0 8px 26px` at about 9 % black). The device frames and stages use the app's `--shadow-float` plus a hairline.
  4. *Large headings tracked tight, body text short* (evenrealities.com: display at −0.043 em; apple.com/airpods-pro: body measured at 40 ch in feature blocks, 17 px base). Lente keeps −0.04 em on the display size, `text-wrap: balance` on headings and `pretty` on text, at most 68 ch, and about 44 ch beside a product UI.
  5. *Reveal on scroll is a short fade and rise, nothing more* (apple.com/airpods-pro: 55 reveals, fade from 0 and a 30 px rise, 0.25 s, no stagger groups). Lente rises 16 px with a fade, staggered by 60 ms inside a section, under 600 ms.
  6. *Hover changes the fill a little; press is the only spring* (apple.com/airpods-pro: hover moves the button fill by about 2 % lightness, transitions at 0.1–0.32 s). The pills lighten on hover, and the kit's snappy spring runs only on press.
  7. *One idea per screen, in the order hero → product → features → try → build → trust* (Matiz composition over the hardware corpus: Mentra, Omi, Brilliant Labs, Even Realities open with hero → showcase or feature-split, and end with gallery or FAQ before the footer).
- **Tokens:** `site/styles.css` copies the values of `src/theme.ts` under the same custom-property names (the site has no build step), plus the iOS kit's navigation glass and spring curves (`docs/design/ios-kit/nav.css`). **Light is the default** (the owner's call, 2026-11-04), whatever the system's scheme; dark is designed too, not inverted, and a sun/moon switch in the navigation turns it on and remembers the choice. Without script the site stays light. The page has one `theme-color` (the light `--bg`) that the switch updates. Text keeps the app's 7:1 pairs.
- **Type and rhythm:** the system stacks only (no web fonts). Headings use the display stack with tight tracking and `clamp()` sizes; text is at most about 68 characters wide; spacing follows an 8 px scale; one idea per screen.
- **Navigation:** the app's glass capsule, sticky and centered, with section anchors and an ES/EN switch.
- **Hero:** the one line, two pill buttons («Entrar con Google» filled, «Descargar para Android» glass), the QR code in a small glass card, then the owner's render (thin gold glasses, the grey printed clip on the right temple, a warm off-white field) large in a rounded card, labelled «Render». In dark the same card stays warm and lit, a stage on the black page; a light photo pasted onto black would read as a hole, and the older black-glasses render (`clip-dark`) showed a different product. The image scales up slightly as it leaves the viewport (scroll timeline), never on load.
- **The product as real UI:** the Dilo card, a Ver line and the Practicar note row are built in HTML and CSS from the app's components with synthetic text, captioned «Ilustración de la interfaz». The screenshot slots stay for the real captures.
- **Images:** the renders from the premium pack, labelled «Render» where they could pass for photos; the lifestyle images (generated people) are left out; `clip-rig-in-hand` stays the one real photo, labelled as real.
- **Motion:** CSS: a fade and a 16 px rise on scroll where the browser supports scroll-driven animations (`animation-timeline: view()`), staggered inside a section, and press with the kit's spring curve; nothing loops, nothing bounces, nothing over 600 ms; all of it off under `prefers-reduced-motion`. Browsers without scroll timelines show everything still, which is fine.
- **The intro (the owner's call, 2026-11-04):** on the first visit of a session, the home page opens with the mark assembling itself on the page color: the blue shape settles, the light wing slides in, the navy lens opens like an iris, the three voice bars rise one after another and «Lente» closes its tracking; then the layer fades while the headline rises under it. Each step is at most 600 ms and the whole intro ends by 1.45 s. It never blocks a click (no pointer events), the hero render is already painted under it (it doesn't delay the largest paint), and it doesn't play without script, under `prefers-reduced-motion`, or again in the same session.
- **One script:** `site/theme.js` (≤ 2 KB, no dependency) does what CSS can't: the light/dark switch and remembering it, and playing the intro once per session. It loads in the head without `defer`, so a reader who chose dark never sees a light flash first; the rest of the page doesn't wait on it beyond that one tiny file. Without it the site is complete, in light.
- **Performance:** every image has its size, the hero loads first (`fetchpriority="high"`) and the rest lazily, each image is under 200 KB and a page with its images under 1 MB. There is a `404.html` in the same look. `test/site.test.ts` checks these.

### 7. The APK

- Built with `pnpm android:apk` on the owner's Mac. It is signed with the debug key whose SHA-1 the Android OAuth client must list. `-P lente.supabaseUrl/…` comes from `gradle.properties` as today.
- `versionName 0.2.0`, `versionCode 2`.
- Published with `gh release create v0.2.0-hackathon <dir>/lente.apk --title "Lente 0.2.0 (hackathon)" --notes-file docs/release-notes-0.2.0.md --latest`, where `lente.apk` is a copy of `app-release.apk`: the file's own name becomes the asset's name. `file#lente.apk` would only set the label, leaving the asset `app-release.apk` and `releases/latest/download/lente.apk` a 404. Later builds replace it with `gh release upload v0.2.0-hackathon <dir>/lente.apk --clobber`.
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
