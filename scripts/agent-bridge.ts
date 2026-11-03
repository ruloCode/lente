// The agent bridge (add-agent-bridge): runs on the user's machine, follows the hub with an
// `agent.run` token, and runs each job the user approved in Lente with Claude Code or Codex,
// one at a time, in a folder from its allow list, then posts a short summary back.
//
//   LENTE_TOKEN=<agent.run token> node scripts/agent-bridge.ts [--config <file>] [--once]
//
// The config (default ~/.config/lente/agents.json, never .env) names the hub and the folders:
//   { "hub": "https://…", "folders": { "lente": "~/dev/lente" }, "default": "lente" }
// The agents get only PATH, HOME, USER, LANG and a few more (src/agent-bridge.ts): no key or token.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BridgeConfig, EXIT_NOT_FOUND, EXIT_NOT_RUN, EXIT_TIMEOUT, KILL_GRACE_MS, agentCommand, agentEnv, defaultConfigPath, keepTail, parseConfig, resolveFolder, sseEvents, summarize } from "../src/agent-bridge.ts";
import type { JobView } from "../src/agent-jobs.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ONCE = argv.includes("--once");
const configPath = flag("--config") ?? process.env.LENTE_BRIDGE_CONFIG ?? defaultConfigPath();
const log = (line: string) => console.log(`[bridge] ${line}`);

function loadConfig(): BridgeConfig {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (error) {
    console.error(`[bridge] cannot read ${configPath}: ${(error as Error).message}. Write it as {"hub": "https://…", "folders": {"name": "/absolute/path"}}.`);
    process.exit(1);
  }
  const parsed = parseConfig(text);
  if ("error" in parsed) {
    console.error(`[bridge] ${configPath}: ${parsed.error}`);
    process.exit(1);
  }
  return parsed;
}

const config = loadConfig();
const token = process.env.LENTE_TOKEN;
const hub = (process.env.LENTE_HUB ?? config.hub)?.replace(/\/+$/, "");
if (!token) {
  console.error("[bridge] LENTE_TOKEN is not set: create an agent token with the agent.run scope in Ajustes → Cuenta → Dispositivos.");
  process.exit(1);
}
if (!hub) {
  console.error(`[bridge] no hub: set "hub" in ${configPath} or LENTE_HUB.`);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

/** One job at a time: the latest queue the hub sent, and whether a job is running. */
let queue: JobView[] = [];
let running = false;
let child: ReturnType<typeof spawn> | undefined;

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${hub}${path}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Runs the agent; resolves with its exit code and what it said. */
function runAgent(job: JobView, folder: string): Promise<{ exitCode: number; summary: string }> {
  const scratch = mkdtempSync(join(tmpdir(), "lente-bridge-"));
  const cmd = agentCommand(job, folder, config.commands, join(scratch, "last-message.txt"));
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const done = (exitCode: number, note?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let lastMessage: string | undefined;
      try {
        if (cmd.lastMessageFile) lastMessage = readFileSync(cmd.lastMessageFile, "utf8");
      } catch {
        // Codex did not write a final message: the output's end stands in.
      }
      rmSync(scratch, { recursive: true, force: true });
      child = undefined;
      resolve({ exitCode, summary: summarize({ exitCode, lastMessage, stdout, stderr, note }) });
    };
    const proc = spawn(cmd.file, cmd.args, { cwd: cmd.cwd, env: agentEnv(process.env), stdio: ["ignore", "pipe", "pipe"] });
    child = proc;
    proc.stdout.setEncoding("utf8").on("data", (c: string) => (stdout = keepTail(stdout, c)));
    proc.stderr.setEncoding("utf8").on("data", (c: string) => (stderr = keepTail(stderr, c)));
    proc.on("error", (error) => done(EXIT_NOT_FOUND, `No se pudo iniciar ${cmd.file}: ${error.message}`));
    proc.on("close", (code, signal) => {
      if (timedOut) return done(EXIT_TIMEOUT, `Detenido: pasó de ${Math.round(config.timeoutMs / 60_000) || 1} min.`);
      done(code ?? (signal ? 128 : 1), signal ? `Terminó por la señal ${signal}.` : undefined);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE_MS).unref();
    }, config.timeoutMs);
  });
}

/** Claims the next job and runs it; the hub refuses a claim another bridge already made. */
async function next(): Promise<void> {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  try {
    const claimed = await post(`/agent/jobs/${encodeURIComponent(job.id)}/claim`, {});
    if (!claimed.ok) {
      log(`job ${job.id} not claimed (HTTP ${claimed.status}); skipping`);
      return;
    }
    const started = Date.now();
    const folder = resolveFolder(config, job.workdir);
    const result = folder.ok ? await runAgent(job, folder.path) : { exitCode: EXIT_NOT_RUN, summary: `No corrió: ${folder.error}.` };
    log(`job ${job.id} · ${job.agent} in ${folder.ok ? folder.name : "(refused folder)"} · exit ${result.exitCode} · ${Math.round((Date.now() - started) / 1000)} s`);
    // The work is done whatever the network does, so the result is retried before giving up.
    let reported = false;
    for (const wait of [0, 2000, 5000, 15_000]) {
      await new Promise((r) => setTimeout(r, wait));
      const sent = await post(`/agent/jobs/${encodeURIComponent(job.id)}/result`, result).catch((error: Error) => error);
      if (sent instanceof Error) {
        log(`job ${job.id}: could not send the result (${sent.message})`);
        continue;
      }
      if (!sent.ok) log(`job ${job.id}: the hub did not take the result (HTTP ${sent.status})`);
      reported = true;
      break;
    }
    if (!reported) log(`job ${job.id}: the result never reached the hub; it will show as lost`);
    if (ONCE) process.exit(0);
  } catch (error) {
    log(`job ${job.id}: ${(error as Error).message}`);
  } finally {
    running = false;
  }
  void next();
}

/** Follows the hub's stream, reconnecting with a growing pause; only `jobs` events come on it. */
async function follow(): Promise<void> {
  let pause = 1000;
  for (;;) {
    try {
      const res = await fetch(`${hub}/events`, { headers: { ...auth, Accept: "text/event-stream" } });
      if (res.status === 401 || res.status === 403) {
        console.error(`[bridge] the hub refused the token (HTTP ${res.status}): it must be a live agent token with the agent.run scope.`);
        process.exit(2);
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      log(`following ${hub} · folders: ${[...config.folders.keys()].join(", ")} (default ${config.defaultFolder})`);
      pause = 1000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const split = sseEvents(buffer + decoder.decode(value, { stream: true }));
        buffer = split.rest;
        for (const data of split.events) {
          const event = JSON.parse(data) as { kind?: string; items?: JobView[] };
          if (event.kind !== "jobs" || !Array.isArray(event.items)) continue;
          queue = event.items;
          void next();
        }
      }
      throw new Error("the stream ended");
    } catch (error) {
      log(`stream lost (${(error as Error).message}); retrying in ${pause / 1000} s`);
      await new Promise((r) => setTimeout(r, pause));
      pause = Math.min(pause * 2, 30_000);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child?.kill("SIGTERM");
    process.exit(130);
  });
}
void follow();
