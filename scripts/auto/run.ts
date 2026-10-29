// The auto lane. Picks the next ready node (one task group) from the OpenSpec graph, has a
// headless Claude Code session build it in its own worktree, then holds it to the same gates as
// CI, has a fresh read-only Claude Code session review the diff, and only then commits and
// fast-forwards main. Meta's models run inside Lente, not in the lane that builds it. Progress goes to data/auto/state.json, which `pnpm progress` shows live.
//
//   pnpm auto                  run until nothing is ready or the budget is spent
//   pnpm auto --dry-run        show the bench and the ready nodes; change nothing
//   pnpm auto --once           one node, then stop
//   pnpm auto --watch          when nothing is ready, look again every 10 min (a human may unblock)
//   pnpm auto --push           push main after each merged node (CI runs on GitHub)
//   pnpm auto --budget 40 --node-budget 6 --model opus

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, lstatSync, mkdirSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { type Bench, type Node, heldTasks, readyNodes } from "../progress/parse.ts";
import { keyNames, loadChanges } from "../progress/load.ts";
import { lastJsonWith } from "./json.ts";
import { commitMessage } from "./message.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const LANE = join(ROOT, ".claude", "worktrees", "auto");
const LANE_BRANCH = "auto/lente";
const STATE_DIR = join(ROOT, "data", "auto");
const STATE_PATH = join(STATE_DIR, "state.json");
const RUNS_DIR = join(STATE_DIR, "runs");
const FQBN = "esp32:esp32:XIAO_ESP32S3:PSRAM=opi";
// Wi-Fi only: the lane gets no model keys (.env), so building Lente spends no Meta or Baseten credit.
const LINKED_SECRETS = ["firmware/lente-clip/secrets.h", "firmware/selftest/secrets.h"];
const UNLINKED = [".env"];
// Blanked in the builder's and reviewer's environment (names only; keyNames() also returns PATH and friends).
const MODEL_KEYS = ["MODEL_API_KEY", "BASETEN_API_KEY", "ELEVENLABS_API_KEY", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "FIREWORKS_API_KEY"];
const FIX_ROUNDS = 2;
const WATCH_MS = 10 * 60_000;
const REVIEW_TIMEOUT_MS = 10 * 60_000;
const REVIEW_BUDGET_USD = 1.5;
const ACTIVITY_KEPT = 60;
const HISTORY_KEPT = 50;
const DIFF_MAX_CHARS = 120_000;
const TAIL_LINES = 60;
const CO_AUTHOR = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
const HUB_PORT = 7070;

const { values: opt } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    once: { type: "boolean", default: false },
    watch: { type: "boolean", default: false },
    push: { type: "boolean", default: false },
    budget: { type: "string", default: "40" },
    "node-budget": { type: "string", default: "6" },
    model: { type: "string" },
    "permission-mode": { type: "string", default: "auto" },
  },
});
const BUDGET_USD = Number(opt.budget);
const NODE_BUDGET_USD = Number(opt["node-budget"]);

// ---------- state the progress page reads ----------

type Outcome = { change: string; group: string; outcome: "merged" | "failed"; at: number; costUsd: number; commit?: string; reason?: string; review?: string; mainUpdated?: boolean; blocked?: string[] };
const state = {
  status: "starting",
  message: "",
  pid: process.pid,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  lane: relative(ROOT, LANE),
  branch: LANE_BRANCH,
  bench: { boardPort: null as string | null, phone: null as string | null, keys: [] as string[], keysOff: true },
  node: null as null | { change: string; group: string; tasks: string[]; startedAt: number; round: number },
  spentUsd: 0,
  budgetUsd: BUDGET_USD,
  activity: [] as { at: number; text: string }[],
  history: [] as Outcome[],
};

function save(patch: Partial<typeof state> = {}): void {
  Object.assign(state, patch, { updatedAt: Date.now() });
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH); // atomic, so the page never reads half a file
}

