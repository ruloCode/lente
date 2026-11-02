// @ts-check
// Tareas: open tasks grouped by who does them or by project, the filters, and what a project card
// counts. Tasks arrive in the hub's `actions` event with `who`, `otherName` and `projectName`.

import { OWNERS, OWNER_GROUP } from "./words.js";

/** @typedef {{ id: string, title: string, who?: string, otherName?: string, done?: boolean, createdAt?: number, due?: string, meetingId?: string, meetingTitle?: string, projectName?: string }} Task */

/** The project name shown for tasks without one. */
export const NO_PROJECT = "Sin proyecto";

/** Owner as stored, with old tasks read as the wearer's. */
export const ownerOf = (/** @type {Task} */ t) => (OWNERS.includes(/** @type {any} */ (t.who)) ? /** @type {"me"|"lente"|"other"} */ (t.who) : "me");

const newestFirst = (/** @type {Task} */ a, /** @type {Task} */ b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

/** Open tasks that pass the filters; `project` is a project name or NO_PROJECT, `owner` one of OWNERS. */
export function filterTasks(/** @type {Task[]} */ tasks, /** @type {{ project?: string, owner?: string }} */ f = {}) {
  return tasks.filter((t) => (!f.project || (t.projectName || NO_PROJECT) === f.project) && (!f.owner || ownerOf(t) === f.owner));
}

/** «Te toca», «Lente puede hacerlo», «Esperando a otros», in that order, without empty groups. */
export function groupByOwner(/** @type {Task[]} */ tasks) {
  const open = tasks.filter((t) => !t.done);
  return OWNERS.map((key) => ({ key, label: OWNER_GROUP[key], tasks: open.filter((t) => ownerOf(t) === key).sort(newestFirst) })).filter((g) => g.tasks.length);
}

/** One group per project, the most recent task's project first, "Sin proyecto" last. */
export function groupByProject(/** @type {Task[]} */ tasks) {
  /** @type {Map<string, Task[]>} */
  const groups = new Map();
  for (const t of tasks.filter((x) => !x.done).sort(newestFirst)) {
    const key = t.projectName || NO_PROJECT;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups].sort(([a], [b]) => Number(a === NO_PROJECT) - Number(b === NO_PROJECT)).map(([key, list]) => ({ key, label: key, tasks: list }));
}

/** The project names that have open tasks, for the filter, alphabetical, "Sin proyecto" last. */
export function projectNames(/** @type {Task[]} */ tasks) {
  const names = [...new Set(tasks.filter((t) => !t.done).map((t) => t.projectName || NO_PROJECT))];
  return names.sort((a, b) => Number(a === NO_PROJECT) - Number(b === NO_PROJECT) || a.localeCompare(b, "es"));
}

/** Done tasks, newest first. */
export const doneTasks = (/** @type {Task[]} */ tasks) => tasks.filter((t) => t.done).sort(newestFirst);

/** The next owner when the wearer taps the tag: Tú → Lente → Otra persona → Tú. */
export function nextOwner(/** @type {string | undefined} */ who) {
  const i = OWNERS.indexOf(/** @type {any} */ (who ?? "me"));
  return OWNERS[(i + 1) % OWNERS.length];
}
