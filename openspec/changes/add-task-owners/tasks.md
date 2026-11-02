# Tasks

Depends on: `add-projects`

## 1. Tasks with owners

- [x] 1.1 `src/task-extract.ts`: messages, schema and validation; `who` on `Task` with `me` as the default for old tasks; tests (`pnpm test`)
- [x] 1.2 Stores: `update` and `remove` on the file, cached and Supabase task stores; tests (`pnpm test`)
- [ ] 1.3 Extraction after a meeting's notes; `POST /tasks/add|update|delete`; the actions event with `who`, `otherName` and `projectName`; project counts without `other`; tests on the hub (`pnpm test`, `pnpm smoke`)
- [ ] 1.4 `scripts/extract-tasks.ts --email [--days] [--dry-run]`; test against the fake PostgREST (`pnpm test`)
- [ ] 1.5 Tareas on the phone grouped by owner, with add, reassign, done and delete; unit tests (`./gradlew :app:testDebugUnitTest`) and a screenshot [phone]
- [ ] 1.6 The owner runs the backfill; tasks appear on Tareas and the project cards [human]

## 2. Lente does it

- [ ] 2.1 "Que lo haga Lente" on a `lente` task asks the closing agent for the draft or reminder, which waits for approval in "Por aprobar"
