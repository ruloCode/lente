# Design

## Decisions

1. **A project is a name and a status; meetings point to it.**
   - Tables: `projects` (`id`, `user_id`, `name_enc`, `status` `active` or `archived`, `created_at`) and `meeting_projects` (`meeting_id` primary key, `user_id`, `project_id`). Both sit under the same isolation rules as every table.
   - Tasks and facts belong to a project through their meeting, so neither table changes.
   - The file backend (laptop hub) keeps the same in `data/projects.json`.
2. **Assignment is one structured call per meeting, after its notes.**
   - Input: the active project names with short ids (`P1`…), and the meeting's title, topic and note summary.
   - Output: `{ "choice": "existing" | "new" | "none", "project": "P3" | "", "name": "…" }`.
   - Validation:
     - An unknown id becomes `none`.
     - A new name equal to an existing name (case and accents ignored) becomes that project.
     - Names are trimmed to 40 characters.
     - A failure leaves the meeting unassigned; it never blocks the notes.
3. **The project summary is computed, not stored.** `GET /projects` derives each active project from the stored data:
   - `lastActivityAt`: the newest meeting.
   - `meetings`, and `meetingsThisWeek`.
   - `openTasks`, and `next`: the oldest open task.

   Projects are sorted by last activity. Merge moves every assignment to the target and archives the source.
4. **Backfill.** `scripts/assign-projects.ts --email` assigns unassigned meetings oldest first, so later meetings see the projects earlier ones opened. It prints counts only, and the owner runs it, as with the hermes import.
5. **Inicio without a conversation:**
   - the greeting, without the large mark;
   - up to three project cards;
   - "Ver los N proyectos";
   - then, above the ask bar, the chips "Resumen de hoy", "¿Qué me falta?" and, with a clip, "Mirar".

   With a conversation, Inicio is the conversation, as now. The Inicio/Tareas/Hoy titles stay; they are navigation, not clutter.

## Risks

- A wrong assignment: the meeting detail shows its project and lets the user change it.
- Too many tiny projects: the prompt asks for projects that last weeks, not one-off topics. Merge exists for the rest.