function note(text: string): void {
  console.log(`[auto] ${text}`);
  state.activity.push({ at: Date.now(), text: text.slice(0, 240) });
  if (state.activity.length > ACTIVITY_KEPT) state.activity.splice(0, state.activity.length - ACTIVITY_KEPT);
  save();
}

// ---------- shell helpers ----------

type Run = { ok: boolean; out: string; stdout: string };
function sh(cmd: string, args: string[], cwd = LANE, timeoutMs = 10 * 60_000, input?: string, env: NodeJS.ProcessEnv = process.env): Run {
  const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...env, FORCE_COLOR: "0" } });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`, stdout: r.stdout ?? "" };
}
const tail = (s: string, n = TAIL_LINES) => s.trim().split("\n").slice(-n).join("\n");
const git = (args: string[], cwd = LANE) => sh("git", args, cwd);

// ---------- the bench: clip board, phone, keys ----------

function detectBench(): { bench: Bench; boardPort: string | null; phone: string | null } {
  let boardPort: string | null = null;
  const boards = sh("arduino-cli", ["board", "list", "--format", "json"], ROOT, 30_000);
  if (boards.ok) {
    try {
      const j = JSON.parse(boards.stdout);
      const ports: { port?: { address?: string }; address?: string; matching_boards?: { fqbn?: string }[] }[] = Array.isArray(j) ? j : (j.detected_ports ?? []);
      const esp = ports.find((p) => p.matching_boards?.some((b) => b.fqbn?.startsWith("esp32:")));
      boardPort = esp?.port?.address ?? esp?.address ?? null;
    } catch {}
  }
  let phone: string | null = null;
  const adb = sh("adb", ["devices"], ROOT, 15_000);
  if (adb.ok) {
    const serials = adb.out.split("\n").map((l) => l.split("\t")).filter(([s, st]) => s && st?.trim() === "device").map(([s]) => s.trim());
    // Only a phone counts: a TV on Wi-Fi debugging is an adb device too, with no Chrome to drive.
    const phones = serials.filter((s) => !/\btv\b/.test(sh("adb", ["-s", s, "shell", "getprop", "ro.build.characteristics"], ROOT, 10_000).stdout));
    phone = phones.find((s) => !s.includes(":")) ?? phones[0] ?? null; // USB before Wi-Fi debugging
  }
  return { bench: { board: boardPort !== null, phone: phone !== null, keys: keyNames(ROOT), keysOff: true }, boardPort, phone };
}

// ---------- the lane worktree ----------

function prepareLane(): void {
  if (!existsSync(LANE)) {
    const add = git(["worktree", "add", "-B", LANE_BRANCH, LANE, "main"], ROOT);
    if (!add.ok) throw new Error(`could not create the lane worktree at ${LANE}: ${tail(add.out, 5)}`);
    note(`created worktree ${relative(ROOT, LANE)} on ${LANE_BRANCH}`);
  }
  for (const rel of UNLINKED) {
    const at = join(LANE, rel);
    if (existsSync(at) && lstatSync(at).isSymbolicLink()) unlinkSync(at); // linked by an older runner
  }
  for (const rel of LINKED_SECRETS) {
    const from = join(ROOT, rel);
    const to = join(LANE, rel);
    if (existsSync(from) && !existsSync(to)) symlinkSync(from, to); // linked, never copied or read
  }
  if (!existsSync(join(LANE, "node_modules"))) {
    const install = sh("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
    if (!install.ok) throw new Error(`pnpm install failed in the lane: ${tail(install.out, 10)}`);
  }
}

/** Clean the lane and replay it on top of main, so it builds on whatever the human committed. */
function syncLane(): boolean {
  if (git(["status", "--porcelain"]).out.trim()) {
    git(["reset", "--hard"]);
    git(["clean", "-fd"]);
    note("discarded leftovers from an interrupted node");
  }
  const rebase = git(["rebase", "main"]);
  if (!rebase.ok) {
    git(["rebase", "--abort"]);
    save({ status: "blocked", message: `the lane can't rebase onto main (conflict); merge ${LANE_BRANCH} by hand. ${tail(rebase.out, 3)}` });
    return false;
  }
  return true;
}

