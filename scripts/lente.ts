// lente: Lente from a terminal or a script (add-agent-bridge, design decision 6). An MCP client of
// the hub's `/mcp`, with no dependencies: one modern JSON-RPC request per command.
//
//   LENTE_HUB=https://… LENTE_TOKEN=… node scripts/lente.ts ask "¿Qué quedó con Ana?" [--project P]
//   node scripts/lente.ts tasks [--who me|lente|other] [--project P] [--all]
//   node scripts/lente.ts task add "Enviar la cotización" [--who me|lente|other] [--other Ana] [--due viernes]
//   node scripts/lente.ts task done <id>
//
// `--json` prints one JSON document on stdout; errors always go to stderr. Exit codes: 0 done,
// 1 bad usage, 2 no permission, 3 hub error, 5 not found.

import { fileURLToPath } from "node:url";

export const EXIT = { ok: 0, usage: 1, unauthorized: 2, hub: 3, notFound: 5 } as const;
const PROTOCOL = "2026-07-28";
const TIMEOUT_MS = 60_000;

const USAGE = `usage:
  lente ask "<question>" [--project <id or name>] [--json]
  lente tasks [--who me|lente|other] [--project <id or name>] [--all] [--json]
  lente task add "<title>" [--who me|lente|other] [--other <name>] [--due <when>] [--json]
  lente task done <id> [--json]
env: LENTE_HUB (the hub's URL) and LENTE_TOKEN (an agent token from Ajustes → Cuenta → Dispositivos)`;

export interface Command {
  tool: string;
  args: Record<string, unknown>;
  json: boolean;
}

const FLAGS_WITH_VALUE = new Set(["--project", "--who", "--other", "--due"]);

/** The tool call a command line means, or a usage error. Pure. */
export function parseCommand(argv: string[]): Command | { error: string } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      if (FLAGS_WITH_VALUE.has(a)) {
        const v = argv[++i];
        if (v === undefined) return { error: `${a} needs a value` };
        flags.set(a, v);
      } else if (a === "--json" || a === "--all") flags.set(a, true);
      else return { error: `unknown option ${a}` };
    } else positional.push(a);
  }
  const json = flags.has("--json");
  const flag = (name: string) => (typeof flags.get(name) === "string" ? (flags.get(name) as string) : undefined);
  const only = (allowed: string[]) => [...flags.keys()].find((f) => f !== "--json" && !allowed.includes(f));
  const [cmd, sub, ...rest] = positional;
  if (cmd === "ask") {
    const question = [sub, ...rest].filter(Boolean).join(" ").trim();
    if (!question) return { error: "ask needs a question" };
    const extra = only(["--project"]);
    if (extra) return { error: `ask does not take ${extra}` };
    return { tool: "ask_lente", args: { question, ...(flag("--project") ? { project: flag("--project") } : {}) }, json };
  }
  if (cmd === "tasks") {
    if (sub) return { error: `tasks takes no argument (got "${sub}")` };
    const extra = only(["--who", "--project", "--all"]);
    if (extra) return { error: `tasks does not take ${extra}` };
    return { tool: "list_tasks", args: { ...(flag("--who") ? { who: flag("--who") } : {}), ...(flag("--project") ? { project: flag("--project") } : {}), ...(flags.has("--all") ? { open: false } : {}) }, json };
  }
  if (cmd === "task" && sub === "add") {
    const title = rest.join(" ").trim();
    if (!title) return { error: "task add needs a title" };
    const extra = only(["--who", "--other", "--due"]);
    if (extra) return { error: `task add does not take ${extra}` };
    return { tool: "create_task", args: { title, ...(flag("--who") ? { who: flag("--who") } : {}), ...(flag("--other") ? { other_name: flag("--other") } : {}), ...(flag("--due") ? { due: flag("--due") } : {}) }, json };
  }
  if (cmd === "task" && sub === "done") {
    if (rest.length !== 1) return { error: "task done needs one task id" };
    const extra = only([]);
    if (extra) return { error: `task done does not take ${extra}` };
    return { tool: "complete_task", args: { id: rest[0] }, json };
  }
  return { error: cmd ? `unknown command ${[cmd, sub].filter(Boolean).join(" ")}` : "no command" };
}

