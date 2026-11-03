// The bridge's pure parts (add-agent-bridge, design decision 10): its config, the folder allow
// list, the exact agent command lines, the environment an agent gets, the summary sent back, and
// the event stream's framing. scripts/agent-bridge.ts does the network and the processes.

import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import type { JobAgent, JobView } from "./agent-jobs.ts";
import { SUMMARY_MAX_CHARS } from "./agent-jobs.ts";

/** A job is stopped after this long, by default. */
export const JOB_TIMEOUT_MS = 15 * 60_000;
/** Between SIGTERM and SIGKILL when a job is stopped. */
export const KILL_GRACE_MS = 5000;
/** Exit codes the bridge reports when the agent never ran or was stopped, as shells use them. */
export const EXIT_TIMEOUT = 124;
export const EXIT_NOT_RUN = 126;
export const EXIT_NOT_FOUND = 127;
/** Output kept from an agent, in characters, before the summary is cut from its end. */
export const OUTPUT_KEEP_CHARS = 64 * 1024;
/** The only variables an agent inherits: no key, token or secret of the bridge or the user. */
export const AGENT_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR"] as const;

export const defaultConfigPath = (home = homedir()): string => join(home, ".config", "lente", "agents.json");

export interface BridgeConfig {
  hub?: string;
  /** Allowed folders by name; every path is absolute and normalized. */
  folders: Map<string, string>;
  /** The folder a job without `workdir` runs in. */
  defaultFolder: string;
  /** The executable for each agent: `claude` and `codex` on the PATH unless the config says otherwise. */
  commands: Record<JobAgent, string>;
  timeoutMs: number;
}

const expand = (p: string, home: string): string => normalize(p.startsWith("~/") ? join(home, p.slice(2)) : p).replace(/\/+$/, "") || "/";

/** The config file's JSON, checked; every problem is named so the user can fix the file. */
export function parseConfig(text: string, home = homedir()): BridgeConfig | { error: string } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    return { error: `the config is not JSON (${(error as Error).message})` };
  }
  if (typeof raw !== "object" || raw === null) return { error: "the config must be a JSON object" };
  const folders = new Map<string, string>();
  const listed = raw.folders;
  if (typeof listed !== "object" || listed === null || Array.isArray(listed)) return { error: 'the config needs "folders": {"name": "/absolute/path"}' };
  for (const [name, path] of Object.entries(listed)) {
    if (typeof path !== "string" || !path) return { error: `folder ${name} needs a path` };
    const full = expand(path, home);
    if (!isAbsolute(full)) return { error: `folder ${name} must be an absolute path (or start with ~/)` };
    if (full === "/" || full === normalize(home)) return { error: `folder ${name} is ${full}: name a project folder, not / or your home` };
    folders.set(name, full);
  }
  if (folders.size === 0) return { error: "the config lists no folders" };
  const defaultFolder = typeof raw.default === "string" ? raw.default : [...folders.keys()][0]!;
  if (!folders.has(defaultFolder)) return { error: `the default folder ${defaultFolder} is not in "folders"` };
  const commands = { claude: "claude", codex: "codex" } as Record<JobAgent, string>;
  if (raw.commands !== undefined) {
    if (typeof raw.commands !== "object" || raw.commands === null) return { error: '"commands" must map claude and codex to executables' };
    for (const [agent, cmd] of Object.entries(raw.commands)) {
      if (agent !== "claude" && agent !== "codex") return { error: `unknown agent ${agent} in "commands"` };
      if (typeof cmd !== "string" || !cmd) return { error: `the command for ${agent} must be a string` };
      commands[agent] = cmd;
    }
  }
  const timeoutMs = raw.timeoutMs === undefined ? JOB_TIMEOUT_MS : Number(raw.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > JOB_TIMEOUT_MS) return { error: `timeoutMs must be between 1 and ${JOB_TIMEOUT_MS}` };
  return { ...(typeof raw.hub === "string" ? { hub: raw.hub } : {}), folders, defaultFolder, commands, timeoutMs };
}