// ---------- the builder: a headless Claude Code session ----------

const RESULT_SCHEMA = {
  type: "object",
  required: ["commit_message", "tasks"],
  properties: {
    commit_message: { type: "string", description: "Subject line in the repo's style (e.g. 'Solo grabar, phone: mode switch and GRABANDO pill'), then a blank line and a short body" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "status", "evidence"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["done", "blocked"] },
          evidence: { type: "string", description: "The verification you ran and what it showed (command and key output), or why it is blocked" },
        },
      },
    },
    notes: { type: "string" },
  },
};
type BuildResult = { commit_message: string; tasks: { id: string; status: string; evidence: string }[]; notes?: string };

function buildPrompt(node: Node, boardPort: string | null, phone: string | null): string {
  const tasks = node.tasks.map((t) => `- ${t.id} ${t.text}${t.tags.length ? ` [${t.tags.join("] [")}]` : ""}`).join("\n");
  const held = node.held.length ? node.held.map((h) => `- ${h.id} (${h.reason}) ${h.text}`).join("\n") : "- none";
  return `You are Lente's auto lane: an unattended Claude Code session in the worktree ${LANE} (branch ${LANE_BRANCH}). No human is watching and nobody will answer questions, so decide with sensible defaults and say what you decided.

Node: change \`${node.change}\`, task group "${node.group}".
Do these tasks:
${tasks}
Leave these alone (they can't run unattended on this bench):
${held}

How:
1. Read CLAUDE.md, then the change's proposal.md, design.md (if any), specs/ and tasks.md. Read docs/kb files only as the tasks need them. If the code must differ from the spec, update the change first.
2. Implement each task, run the verification it names, and tick it (\`- [x]\`) in tasks.md only once that verification passed. If a task can't be finished (missing hardware behaviour, unclear spec, a step only a person can do), leave it unticked and report it blocked with the reason. Don't fake a verification and don't write a number you didn't measure.
3. Bench: clip board ${boardPort ? `on ${boardPort} ($LENTE_BOARD_PORT)` : "not connected"}; Android phone ${phone ? `adb serial ${phone} ($LENTE_PHONE_SERIAL)` : "not connected"}. The lente-hardware skill says how to flash the clip, read its serial log, drive the phone page over adb and play test speech.
4. Building Lente spends no model credit: this worktree has no .env and no Meta or Baseten key, and you must not load one from elsewhere. For live checks run the stubbed Meta API (\`pnpm stub\`, in the background; it prints the env that points a hub at it) and this checkout's hub with that env; the stub transcribes a fixed question whatever it hears, which is enough to check the page, the cards and the clip link. If a verification needs real model output (quality, real latency, a real transcript), leave that task unticked and report it blocked as "needs a real model run". The human's hub may be running on ports 7070/8080 from the main checkout; you may stop it for live checks (the clip connects to 7070). Stop your hub and the stub when done, and leave the human's hub stopped: a hub left listening spends credit.
5. Finish green: \`pnpm typecheck && pnpm test && pnpm exec openspec validate ${node.change} --strict\`. If every task of the change is now ticked, run \`pnpm exec openspec archive ${node.change} --yes\`. Add or update today's row in README.md "What was built during the hackathon".
6. Don't commit, push, merge or rebase: the runner reviews, commits and merges. Stay inside this worktree.

Your final answer is the structured result: a commit message, every task above with done/blocked and its evidence, and notes for the reviewer.`;
}

let child: ChildProcess | null = null;