/** The exit code for a tool error's code. */
export function exitFor(code: string): number {
  if (code === "unauthorized") return EXIT.unauthorized;
  if (code === "not_found") return EXIT.notFound;
  if (code === "invalid_arguments") return EXIT.usage;
  return EXIT.hub;
}

interface Io {
  out(text: string): void;
  err(text: string): void;
}

type Task = { id: string; title: string; who: string; otherName: string | null; due: string | null; done: boolean; project: string | null };
const WHO_LABEL: Record<string, string> = { me: "tú", lente: "lente", other: "otro" };

/** What a person reads for a successful call. */
function humanText(tool: string, value: Record<string, unknown>): string {
  if (tool === "ask_lente") {
    const sources = (value.sources as { label: string }[] | undefined) ?? [];
    return [String(value.answer ?? ""), ...sources.map((s) => `  · ${s.label}`)].join("\n");
  }
  const line = (t: Task) => `${t.done ? "[x]" : "[ ]"} ${t.title}  (${WHO_LABEL[t.who] ?? t.who}${t.who === "other" && t.otherName ? `: ${t.otherName}` : ""}${t.project ? ` · ${t.project}` : ""}${t.due ? ` · ${t.due}` : ""})  ${t.id}`;
  if (tool === "list_tasks") {
    const tasks = value.tasks as Task[];
    return tasks.length ? tasks.map(line).join("\n") : "No hay tareas.";
  }
  const task = value.task as Task;
  return tool === "create_task" ? `Tarea creada: ${line(task)}` : `Hecha: ${task.title}`;
}

/** Runs one command line; returns the exit code. `fetchFn` and the clock are the only I/O. */
export async function run(argv: string[], env: Record<string, string | undefined>, io: Io, fetchFn: typeof fetch = fetch): Promise<number> {
  const command = parseCommand(argv);
  const json = argv.includes("--json");
  const fail = (code: number, kind: string, message: string): number => {
    io.err(json ? JSON.stringify({ error: kind, message }) : `lente: ${kind === "usage" ? message : `${kind}: ${message}`}`);
    return code;
  };
  if ("error" in command) return fail(EXIT.usage, "usage", `${command.error}\n${USAGE}`);
  const hub = env.LENTE_HUB?.replace(/\/+$/, "");
  if (!hub) return fail(EXIT.usage, "usage", `LENTE_HUB is not set\n${USAGE}`);
  if (!env.LENTE_TOKEN) return fail(EXIT.unauthorized, "unauthorized", "LENTE_TOKEN is not set: create an agent token in Ajustes → Cuenta → Dispositivos");

  let response: Response;
  try {
    response = await fetchFn(`${hub}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LENTE_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL,
        "Mcp-Method": "tools/call",
        "Mcp-Name": command.tool,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: command.tool, arguments: command.args, _meta: { "io.modelcontextprotocol/protocolVersion": PROTOCOL, "io.modelcontextprotocol/clientInfo": { name: "lente-cli", version: "0.1.0" }, "io.modelcontextprotocol/clientCapabilities": {} } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return fail(EXIT.hub, "hub_error", `could not reach ${hub}: ${(error as Error).message}`);
  }
  if (response.status === 401 || response.status === 403) return fail(EXIT.unauthorized, "unauthorized", "the hub refused the token (unknown, revoked, or the account is not admitted)");
  let body: { result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text: string }[] }; error?: { code: number; message: string } };
  try {
    body = JSON.parse(await response.text());
  } catch {
    return fail(EXIT.hub, "hub_error", `the hub answered HTTP ${response.status} without JSON`);
  }
  if (body.error) return fail(EXIT.hub, "hub_error", `${body.error.message} (JSON-RPC ${body.error.code}, HTTP ${response.status})`);
  const result = body.result;
  const value = result?.structuredContent;
  if (!result || !value) return fail(EXIT.hub, "hub_error", `unexpected answer (HTTP ${response.status})`);
  if (result.isError) {
    const code = typeof value.error === "string" ? value.error : "hub_error";
    return fail(exitFor(code), code, typeof value.message === "string" ? value.message : "the tool failed");
  }
  io.out(command.json ? JSON.stringify(value) : humanText(command.tool, value));
  return EXIT.ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await run(process.argv.slice(2), process.env, { out: (t) => process.stdout.write(t + "\n"), err: (t) => process.stderr.write(t + "\n") });
  process.exitCode = code;
}
