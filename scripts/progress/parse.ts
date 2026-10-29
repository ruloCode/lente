// Pure parsing for the progress dashboard: OpenSpec tasks.md and proposals in, a plain
// snapshot out. No files here; scripts/progress/serve.ts reads them and calls these.

export type Task = { id: string; text: string; done: boolean; tags: string[] };
export type TaskGroup = { title: string; tasks: Task[] };
export type Change = {
  name: string;
  archived: boolean;
  archivedOn?: string;
  why: string;
  dependsOn: string[];
  groups: TaskGroup[];
  done: number;
  total: number;
};

const GROUP_RE = /^##\s+(.+?)\s*$/;
const TASK_RE = /^\s*- \[([ xX])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
const TAG_RE = /\s*\[(hw|phone|human|key:[A-Z0-9_]+)\]/g;
const DEPENDS_RE = /^Depends on:(.*)$/m;
const ARCHIVE_DIR_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const WHY_MAX_CHARS = 220;

/** Groups (`## 1. Title`) with their checkbox tasks; tasks before any heading land in "Tasks". */
export function parseTasks(md: string): TaskGroup[] {
  const groups: TaskGroup[] = [];
  for (const line of md.split("\n")) {
    const g = GROUP_RE.exec(line);
    if (g) {
      groups.push({ title: g[1].replace(/^\d+\.\s*/, ""), tasks: [] });
      continue;
    }
    const t = TASK_RE.exec(line);
    if (!t) continue;
    if (groups.length === 0) groups.push({ title: "Tasks", tasks: [] });
    const group = groups[groups.length - 1];
    const tags = [...t[3].matchAll(TAG_RE)].map((m) => m[1]);
    group.tasks.push({ id: t[2] ?? String(group.tasks.length + 1), text: t[3].replace(TAG_RE, "").trim(), done: t[1] !== " ", tags });
  }
  return groups.filter((g) => g.tasks.length > 0);
}

/** First paragraph under `## Why`, trimmed to one readable line. */
export function parseWhy(md: string): string {
  const after = md.split(/^##\s+Why\s*$/m)[1];
  if (!after) return "";
  const para = after.trim().split(/\n\s*\n|\n##/)[0].replace(/\s+/g, " ").trim();
  return para.length > WHY_MAX_CHARS ? `${para.slice(0, WHY_MAX_CHARS - 1).trimEnd()}…` : para;
}

/** `2026-10-28-add-meeting-memory` → its date and change name; null for anything else. */
export function parseArchiveDir(dir: string): { on: string; name: string } | null {
  const m = ARCHIVE_DIR_RE.exec(dir);
  return m ? { on: m[1], name: m[2] } : null;
}

/** `Depends on: \`add-phone-capture\`` in tasks.md: changes whose automatable work must land first. */
export function parseDependsOn(tasksMd: string): string[] {
  const line = DEPENDS_RE.exec(tasksMd)?.[1] ?? "";
  return [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
}

export function makeChange(name: string, tasksMd: string, proposalMd: string, archivedOn?: string): Change {
  const groups = parseTasks(tasksMd);
  const all = groups.flatMap((g) => g.tasks);
  return {
    name,
    archived: archivedOn !== undefined,
    archivedOn,
    why: parseWhy(proposalMd),
    dependsOn: parseDependsOn(tasksMd),
    groups,
    done: all.filter((t) => t.done).length,
    total: all.length,
  };
}

/** Change names in the order the "Build order" line of CLAUDE.md mentions them. */
export function parseBuildOrder(claudeMd: string, known: Set<string>): string[] {
  const line = claudeMd.split("\n").find((l) => l.startsWith("Build order"));
  if (!line) return [];
  const names = [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]).filter((n) => known.has(n));
  return [...new Set(names)];
}

/** Archived first by date, then the build order, then anything the order forgot, by name. */
export function orderChanges(changes: Change[], buildOrder: string[]): Change[] {
  const rank = (c: Change) => {
    const i = buildOrder.indexOf(c.name);
    return i === -1 ? buildOrder.length : i;
  };
  return [...changes].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? -1 : 1;
    if (a.archived) return (a.archivedOn ?? "").localeCompare(b.archivedOn ?? "");
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

/** The first open task in build order: what the next session should pick up. */
export function nextTask(ordered: Change[]): { change: string; group: string; task: Task } | null {
  for (const c of ordered) {
    if (c.archived) continue;
    for (const g of c.groups) {
      const task = g.tasks.find((t) => !t.done);
      if (task) return { change: c.name, group: g.title, task };
    }
  }
  return null;
}

/** What the auto lane can reach right now: the clip board, the phone, and which keys are set. */
/** `keysOff`: the auto lane spends no model credit, so every task that needs a key waits for the human. */
export type Bench = { board: boolean; phone: boolean; keys: Set<string>; keysOff?: boolean };
export type Held = { change: string; id: string; text: string; reason: string };
export type Node = { change: string; group: string; tasks: Task[]; held: Held[] };

/** Why an open task can't run unattended on this bench, or null when it can. */
export function holdReason(task: Task, bench: Bench): string | null {
  for (const tag of task.tags) {
    if (tag === "human") return "needs a person";
    if (tag === "hw" && !bench.board) return "clip board not connected";
    if (tag === "phone" && !bench.phone) return "phone not connected";
    if (tag.startsWith("key:") && bench.keysOff) return `needs a real run with ${tag.slice(4)} (the lane spends no model or cloud credit)`;
    if (tag.startsWith("key:") && !bench.keys.has(tag.slice(4))) return `${tag.slice(4)} not set`;
  }
  return null;
}

/** Done as far as dependents care: archived, or nothing left that a machine could do. */
function settled(c: Change): boolean {
  return c.archived || c.groups.every((g) => g.tasks.every((t) => t.done || t.tags.includes("human")));
}

/**
 * Work the auto lane can pick up, in build order: per change whose dependencies are settled,
 * the first group with an open task this bench can run. Names in `skip` (`change/group`) are
 * left out, so a node that failed this run isn't retried in a loop.
 */
export function readyNodes(ordered: Change[], bench: Bench, skip = new Set<string>()): Node[] {
  const byName = new Map(ordered.map((c) => [c.name, c]));
  const nodes: Node[] = [];
  for (const c of ordered) {
    if (c.archived) continue;
    if (!c.dependsOn.every((d) => { const dep = byName.get(d); return !dep || settled(dep); })) continue;
    for (const g of c.groups) {
      const open = g.tasks.filter((t) => !t.done);
      const tasks = open.filter((t) => holdReason(t, bench) === null);
      if (tasks.length === 0) continue;
      if (skip.has(`${c.name}/${g.title}`)) break; // later groups usually build on this one
      const held = open.filter((t) => !tasks.includes(t)).map((t) => ({ change: c.name, id: t.id, text: t.text, reason: holdReason(t, bench) ?? "" }));
      nodes.push({ change: c.name, group: g.title, tasks, held });
      break;
    }
  }
  return nodes;
}

/** Open tasks nothing automatic will finish on this bench, with the reason. */
export function heldTasks(ordered: Change[], bench: Bench): Held[] {
  return ordered.filter((c) => !c.archived).flatMap((c) =>
    c.groups.flatMap((g) => g.tasks.filter((t) => !t.done && holdReason(t, bench) !== null).map((t) => ({ change: c.name, id: t.id, text: t.text, reason: holdReason(t, bench) ?? "" }))),
  );
}
