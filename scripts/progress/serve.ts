// Live project progress from the OpenSpec changes: one page, pushed over SSE whenever a
// tasks.md, a proposal, the build order in CLAUDE.md, the git history or the auto lane's state
// changes. While the auto lane runs, tasks are read from its worktree so ticks show as they land.
//
//   pnpm progress            → http://localhost:7171

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { dirs, keyNames, loadChanges, read } from "./load.ts";
import { heldTasks, nextTask, readyNodes } from "./parse.ts";

const PORT = Number(process.env.PROGRESS_PORT ?? 7171);
const ROOT = join(import.meta.dirname, "..", "..");
const LANE = join(ROOT, ".claude", "worktrees", "auto");
const STATE_DIR = join(ROOT, "data", "auto");
const PAGE_PATH = join(import.meta.dirname, "page.html");
const DEBOUNCE_MS = 150;
const HEARTBEAT_MS = 20_000;
const LANE_POLL_MS = 2_000;
const STALE_RUNNER_MS = 15 * 60_000;
const COMMITS_SHOWN = 6;
const LIVE_STATUSES = new Set(["starting", "working", "gates", "review", "fixing", "committing", "waiting"]);

function recentCommits(): { hash: string; at: number; subject: string }[] {
  try {
    const out = execFileSync("git", ["log", "main", `-${COMMITS_SHOWN}`, "--format=%h%x09%ct%x09%s"], { cwd: ROOT, encoding: "utf8" });
    return out.trim().split("\n").filter(Boolean).map((l) => {
      const [hash, at, ...subject] = l.split("\t");
      return { hash, at: Number(at), subject: subject.join("\t") };
    });
  } catch {
    return [];
  }
}

/** The runner's state file, marked stopped when its process is gone or it went quiet. */
function runnerState(): Record<string, any> | null {
  try {
    const s = JSON.parse(read(join(STATE_DIR, "state.json")) || "null");
    if (s && LIVE_STATUSES.has(s.status)) {
      let alive = true;
      try {
        process.kill(s.pid, 0);
      } catch {
        alive = false;
      }
      if (!alive || Date.now() - s.updatedAt > STALE_RUNNER_MS) s.status = "stopped";
    }
    return s;
  } catch {
    return null;
  }
}

function snapshot() {
  const runner = runnerState();
  const fromLane = runner !== null && LIVE_STATUSES.has(runner.status) && existsSync(LANE);
  const changes = loadChanges(fromLane ? LANE : ROOT);
  // Until the runner has looked, assume the clip and phone are plugged in: only what a person
  // or a missing key holds back is listed as needing the human.
  const seen = runner?.bench;
  const bench = { board: seen ? Boolean(seen.boardPort) : true, phone: seen ? Boolean(seen.phone) : true, keys: keyNames(ROOT), keysOff: seen?.keysOff ?? false };
  const ready = readyNodes(changes, bench);
  return {
    changes,
    next: ready[0] ? { change: ready[0].change, group: ready[0].group, task: ready[0].tasks[0] } : nextTask(changes),
    ready: ready.map((n) => ({ change: n.change, group: n.group, tasks: n.tasks.map((t) => t.id) })),
    held: heldTasks(changes, bench),
    runner,
    source: fromLane ? "auto lane worktree" : "main checkout",
    commits: recentCommits(),
    specs: dirs(join(ROOT, "openspec", "specs")).length,
  };
}

const clients = new Set<ServerResponse>();
let current = JSON.stringify(snapshot());
let pending: NodeJS.Timeout | undefined;

function refresh(): void {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const next = JSON.stringify(snapshot());
    if (next === current) return;
    current = next;
    for (const res of clients) res.write(`data: ${current}\n\n`);
  }, DEBOUNCE_MS);
}

mkdirSync(STATE_DIR, { recursive: true });
watch(join(ROOT, "openspec"), { recursive: true }, refresh);
watch(STATE_DIR, refresh);
watch(ROOT, (_e, file) => file === "CLAUDE.md" && refresh());
if (existsSync(join(ROOT, ".git", "logs"))) watch(join(ROOT, ".git", "logs"), { recursive: true }, refresh);
// The lane worktree comes and goes, so its tasks are polled rather than watched.
setInterval(() => existsSync(LANE) && refresh(), LANE_POLL_MS).unref();

setInterval(() => {
  for (const res of clients) res.write(": keep-alive\n\n");
}, HEARTBEAT_MS).unref();

createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${current}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(PAGE_PATH));
    return;
  }
  res.writeHead(404).end("not found");
})
  .on("error", (err: NodeJS.ErrnoException) => {
    console.error(err.code === "EADDRINUSE" ? `port ${PORT} is taken; set PROGRESS_PORT to another one` : `progress server failed: ${err.message}`);
    process.exit(1);
  })
  .listen(PORT, () => console.log(`progress → http://localhost:${PORT}  (watching openspec/, CLAUDE.md, git, the auto lane)`));
