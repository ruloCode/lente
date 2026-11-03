# Tasks

Depends on: `add-projects`

## 1. Record sheet and chat scope

- [x] 1.1 Hub: `project` on `POST /meeting/start` (assigned at start, skipped by the automatic assignment) and on `POST /ask` (`scopeMeetings`); tests (`pnpm test`, `pnpm smoke`)
- [x] 1.2 App: `CaptureService.start(camera)`, the record sheet with the phone as default device, and the chat's scope chip; unit tests (`./gradlew :app:testDebugUnitTest`)
- [x] 1.3 On the phone: record into a project with the clip off, and ask within a project [phone]
  - 2026-11-02: installed on the owner's Samsung; screenshots show the sheet ("El clip no está conectado: grabará el teléfono", Solo micrófono / Micrófono y cámara, title, "Empezar a grabar" above the project list) and the "Toda mi memoria" chip on Inicio. Recording itself was not started by the agent (it would capture real audio); the owner runs that step.
  - 2026-11-02, night, with the owner's approval: the `integrate/2026-11` debug build on the Samsung against the stub hub of `pnpm android:e2e --no-build --serve` (stubbed Meta API, scratch data deleted afterwards), the fake clip stopped so the app showed «Sin clip». One synthetic project, `PROBE-Lanzamiento`, was created in the scratch data, since the stub does not assign projects.
    - Record: the sheet said «Grabará el teléfono.», with Solo micrófono, title `PROBE-1` and `PROBE-Lanzamiento` ticked; «Empezar a grabar» opened meeting `PROBE-1` with `device: phone`, `GET /projects/assignments` mapped it to the project at once, and Inicio showed «PROBE-Lanzamiento · 1 reunión esta semana». The only turn was the stub's scripted line.
    - Ask: the scope chip set to `PROBE-Lanzamiento`, a typed question got an answer with a «Recuerdo» source. The hub's log was not captured in this mode, so the scope is seen on the chip, not in the request body.
