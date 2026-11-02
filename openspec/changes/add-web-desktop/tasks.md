# Tasks

Depends on: `add-accounts`, `add-projects`, `add-task-owners`, `add-record-sheet`

## 1. Skeleton

- [x] 1.1 `src/web-app.ts`: the app's paths (static files under `web/app/` only, the shell for client routes), the theme sheet with light and dark overrides, the generated capture and transcript modules, the safe return path, the session answer; `decideWeb` answers `app` for `/app`; tests (`pnpm test`)
- [x] 1.2 The hub serves `/app` with a strict CSP, `GET /app/session`, `GET /tasks`, `GET /day`, `GET /projects/assignments`, `GET /memory/profile`, and `/auth/google?next=/app`; an integration test on a laptop hub seeded through the file stores (`pnpm test`, `pnpm smoke`)
  - `test/web-app-hub.test.ts`. The return path after Google is unit-tested (`safeNext`); the redirect itself is checked against the Modal hub in 6.3.
- [x] 1.3 Pure web modules with tests: event reducer, backoff, routes, format and words (`pnpm test`)
- [x] 1.4 The shell: router, store on one SSE stream with "Reconectando…", the three-zone layout, the theme (Sistema, Claro, Oscuro) and the sign-in screen (add-accounts 8.1); screenshots in both themes at 1440 and 1024 px
  - 2026-11-02, Chrome against a laptop hub on synthetic data (screenshots in the scratchpad, not the repo): Inicio, Tareas, Reuniones and Memoria in dark at 1440; Ajustes → Claro, then Inicio and a meeting in light; Tareas and a meeting at 1024. Below 1280 px the side columns narrow and Reuniones shows one pane at a time while the chat is open.

## 2. Inicio, the chat and Grabar

- [x] 2.1 Inicio: greeting, project cards, "Ver los N proyectos", the DILO card, the live transcript bar while recording; screenshots
- [x] 2.2 The chat panel: scope chip, suggestions, answers with source chips that open the meeting at the turn, "Nueva conversación", dictation when the browser has it; checked against the hub with the stubbed Meta API
  - 2026-11-02: «Resumen de hoy» got the stub's answer with a «Recuerdo» chip in 0.0 s (stub). Dictation shows only where the browser has speech recognition.
- [x] 2.3 Grabar: project, title, source and device; capture from this computer through the `/desktop` pipeline; the red bar with time, Pausar and Terminar; checked with the stubbed hub
  - 2026-11-02, with `scripts/fake-clip.ts` on a laptop hub and the stubbed Meta API: R opened Grabar, the clip was the default device, the meeting opened in the chosen project (its card went to 2 meetings this week), the live transcript showed the partial then the turn, «Pregunta» gave a help card, Pausar stopped the clock (Reanudar), and Terminar ended it on the second click. In the page, the generated pipeline resampled 4,800 samples at 48 kHz to 1,600 at 16 kHz and framed them.
- [ ] 2.4 Grabar with this computer's microphone, camera and a Meet tab: the browser's permission prompts and a real source [human]

## 3. Tareas and Proyectos

- [x] 3.1 Task grouping and filters as pure code with tests (`pnpm test`)
- [x] 3.2 Tareas: by owner or project, filters, add with owner, reassign, done and delete with undo, "Por aprobar" with previews, approve and reject, "Hechas" folded; screenshots
  - 2026-11-02 on the synthetic hub: added «PROBE Tarea desde la web», moved it Tú → Lente, deleted it and pressed «Deshacer» (it stayed on the hub), opened the email proposal (editable subject and body, its two quotes) and approved it, then grouped by project.
- [x] 3.3 Proyectos: active and archived, detail with tasks and meetings, rename, merge, archive and restore; screenshots
  - 2026-11-02: renamed a project, merged it into another (it went to «Archivados»).

## 4. Reuniones, Memoria and Hoy

- [x] 4.1 Reuniones: by date with search, detail with notes, transcript with speakers, editable project, share and delete, the "Importada" mark; screenshots
  - 2026-11-02: searched «proveedor», opened the result at its turn (highlighted), the project picker showed the meeting's project, and deleted the recorded demo meeting after the confirmation. The search now survives opening a result.
- [x] 4.2 Memoria: facts to review and kept, keep and discard, "Revisar uno por uno", the glossary, the profile; screenshots
  - 2026-11-02: «Revisar uno por uno» kept one fact and discarded the other; `/facts` on the hub agreed.
- [x] 4.3 Hoy: today's line with what was heard, seen and the cards; screenshots
  - 2026-11-02: the seeded day plus the live turn and help card, with the filters and today's listening time and spend.

## 5. Dispositivos, Ajustes, shortcuts and notifications

- [ ] 5.1 Dispositivos: clip state, tokens created once and revoked (accounts), "Usar esta computadora"; Ajustes: name, mode, voice, every question, theme, account with spend, export, delete with typed confirmation, sign out; screenshots
- [ ] 5.2 Shortcuts (⌘K search, ⌘J chat, R, Esc, "?") as a pure table with tests; notifications by opt-in for DILO and approvals in the background

## 6. Polish

- [ ] 6.1 Keyboard and screen reader pass: focus order, visible focus, roles and labels, contrast of the app's own pairs (`pnpm test`)
- [ ] 6.2 Empty, loading and error states on every screen; responsive at 1024 px with the chat as a sheet; screenshots of each screen in both themes at 1440 and 1024 px
- [ ] 6.3 Against the Modal hub with accounts: sign in with Google and use the app [human]
- [ ] 6.4 README "What was built during the hackathon" row; `docs/kb/decisions.md` entry for the web app without a build
