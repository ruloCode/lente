# Proposal

Depends on: `add-projects`

## Why

The owner wants Inicio to feel closer to what he likes in Omi's app: one place to talk to Lente and to start recording. Today the round button only toggles listening; it records into no project, uses only the clip, and does nothing useful when the clip is not connected. The chat always asks the whole memory.

## What Changes

- **A record sheet.** The round button opens a sheet before recording starts:
  - **The project**: any active project, or "Que Lente decida", which keeps the automatic assignment.
  - **What to capture**: "Solo micrófono" or "Micrófono y cámara".
  - **Which device**: the clip when it is connected; otherwise the phone, chosen by default and said plainly ("El clip no está conectado: grabará el teléfono").
  - An optional title.

  "Grabar" starts the phone capture if needed, opens a meeting in that project, and starts listening. While recording, the same button pauses, as now.
- **Chat options.** A scope chip above the field: "Toda mi memoria" or one project. Asking within a project answers only from that project's meetings, and the chip shows the scope. "Nueva conversación" stays.
- **Hub.**
  - `POST /meeting/start` takes an optional `project`; the meeting is assigned to it at start, and the automatic assignment skips meetings that already have a project.
  - `POST /ask` takes an optional `project` and limits the meetings it can open to that project's.

Out of scope: video recording; the camera stays stills on request, as with the clip.

## Capabilities

### New Capabilities
- `record-sheet`: choosing the project, the capture and the device before recording, and the chat's scope.
