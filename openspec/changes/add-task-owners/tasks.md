# Tasks

Depends on: `add-projects`

## 1. Tasks with owners

- [x] 1.1 `src/task-extract.ts`: messages, schema and validation; `who` on `Task` with `me` as the default for old tasks; tests (`pnpm test`)
- [x] 1.2 Stores: `update` and `remove` on the file, cached and Supabase task stores; tests (`pnpm test`)
- [x] 1.3 Extraction after a meeting's notes; `POST /tasks/add|update|delete`; the actions event with `who`, `otherName` and `projectName`; project counts without `other`; tests on the hub (`pnpm test`, `pnpm smoke`)
- [x] 1.4 `scripts/extract-tasks.ts --email [--days] [--dry-run]`; test against the fake PostgREST (`pnpm test`)
  - 2026-11-02 dry run on the owner's account: 38 meetings in the last 30 days, all without tasks.
- [x] 1.5 Tareas on the phone grouped by owner, with add, reassign, done and delete; unit tests (`./gradlew :app:testDebugUnitTest`) and a screenshot [phone]
  - 2026-11-02 built: `core/TaskOwners.kt`, Tareas with a new-task card (owner picker), groups "Te toca", "Lente puede hacerlo" and "Esperando a otros", the project and meeting under each task, a tag that cycles the owner, and delete. 76 of 76 Android unit tests pass. The screenshot after the backfill shows "Te toca" with 54 tasks, each with its project, meeting and due date, the owner tag and delete.
- [x] 1.6 The owner runs the backfill; tasks appear on Tareas and the project cards [human]
  - 2026-11-02: the owner's run read 38 meetings from the last 30 days and wrote 139 tasks: 54 his, 5 for Lente, 80 waiting on others.
  - Seen on the phone: some tasks the model gave the wearer name him in the third person ("Incluir a Rulo…").
  - Fix: pass the wearer's names into the extraction, so the model knows who "el usuario" is.

## 2. Lente does it

- [ ] 2.1 "Que lo haga Lente" on a `lente` task asks the closing agent for the draft or reminder, which waits for approval in "Por aprobar"