/** Runs (or resumes) the builder; streams its tool calls into the activity feed. */
function claude(prompt: string, env: NodeJS.ProcessEnv, logPath: string, resume?: string): Promise<{ sessionId?: string; costUsd: number; result?: BuildResult; error?: string }> {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", opt["permission-mode"] ?? "auto", "--max-budget-usd", String(NODE_BUDGET_USD), "--json-schema", JSON.stringify(RESULT_SCHEMA)];
  if (opt.model) args.push("--model", opt.model);
  if (resume) args.push("--resume", resume);
  const log = createWriteStream(logPath, { flags: "a" });
  return new Promise((resolve) => {
    let sessionId: string | undefined;
    let final: Record<string, unknown> | undefined;
    let buf = "";
    child = spawn("claude", args, { cwd: LANE, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", (d: Buffer) => {
      log.write(d);
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let ev: Record<string, any>;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        sessionId ??= ev.session_id;
        if (ev.type === "result") final = ev;
        if (ev.type !== "assistant") continue;
        for (const part of ev.message?.content ?? []) {
          if (part.type === "tool_use") {
            const i = part.input ?? {};
            const what = i.command ?? i.file_path ?? i.pattern ?? i.description ?? i.skill ?? i.url ?? "";
            note(`${part.name} ${String(what).split("\n")[0]}`.trim());
          } else if (part.type === "text" && part.text?.trim()) {
            note(`💬 ${part.text.trim().split("\n")[0]}`);
          }
        }
      }
    });
    child.stderr!.on("data", (d: Buffer) => log.write(d));
    child.on("close", (code) => {
      child = null;
      log.end();
      const costUsd = Number(final?.total_cost_usd ?? 0);
      let result = final?.structured_output as BuildResult | undefined;
      if (!result && typeof final?.result === "string") {
        try {
          result = JSON.parse(String(final.result).replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {}
      }
      const error = !final ? `claude exited (${code}) without a result` : final.is_error || final.subtype !== "success" ? `claude stopped: ${final.subtype}` : undefined;
      resolve({ sessionId, costUsd, result, error });
    });
  });
}

// ---------- brakes: CI's checks, then a different model ----------

function gates(change: string, base: string): { ok: boolean; failure?: string } {
  const touched = git(["diff", "--name-only", base]).out + git(["ls-files", "--others", "--exclude-standard"]).out;
  const stillActive = existsSync(join(LANE, "openspec", "changes", change));
  const steps: [string, string, string[]][] = [
    ["typecheck", "pnpm", ["typecheck"]],
    ["tests", "pnpm", ["test"]],
    ["openspec", "pnpm", stillActive ? ["exec", "openspec", "validate", change, "--strict"] : ["exec", "openspec", "validate", "--specs", "--strict"]],
    ["smoke", "pnpm", ["smoke"]],
  ];
  if (/^firmware\//m.test(touched)) {
    steps.push(["firmware lente-clip", "arduino-cli", ["compile", "-b", FQBN, "firmware/lente-clip"]]);
    steps.push(["firmware selftest", "arduino-cli", ["compile", "-b", FQBN, "firmware/selftest"]]);
  }
  for (const [name, cmd, args] of steps) {
    note(`gate: ${name}`);
    const r = sh(cmd, args);
    if (!r.ok) return { ok: false, failure: `gate "${name}" (${cmd} ${args.join(" ")}) failed:\n${tail(r.out)}` };
  }
  return { ok: true };
}

type Review = { verdict: "approve" | "changes" | "skipped"; blocking: { file?: string; line?: number; issue: string }[]; notes?: string[] | string; costUsd?: number };

function review(node: Node, base: string, build: BuildResult | undefined, env: NodeJS.ProcessEnv): Review {
  git(["add", "-A", "--intent-to-add"]);
  let diff = git(["diff", base]).out;
  if (diff.length > DIFF_MAX_CHARS) diff = `${git(["diff", "--stat", base]).out}\n(diff truncated)\n${diff.slice(0, DIFF_MAX_CHARS)}`;
  const prompt = `You review a change another AI agent (Claude Code) made to Lente, a meeting assistant (clip on glasses → Node hub → phone). You are the second reviewer, with none of the author's context: catch what the author missed. Read CLAUDE.md for the hard rules. You may open files in this workspace to check context.

Task group: \`${node.change}\` / "${node.group}":
${node.tasks.map((t) => `- ${t.id} ${t.text}`).join("\n")}

The author's report:
${JSON.stringify(build ?? { note: "no structured report" }, null, 2)}

Blocking means: a bug that breaks the product or a test's intent, behaviour that contradicts the spec in openspec/changes/${node.change}/, a hard-rule violation (secrets or meeting data committed, a *-contributor model, code copied from elsewhere, a number that wasn't measured), or a task ticked without a real verification. Style and taste are never blocking.

Reply with only this JSON, nothing else:
{"verdict":"approve"|"changes","blocking":[{"file":"…","line":0,"issue":"…"}],"notes":["…"]}

The diff:
${diff}`;
  note("review: a fresh Claude Code session reads the diff");
  const args = ["-p", "--output-format", "json", "--permission-mode", "plan", "--max-budget-usd", String(REVIEW_BUDGET_USD)];
  if (opt.model) args.push("--model", opt.model);
  const r = sh("claude", args, LANE, REVIEW_TIMEOUT_MS, prompt, env); // the prompt goes in on stdin: a long diff can pass ARG_MAX
  const final = lastJsonWith<{ result?: string; total_cost_usd?: number }>(r.stdout, "total_cost_usd");
  const costUsd = Number(final?.total_cost_usd ?? 0);
  const v = lastJsonWith<Review>(final?.result ?? "", "verdict");
  if (v && (v.verdict === "approve" || v.verdict === "changes")) return { ...v, blocking: v.blocking ?? [], costUsd };
  return { verdict: "skipped", blocking: [], notes: [`the reviewer gave no verdict${r.ok ? "" : ` (exit: ${tail(r.out, 3)})`}`], costUsd };
}

// ---------- one node, end to end ----------

async function runNode(node: Node, boardPort: string | null, phone: string | null): Promise<Outcome> {
  const base = git(["rev-parse", "HEAD"]).out.trim();
  const started = Date.now();
  const logPath = join(RUNS_DIR, `${new Date(started).toISOString().replace(/[:.]/g, "-")}-${node.change}.jsonl`);
  mkdirSync(RUNS_DIR, { recursive: true });
  save({ status: "working", message: `building ${node.change} / ${node.group}`, node: { change: node.change, group: node.group, tasks: node.tasks.map((t) => t.id), startedAt: started, round: 0 } });
  const noKeys = Object.fromEntries(MODEL_KEYS.map((k) => [k, ""]));
  const env = { ...process.env, ...noKeys, LENTE_AUTO: "1", LENTE_LANE_ROOT: LANE, LENTE_BOARD_PORT: boardPort ?? "", LENTE_PHONE_SERIAL: phone ?? "", LENTE_HUB_URL: "http://localhost:8080" };

  let costUsd = 0;
  const fail = (reason: string): Outcome => {
    git(["reset", "--hard", base]);
    git(["clean", "-fd"]);
    return { change: node.change, group: node.group, outcome: "failed", at: Date.now(), costUsd, reason };
  };

  let run = await claude(buildPrompt(node, boardPort, phone), env, logPath);
  costUsd += run.costUsd;
  state.spentUsd += run.costUsd;
  let lastReview: Review | undefined;

  for (let round = 0; ; round++) {
    if (run.error && !run.result) return fail(run.error);
    if (!git(["status", "--porcelain"]).out.trim()) return fail(`no changes; the builder reported: ${run.result?.tasks.map((t) => `${t.id} ${t.status}: ${t.evidence}`).join(" | ") ?? run.error ?? "nothing"}`);

    save({ status: "gates" });
    const g = gates(node.change, base);
    let problem = g.failure;
    if (!problem) {
      save({ status: "review" });
      lastReview = review(node, base, run.result, env);
      costUsd += lastReview.costUsd ?? 0;
      state.spentUsd += lastReview.costUsd ?? 0;
      note(`review: ${lastReview.verdict}${lastReview.blocking.length ? `, ${lastReview.blocking.length} blocking` : ""}`);
      if (lastReview.verdict === "changes" && lastReview.blocking.length) {
        problem = `A second reviewer (a fresh Claude Code session) read the diff and found blocking issues:\n${lastReview.blocking.map((b) => `- ${b.file ?? ""}${b.line ? `:${b.line}` : ""} ${b.issue}`).join("\n")}\nFix what is right; if an issue is wrong, explain why in your notes.`;
      }
    }
    if (!problem) break;
    if (round >= FIX_ROUNDS || !run.sessionId) return fail(problem.split("\n")[0]);
    if (state.spentUsd >= BUDGET_USD) return fail("run budget spent during fixes");
    save({ status: "fixing", node: { ...state.node!, round: round + 1 } });
    note(`fix round ${round + 1}: ${problem.split("\n")[0]}`);
    run = await claude(`The runner checked your work and it can't merge yet.\n\n${problem}\n\nFix it under the same rules, keep the tasks.md ticks honest, then give the same structured result.`, env, logPath, run.sessionId);
    costUsd += run.costUsd;
    state.spentUsd += run.costUsd;
  }

  save({ status: "committing" });
  git(["add", "-A"]);
  const staged = git(["diff", "--cached", "--name-only"]).out;
  const forbidden = staged.split("\n").filter((f) => /(^|\/)\.env(\.|$)(?!example)|secrets\.h$|^data\/|^recordings\/|\.(wav|pcm)$/.test(f));
  if (forbidden.length) return fail(`refused to commit protected files: ${forbidden.join(", ")}`);

  const reviewLine = lastReview ? `Review (fresh Claude Code session): ${lastReview.verdict}${lastReview.notes ? ` · ${[lastReview.notes].flat().join(" · ")}` : ""}` : "";
  const message = commitMessage(run.result, `${node.change}: ${node.group}`, `Auto lane node: ${node.change} / ${node.group}`, reviewLine, CO_AUTHOR);
  const msgFile = join(tmpdir(), `lente-commit-${process.pid}.txt`);
  writeFileSync(msgFile, message);
  const commit = git(["commit", "-F", msgFile]);
  if (!commit.ok) return fail(`commit failed: ${tail(commit.out, 5)}`);
  const sha = git(["rev-parse", "--short", "HEAD"]).out.trim();

  const onMain = git(["rev-parse", "--abbrev-ref", "HEAD"], ROOT).out.trim() === "main";
  const ff = onMain ? git(["merge", "--ff-only", LANE_BRANCH], ROOT) : git(["fetch", ".", `${LANE_BRANCH}:main`], ROOT);
  if (!ff.ok) note(`main not fast-forwarded yet (${tail(ff.out, 1)}); ${LANE_BRANCH} keeps the commit`);
  if (ff.ok && opt.push) {
    const push = git(["push", "origin", "main"], ROOT);
    note(push.ok ? "pushed main; CI runs on GitHub" : `push failed: ${tail(push.out, 2)}`);
  }
  const blocked = run.result?.tasks.filter((t) => t.status === "blocked").map((t) => t.id) ?? [];
  return { change: node.change, group: node.group, outcome: "merged", at: Date.now(), costUsd, commit: sha, review: lastReview?.verdict, mainUpdated: ff.ok, blocked };
}

// ---------- the human's hub ----------

/** PID of whatever listens on the clip's port, or null. */
function hubPid(): number | null {
  const pid = Number(sh("lsof", ["-nP", `-iTCP:${HUB_PORT}`, "-sTCP:LISTEN", "-t"], ROOT, 10_000).stdout.trim().split("\n")[0]);
  return pid || null;
}

/** A node may stop the human's hub for live checks. It stays off: a hub left listening spends transcription credit. */
function noteHub(wasUp: boolean): void {
  if (wasUp && hubPid() === null) note(`the human's hub was stopped for a live check and left off so it spends nothing; start it with \`pnpm pilot\` when needed`);
}

// ---------- main loop ----------

function anotherRunner(): boolean {
  const r = sh("pgrep", ["-f", String.raw`^node .*scripts/auto/run\.ts`], ROOT); // not shells or watchers that merely mention it
  return r.out.split("\n").map(Number).some((pid) => pid && pid !== process.pid && pid !== process.ppid);
}

async function main(): Promise<void> {
  if (!opt["dry-run"] && anotherRunner()) throw new Error("another auto lane runner is already running (pgrep -f '^node .*scripts/auto/run.ts')");
  const failed = new Set<string>();
  for (;;) {
    const { bench, boardPort, phone } = detectBench();
    const changes = loadChanges(existsSync(LANE) ? LANE : ROOT);
    const wanted = new Set(changes.flatMap((c) => c.groups.flatMap((g) => g.tasks.flatMap((t) => t.tags.filter((x) => x.startsWith("key:")).map((x) => x.slice(4))))));
    state.bench = { boardPort, phone, keys: [...wanted].filter((k) => bench.keys.has(k)), keysOff: true };

    if (opt["dry-run"]) {
      console.log(`bench: board ${boardPort ?? "none"} · phone ${phone ?? "none"} · keys ${state.bench.keys.join(", ") || "none"} (of ${[...wanted].join(", ") || "none"})`);
      for (const n of readyNodes(changes, bench)) console.log(`ready  ${n.change} / ${n.group}: ${n.tasks.map((t) => t.id).join(" ")}${n.held.length ? `  (held: ${n.held.map((h) => h.id).join(" ")})` : ""}`);
      for (const h of heldTasks(changes, bench)) console.log(`held   ${h.change} ${h.id}: ${h.reason}`);
      return;
    }

    prepareLane();
    if (!syncLane()) return;
    const nodes = readyNodes(loadChanges(LANE), bench, failed);
    if (state.spentUsd >= BUDGET_USD) {
      save({ status: "stopped", node: null, message: `budget spent: US$${state.spentUsd.toFixed(2)} of ${BUDGET_USD}` });
      return;
    }
    if (nodes.length === 0) {
      const held = heldTasks(loadChanges(LANE), bench).length;
      if (!opt.watch) {
        save({ status: "done", node: null, message: `nothing ready for the lane; ${held} task(s) need you or the bench` });
        return;
      }
      save({ status: "waiting", node: null, message: `nothing ready; ${held} task(s) need you or the bench. Looking again in ${WATCH_MS / 60_000} min` });
      await new Promise((r) => setTimeout(r, WATCH_MS));
      continue;
    }

    const node = nodes[0];
    note(`▶ ${node.change} / ${node.group} (${node.tasks.map((t) => t.id).join(", ")})`);
    const hubWasUp = hubPid() !== null;
    const outcome = await runNode(node, boardPort, phone);
    noteHub(hubWasUp);
    state.history.push(outcome);
    if (state.history.length > HISTORY_KEPT) state.history.shift();
    if (outcome.outcome === "failed") failed.add(`${node.change}/${node.group}`);
    if (outcome.blocked?.length) {
      failed.add(`${node.change}/${node.group}`); // its blocked tasks would only be retried in vain
      note(`${node.change} / ${node.group}: ${outcome.blocked.join(", ")} blocked; skipped for the rest of this run`);
    }
    note(outcome.outcome === "merged" ? `✓ ${node.change} / ${node.group} → ${outcome.commit} (US$${outcome.costUsd.toFixed(2)})` : `✗ ${node.change} / ${node.group}: ${outcome.reason}`);
    save({ status: "working", node: null });
    if (opt.once) {
      save({ status: "stopped", message: "--once: stopped after one node" });
      return;
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    child?.kill("SIGTERM");
    save({ status: "stopped", node: null, message: `stopped by ${sig}; the lane's uncommitted work is discarded on the next run` });
    process.exit(130);
  });
}

main().catch((err: Error) => {
  save({ status: "blocked", node: null, message: err.message });
  console.error(`[auto] ${err.message}`);
  process.exit(1);
});
