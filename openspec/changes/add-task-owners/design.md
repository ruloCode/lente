# Design

## Decisions

1. **Fields inside the sealed body.** `Task` gains:
   - `who`: `me`, `lente` or `other`; tasks stored before this change read as `me`.
   - `otherName`: who promised it, when `who` is `other`.
   - `source`: `meeting`, `manual` or `agent`.

   The tasks table does not change. A manual task has no meeting (`meetingId` empty, `meeting_id` null).
2. **Extraction** (`src/task-extract.ts`, pure):
   - Input: the meeting's title, summary, decisions and commitments, each commitment with its owner as the notes name it.
   - Output: up to 8 items, each `{ title, who, other, due }`.
   - The prompt says what Lente can do (its three tools plus answers from the memory). Anything else the wearer must do is `me`.
   - Validation trims titles to 140 characters, drops empty and duplicate titles (against each other and the meeting's existing tasks), and turns an unknown `who` into `me`.
3. **After a live meeting**, extraction runs after the notes and the project assignment. A failure only logs.
4. **Routes:**
   - `POST /tasks/add` `{ title, who, due? }`;
   - `POST /tasks/update` `{ id, who?, title? }`;
   - `POST /tasks/delete` `{ id }`;
   - `POST /tasks/done` is unchanged.

   The actions event carries `who`, `otherName` and `projectName` per task.
5. **Backfill** walks done meetings with no task, newest first, within `--days`. It prints counts only.

## Risks

- Too many trivial tasks: the cap is 8 per meeting, and the prompt asks for concrete, actionable items only.
- `lente` over-claimed: the prompt lists exactly what Lente can do, and the wearer can change it with one tap.
