# Proposal

Depends on: `add-accounts`

## Why

The home screen stacks seven blocks: the device pill with four round icons, the Inicio/Tareas/Hoy titles, a waiting-for-the-clip note, a "Usar el teléfono" button, a large greeting with the mark, six option cards, and the ask bar. The owner finds it crowded. What he wants to see first is the projects he is working on, and Lente has no notion of a project: each meeting only carries a generic topic ("Proyecto", "Cliente").

## What Changes

- **Projects, detected by Lente.** After a meeting's notes, Muse Spark assigns the meeting to one of the user's projects by name, or opens a new one, or none. A project gathers its meetings, and through them its tasks and facts. The user can rename, merge and archive projects. A one-time script assigns the meetings that already exist, including the ones imported from hermes.
- **A calmer home, projects first.**
  - The top row keeps the device pill, Ajustes and the menu; Reuniones and Memoria stay one tap away in the menu.
  - Inicio, before a conversation starts, shows a short greeting and up to three active projects. Each card shows the last activity, the open tasks, the meetings this week and the next task. Below the cards, "Ver los N proyectos".
  - The six option cards become a row of small chips above the ask bar.
  - The device pill already says when there is no clip and opens Dispositivos, where "Usar el teléfono" lives, so the separate waiting note and button leave Inicio.
- **A projects screen.** All projects, active first, each opening its meetings and open tasks, with rename, merge and archive.

Out of scope: projects shared with other people, due dates per project, projects on the web page.

Meta models: Muse Spark 1.3 with structured output assigns each meeting. It reads only the meeting's title, topic and note summary, and the list of project names.

Privacy: project names are sealed like every other text. An assignment is a link between ids.

## Capabilities

### New Capabilities
- `projects`: projects detected from meetings, and their place on the home screen.

## Impact

- Hub:
  - `src/projects.ts`: pure assignment, validation and the per-project summary.
  - A project store with a file implementation and a Supabase implementation.
  - Migration `projects` and `meeting_projects`.
  - Routes `/projects…`.
  - The assignment after the notes.
  - `scripts/assign-projects.ts`.
- Android:
  - `core/Projects.kt`.
  - `ui/Home.kt` with Inicio redesigned.
  - A projects screen.
