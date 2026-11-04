# Proposal

Depends on: `add-accounts`, `ship-hackathon` (spend caps, preview terms, owner-only media), `add-sight-mode` (personas, the guest session, `look`, `where_am_i`), `add-voice-mode`. Public listing (anyone but the owner publishing to everyone) also waits for `add-consent`.
Works with: `add-language-coach`, whose «Idiomas» app is written in this change's manifest format from its first day and becomes the fourth listing when this change lands. Either can ship first.

## Why

Dilo, Ver and Practicar are already apps in all but name. Each is a persona with instructions, a set of inputs it uses (the microphone, the clip's camera, the phone's location), a handful of the hub's tools it may call, and outputs (the Dilo card, a voice, a screen). Each was built by hand inside the hub, so the only way to get a fourth is another change in this repository.

The owner wants a place where anyone can publish a Lente app and anyone can try it and install it: a tutor, a museum guide, a recipe helper that looks at the counter. That makes the clip a platform instead of three features, and it lets the demo show how far one device on any glasses can go.

The danger is the one every app store has, made worse by a camera and a microphone on someone's face: code from strangers, apps that ask for more than they need, and persona text that tries to talk the model out of its rules. So in Lente **an app is data, never code**. The hub interprets a declarative manifest, offers only tools from a fixed allow-list, and checks every permission in code, not in a prompt.

## What Changes

- **A Lente app manifest** (JSON, validated by a pure module): id, name, icon (from Lente's own icon set), description, languages, the inputs it asks for, an allow-list of the hub's existing tools, persona instructions, optional content (lessons, cards, phrases), and a price model (`free` or `trial`). Every field has a bound.
- **The three built-ins are the first three listings.** Dilo, Ver and Practicar are written as manifests that bind to their existing engines (`engine: "dilo" | "ver" | "practicar"`), so the format is proven by what already runs. «Idiomas» (`add-language-coach`) is the fourth. Only built-in manifests may name an engine.
- **Third-party apps run on one runtime: a voice-session persona.** The app's persona text goes inside Lente's fixed rules, the model sees only the tools the manifest lists and the person granted, and an optional look prompt and content items are served as data.
- **Permissions shown and granted at install**: Cámara, Micrófono, Ubicación, Leer tu memoria, Escribir en tu memoria. Each one is revocable in the app's page, and a revoked permission takes its tools away from the next turn.
- **Isolation.** An app's own notebook (what it keeps between sessions) belongs to that person and that app only. An app never sees another app's notebook, and sees the person's memory only with «Leer tu memoria». Lente itself (the default voice, the chat) still sees everything the person kept, so «¿qué me enseñó la app de cocina?» works.
- **Rules that apps cannot change**: media (audio and keyframes) stays owner-only (`ship-hackathon`); an app cannot turn on recording or listen to the room; every model call in an app session counts against the person's daily cap and the global cap; the movement and face rules of Ver hold in every app that sees.
- **«Probar»**: any listed app (and a developer's own draft) runs in a sealed trial session that keeps nothing: no chat lines, no day entries, no notebook writes, no memory reads, capped in minutes. The same mechanism as Ver's guest session, scoped to one voice session.
- **Review before listing.** A submitted app goes to a queue the owner approves or rejects with a reason. Listed apps can be reported («Reportar») and taken down; a takedown ends running sessions at the next turn and blocks new installs and trials.
- **Prompt-injection limits on persona text**: bounded length, no tool outside the allow-list (enforced in code), Lente's safety rules always placed after the persona, and markers that imitate the hub's own prompt sections rejected by the validator.
- **Surfaces.**
  - Web app (`web/app`): an «Apps» section: browse, an app's page with its permissions, «Probar», «Instalar», and «Publicar» for developers with a live manifest validator.
  - Android: «Apps» in Ajustes and installed apps in the record sheet's options.
  - Hub routes under `/apps`.
  - Supabase: four new tables, RLS on with no policies (hub-only, as today), in one additive migration.

## Priority (cut lines)

- **P0:** the manifest and its validator, the four built-in manifests, the read-only catalog (`GET /apps`) and the web «Apps» section showing them with their permissions. No third-party code path yet.
- **P1:** installs and grants, the voice-session runtime for third-party apps, the per-app notebook, «Probar», «Publicar» with the validator, the review queue, reports and takedown. Owner and allow-listed accounts only until `add-consent`.
- **P2:** Android «Apps», version updates that ask for new permissions, spend per app in Ajustes.

## A demo slice for today (optional)

The smallest piece that could be built and shown before the 18:00 freeze using only what exists: a **read-only «Apps» catalog** in the web app listing Dilo, Ver, Practicar and «Idiomas» from their manifests, each with its page and its permissions, and «Probar» / «Instalar» / «Publicar» shown greyed out with «Pronto» (as the companion app already marks planned features). It is tasks 1.1–1.4 and 3.1 in `tasks.md`, each marked «Demo slice» (a label, not one of the auto lane's tags). It reuses the web app's router and views, the existing icon set, and nothing that runs an app. The orchestrator and owner decide whether to build it.

## Placement in the build order

Phase 3, product. P0 can land any time (it reads only built-in data). P1 waits for `add-consent`, because opening publishing to people other than the owner means third-party text reaches other accounts and apps may hear the people around the wearer.

## Not in this change

- Payments of any kind. `trial` is a price model with a time limit and no charge; a paid model is a later change.
- Native code plugins, uploaded JavaScript, WebViews or anything that runs a developer's code on the hub, the phone or the clip.
- A public developer SDK or API keys for developers. Publishing is a manifest pasted or uploaded in the web app.
- Apps that listen to the room (other people) or record. Those stay built-in engines.
- Uploaded images (icons, screenshots).

## Capabilities

### New Capabilities

- `lens-apps`: the Lente app manifest, the catalog, installing with permissions, the sealed trial, isolation between apps, review, reports and takedown.

### Modified Capabilities

<!-- none: Dilo, Ver and Practicar keep their behavior; they gain a manifest that describes it -->

## Impact

- **Meta models:** Muse Spark 1.3 runs every app session (the existing voice tool loop over the Responses API, with function calling and web search); Muse Voice Transcribe in `ENDPOINTING` mode hears the person, as in voice mode. No new model.
- **Hub:**
  - new pure modules `src/app-manifest.ts` (validation, normalization, the built-ins) and `src/app-grants.ts` (which tools and inputs a session may use);
  - `apps/builtin/*.json` (the four manifests);
  - routes under `/apps` in `src/pilot.ts`;
  - the app runtime in `src/voice-hub.ts` and `src/voice-agent.ts` (persona from a manifest, tools filtered by grants);
  - the per-app notebook and an `app` field on day entries in `src/day-log.ts`;
  - the memory filter by app in `src/memory-index.ts`;
  - stores in `src/supabase-stores.ts`.
- **Migration:** `supabase/migrations/2026111x_lens_apps.sql` with `app_listings`, `app_installs`, `app_notes`, `app_reports`, additive only.
- **Web:** `web/app/views/apps.js`, `web/app/lib/apps.js` (pure), the routes table.
- **Android (P2):** `ui/Apps.kt`, the record sheet's options.
- **Tests:** `test/app-manifest.test.ts`, `test/app-grants.test.ts`, `test/apps-hub.test.ts` on the stubbed Meta API.
- **Docs:** `docs/kb/decisions.md` (apps are data; this revisits the 2026-10-28 «No plugin store» line), `docs/kb/hub-api.md`, `README.md`.
- **Privacy:** an app adds no new kind of content. Its notebook is text, sealed per user like the rest of the memory, and deleted with the app or the account. A trial keeps nothing.
