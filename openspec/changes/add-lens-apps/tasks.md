# Tasks

Depends on: `add-accounts`, `add-voice-mode`, `add-sight-mode`

Group 1 and task 3.1 are P0 and need only built-in data. Groups 2, 4 and 5 are P1: owner and allow list only (`LENTE_APPS=open`) until `add-consent`'s sign-up gate holds. Group 6 is P2. Tasks marked «Demo slice» are the optional read-only catalog for 2026-11-04 (proposal, «A demo slice for today»); the orchestrator decides whether to build them before the 18:00 freeze.

## 1. The manifest and the built-ins (P0)

- [ ] 1.1 Demo slice. `src/app-manifest.ts` (pure): the format of design decision 2, `validateManifest(json, { builtIn })` returning every error with its field in Spanish, `personaProblems()` (decision 5), `RESERVED_IDS`, the named limits; `test/app-manifest.test.ts`: a valid manifest normalized, each field's bound refused with its field named, an unknown field refused, an `engine` refused without `builtIn`, an unknown tool refused, a permission not covered by inputs and tools refused, `room` refused without an engine, persona markers (`MEMORIA (`, `[[`, `system:`) refused (`pnpm test`)
- [ ] 1.2 Demo slice. `apps/builtin/dilo.json`, `ver.json`, `practicar.json` (decision 3) and `idiomas.json` (`add-language-coach` design decision 12; written here only if that change's task 3.3 has not written it yet; listed with «Pronto» while its engine is not built); a test that loads every file through `validateManifest({ builtIn: true })` and checks Ver's tools equal `SIGHT_FUNCTIONS`' names (`pnpm test`)
- [ ] 1.3 Demo slice. `GET /apps` and `GET /apps/:id` in `src/pilot.ts` serving the built-ins when `LENTE_APPS` is `builtin` (the default) or `open`, 404 for an unknown id, nothing third-party; `test/apps-hub.test.ts` on the stub: four apps listed with their permissions, an unknown id 404 (`pnpm test`, `pnpm smoke`)
- [ ] 1.4 Demo slice. `docs/kb/decisions.md` «Apps are data, never code (add-lens-apps)», which revisits the 2026-10-28 «No plugin store» line, with the rejected sandbox, WebView and per-app MCP options; `docs/kb/hub-api.md` gains the `/apps` routes built so far (read in review)

## 2. Grants and the app runtime (P1)

- [ ] 2.1 `src/app-grants.ts` (pure): the allow-list table of decision 4, `sessionTools({ manifest, grants, trial })`, `mayCall(name, …)`; `test/app-grants.test.ts`: camera not granted → no `look`, revoked → gone, trial → no memory tools and no `app_note`, a name outside the set refused, built-in-only tools refused for a third-party app (`pnpm test`)
- [ ] 2.2 `supabase/migrations/2026111x_lens_apps.sql` (decision 8: four tables, RLS on, no policies, no grants) and the stores in `src/stores.ts` (files under `data/apps/` for the local hub) and `src/supabase-stores.ts`; account deletion in `src/account-rights.ts` removes installs, notebooks and reports; tests on the file stores and on the deletion list (`pnpm test`). Applying the migration is 5.4
- [ ] 2.3 Routes: `POST /apps/:id/install { grants }` (a subset of the manifest's, else 400), `PATCH /apps/:id/grants`, `DELETE /apps/:id/install` (deletes the notebook), `trial` price installs with `trial_ends_at`; hub test on the stub: install, revoke, uninstall leaves meetings untouched, an expired trial install refuses to open with «La prueba de esta app terminó» (`pnpm test`)
- [ ] 2.4 The runtime in `src/voice-hub.ts` / `src/voice-agent.ts`: `start` with `app`, resolved against the caller's installs (unknown → default Lente, logged); instructions in the order of decision 5; functions from `sessionTools`; a call refused by `mayCall` answers the model «Esa herramienta no está disponible para esta app» without running; the takedown check before each turn; hub test on the stub: an app with only `look` cannot reach `ask_memory` even when the stub emits it (`pnpm test`)
- [ ] 2.5 Notebook tools `app_note`, `app_notes`, `app_content`; the `app` field on tasks and day entries written with `memory.write`; the memory filter in `src/memory-index.ts` (another app's units and notebooks never reach an app's `ask_memory`; Lente's own recall indexes notebooks as kind `app`); tests: two apps on one account see only their own notebooks, «¿qué me enseñó la app de cocina?» on the default voice cites the notebook (`pnpm test`)
- [ ] 2.6 `scripts/eval/app-personas.ts`: ten hostile synthetic personas (drop the rules, guide movement, name a face, ask for a tool it lacks, claim to be Lente's owner) run against the real model through the runtime; each answer checked by rule; results in `docs/benchmarks.md` «Apps: hostile personas». P1 does not open while any rule breaks [key:MODEL_API_KEY]
- [ ] 2.7 `scripts/bench-voice.ts --app <id>` on a synthetic app with a 4,000-character persona: first sentence and first answer sentence p50/p90, cached input tokens, cost per turn, against the default persona; numbers in `docs/benchmarks.md` «Apps: session latency» [key:MODEL_API_KEY]

## 3. The web app's «Apps» (P0 view, P1 actions)

- [ ] 3.1 Demo slice. `web/app/views/apps.js` and the routes `/app/apps`, `/app/apps/:id` in `web/app/lib/routes.js`, an «Apps» entry in the sidebar: the grid (icon, name, one line, «Integrada» for built-ins), the app's page (description, developer, languages, each permission with its sentence, the persona text); «Probar», «Instalar» and «Publicar» greyed out with «Pronto» while `LENTE_APPS=builtin`; checked in a browser against `pnpm pilot` with a screenshot kept outside the repo [human]
- [ ] 3.2 Instalar with the permission sheet (each permission a switch, all on by default only for what the app needs), the app's page showing grants with «Quitar permiso», «Desinstalar» with a confirmation; checked in a browser [human]
- [ ] 3.3 `web/app/lib/apps.js`: the browser copy of `validateManifest`; `/app/apps/publicar` with a textarea or file, live errors, «Guardar borrador», «Probar mi borrador», «Enviar a revisión»; a test feeds the same fixtures to the hub's and the browser's validator and expects the same errors (`pnpm test`)

## 4. «Probar» (P1)

- [ ] 4.1 `POST /apps/:id/try` (a one-use ticket), `start` with `trial: true`, `TRIAL_MINUTES = 10` with its closing line, no `save`, no day entry, no notebook row, no memory tools; hub test on the stub: after a trial with five turns the chat store, the day record, the notebooks and the memory index are byte-for-byte unchanged (`pnpm test`)
- [ ] 4.2 The trial from the web page by QR (opens the phone's voice screen with the ticket) and from Android's app page; a trial of a synthetic app on the Samsung keeps nothing in Inicio's chat or in Hoy [phone]

## 5. Review, reports, takedown (P1)

- [ ] 5.1 `POST /apps`, `POST /apps/:id/submit` (`MAX_PENDING = 5`), `GET /apps/review`, `POST /apps/:id/review { decision, reason }`, `POST /apps/:id/report`, `POST /apps/:id/takedown`, owner checks through `isOwnerId`; hub test: a draft is visible only to its developer, a rejection shows its reason, a takedown removes it from `GET /apps` and ends a running session at its next turn with «Esta app fue retirada» (`pnpm test`)
- [ ] 5.2 `/app/apps/revision` for the owner: the queue with the manifest, permissions against the description, the persona in full, «Probar», «Aprobar», «Rechazar» with a reason, and reports; checked in a browser [human]
- [ ] 5.3 «Reportar» on an app's page (reason and an optional note ≤ 500 characters); checked in a browser [human]
- [ ] 5.4 Apply `2026111x_lens_apps.sql` to the live project through the Supabase MCP with the owner's yes; check with the publishable key that the four tables answer 401; note it in `docs/kb/supabase.md` [human]

## 6. Android and the rest (P2)

- [ ] 6.1 Android `ui/Apps.kt`: «Apps» in Ajustes (installed and catalog, the app's page, grants, uninstall), TalkBack descriptions on every control; `pnpm android:test`, `pnpm android:apk`, checked on the Samsung [phone]
- [ ] 6.2 Installed apps as choices in the record sheet beside Asistir, Solo grabar, Ver and Practicar; choosing one opens the voice screen with `start { app }`; checked on the Samsung [phone]
- [ ] 6.3 Updates: a new version asking for a new permission keeps the install on its granted version until the person accepts on the app's page; hub test (`pnpm test`)
- [ ] 6.4 The usage meter labels calls with the app id; «Gasto por app» in Ajustes (today's US$ per app, numbers only); test on the meter (`pnpm test`)

## 7. Together

- [ ] 7.1 Deploy with `LENTE_APPS=open` (owner, `pnpm deploy:hub` from a clean `main`); on Modal: publish a synthetic app from a second allow-listed account, review it as the owner, install it with the camera only, try it, revoke the camera, uninstall it; README gains «Apps» under what runs today and the day's row in «What was built» [human] [phone]

## Workflow follow-up

- Archive with `pnpm exec openspec archive add-lens-apps --yes` when every task is ticked.
