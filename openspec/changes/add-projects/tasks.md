# Tasks

Depends on: `add-accounts`

## 1. Projects in the hub

- [x] 1.1 `src/projects.ts`: assignment messages and schema, validation (unknown id, duplicate name, trimming), and the per-project summary; tests (`pnpm test`)
- [x] 1.2 Project store: interface, file implementation, Supabase implementation and migration (`projects`, `meeting_projects`, RLS, revoked); schema test and fake PostgREST tests (`pnpm test`)
- [x] 1.3 The assignment after a meeting's notes, `GET /projects`, `GET /projects/get?id=`, `POST /projects/rename|merge|archive|restore`, `POST /meetings/project`; tests against the hub (`pnpm test`, `pnpm smoke`)
  - `test/projects-hub.test.ts` drives every route on a laptop hub seeded through the file stores. The assignment after the notes is one guarded call (a failure only logs); its parsing is covered in `test/projects.test.ts`.
- [ ] 1.4 `scripts/assign-projects.ts --email [--dry-run]`; test against the fake PostgREST (`pnpm test`)

## 2. The app

- [ ] 2.1 `core/Projects.kt` parsing and words; unit tests (`./gradlew :app:testDebugUnitTest`)
- [ ] 2.2 Inicio redesigned and the projects screen; on the phone, a screenshot of Inicio with projects [phone]

## 3. On the owner's data

- [ ] 3.1 Migration applied and the backfill run by the owner; the projects on Inicio look right to him [human]