/** Where a job may run: a folder of the allow list, by name or by its exact path; nothing else. */
export function resolveFolder(config: BridgeConfig, workdir: string | undefined, home = homedir()): { ok: true; name: string; path: string } | { ok: false; error: string } {
  if (!workdir) return { ok: true, name: config.defaultFolder, path: config.folders.get(config.defaultFolder)! };
  const byName = config.folders.get(workdir);
  if (byName) return { ok: true, name: workdir, path: byName };
  const wanted = expand(workdir, home);
  for (const [name, path] of config.folders) if (path === wanted) return { ok: true, name, path };
  return { ok: false, error: `the folder "${workdir.slice(0, 80)}" is not in the bridge's allow list (${[...config.folders.keys()].join(", ")})` };
}

export interface AgentCommand {
  file: string;
  args: string[];
  cwd: string;
  /** Codex writes its final message here; Claude Code's is its standard output. */
  lastMessageFile?: string;
}

/**
 * The most restrictive way each CLI can still do the job (verified 2026-11-02):
 * - Claude Code 2.1.316 (`claude --help` and a real run): `--restricted` drops the tools that run
 *   commands and WebFetch, confines file tools to the folder and refuses bypassPermissions;
 *   `acceptEdits` lets it edit there; `--permission-prompts none` denies whatever would prompt.
 * - Codex (OpenAI's CLI reference): `exec` is non-interactive; `--sandbox workspace-write` writes only
 *   in the folder, with the network off by default; `--ephemeral` keeps no session files.
 * The instruction comes after `--`, so it can never be read as a flag.
 */
export function agentCommand(job: Pick<JobView, "agent" | "instruction">, folder: string, commands: Record<JobAgent, string>, lastMessageFile: string): AgentCommand {
  if (job.agent === "codex") {
    return {
      file: commands.codex,
      args: ["exec", "--sandbox", "workspace-write", "--cd", folder, "--ephemeral", "--output-last-message", lastMessageFile, "--", job.instruction],
      cwd: folder,
      lastMessageFile,
    };
  }
  return {
    file: commands.claude,
    args: ["-p", "--restricted", "--permission-mode", "acceptEdits", "--permission-prompts", "none", "--strict-mcp-config", "--no-session-persistence", "--disallowedTools", "WebSearch", "--output-format", "text", "--", job.instruction],
    cwd: folder,
  };
}

/** The agent's environment: the allowed names only, so no `*_KEY`, `*_TOKEN` or `LENTE_*` reaches it. */
export function agentEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of AGENT_ENV_KEYS) if (env[k] !== undefined) out[k] = env[k]!;
  return out;
}

/** What goes back to Lente: the final message, or the output's end; with a failure, the error's end too. */
export function summarize(input: { exitCode: number; lastMessage?: string; stdout: string; stderr: string; note?: string }): string {
  const main = (input.lastMessage?.trim() || input.stdout.trim()).replace(/\r\n?/g, "\n");
  const err = input.exitCode !== 0 ? input.stderr.trim() : "";
  const parts = [input.note, main, err && `stderr: ${err.slice(-600)}`].filter(Boolean) as string[];
  const text = parts.join("\n\n") || (input.exitCode === 0 ? "Terminado, sin salida." : `Salió con código ${input.exitCode}, sin salida.`);
  return text.length > SUMMARY_MAX_CHARS ? `…${text.slice(-(SUMMARY_MAX_CHARS - 1))}` : text;
}

/** Keeps the end of a growing output. */
export const keepTail = (kept: string, chunk: string): string => (kept.length + chunk.length > OUTPUT_KEEP_CHARS ? (kept + chunk).slice(-OUTPUT_KEEP_CHARS) : kept + chunk);

/** Splits an event stream into the `data:` payloads it completed and the unfinished rest. */
export function sseEvents(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((b) => b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n"))
    .filter(Boolean);
  return { events, rest };
}
