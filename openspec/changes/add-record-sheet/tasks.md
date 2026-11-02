# Tasks

Depends on: `add-projects`

## 1. Record sheet and chat scope

- [x] 1.1 Hub: `project` on `POST /meeting/start` (assigned at start, skipped by the automatic assignment) and on `POST /ask` (`scopeMeetings`); tests (`pnpm test`, `pnpm smoke`)
- [ ] 1.2 App: `CaptureService.start(camera)`, the record sheet with the phone as default device, and the chat's scope chip; unit tests (`./gradlew :app:testDebugUnitTest`)
- [ ] 1.3 On the phone: record into a project with the clip off, and ask within a project [phone]
