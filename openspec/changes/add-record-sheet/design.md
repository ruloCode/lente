# Design

## Decisions

1. **The phone is the default device when the clip is absent.** The sheet decides at the moment "Grabar" is tapped. It asks for the microphone (and the camera if chosen), then starts `CaptureService`; then it starts the meeting and listening.
2. **Camera is a choice, not a permission side effect.** `CaptureService.start` takes `camera: Boolean`. Without it the phone says `camera: false` in its hello, so "Mirar" is disabled, as with a clip without a camera.
3. **A project chosen at start wins.** The hub assigns the meeting when it opens. `assignProject` skips a meeting that already has a project.
4. **Scope by meetings.** `scopeMeetings(meetings, assignments, project)` (pure) is applied to every meeting loader of both ask paths: recent meetings, by id, by date. Digests and the profile stay whole, since they are context. The question is prefixed with the project's name, so the plan step looks there.
