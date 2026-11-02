# Tasks

Depends on: `add-accounts`

## 1. Projects in the hub

- [x] 1.1 `src/projects.ts`: assignment messages and schema, validation (unknown id, duplicate name, trimming), and the per-project summary; tests (`pnpm test`)
- [x] 1.2 Project store: interface, file implementation, Supabase implementation and migration (`projects`, `meeting_projects`, RLS, revoked); schema test and fake PostgREST tests (`pnpm test`)
- [x] 1.3 The assignment after a meeting's notes, `GET /projects`, `GET /projects/get?id=`, `POST /projects/rename|merge|archive|restore`, `POST /meetings/project`; tests against the hub (`pnpm test`, `pnpm smoke`)
  - `test/projects-hub.test.ts` drives every route on a laptop hub seeded through the file stores. The assignment after the notes is one guarded call (a failure only logs); its parsing is covered in `test/projects.test.ts`.
- [x] 1.4 `scripts/assign-projects.ts --email [--dry-run]`; test against the fake PostgREST (`pnpm test`)

## 2. The app

- [x] 2.1 `core/Projects.kt` parsing and words; unit tests (`./gradlew :app:testDebugUnitTest`)
- [x] 2.2 Inicio redesigned and the projects screen; on the phone, a screenshot of Inicio with projects [phone]
  - 2026-11-02 built and installed on the owner's Samsung against this branch's hub.
  - The top row is now the device pill, Ajustes and the menu.
  - The greeting no longer has the mark, the waiting note and the phone button are gone, and the option cards became the chips "Resumen de hoy" and "¿Qué me falta?" ("Mirar" appears with a clip).
  - Proyectos is in the menu. `scripts/android-e2e.ts` now reaches "Usar el teléfono" through Dispositivos.
  - After the backfill, the screenshot shows the three most recently active projects with their last activity and this week's meetings, and "Ver los 17 proyectos".

## 3. On the owner's data

- [ ] 3.1 Migration applied and the backfill run by the owner; the projects on Inicio look right to him [human]
  - 2026-11-02:
    - Migration `projects` applied through the MCP.
    - The owner's backfill assigned 90 of 119 meetings to 17 new projects and left 29 out.
    - Left: the owner's review (rename or merge any project that came out wrong).
