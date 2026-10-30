// `pnpm auto:cloud-setup`: create the cloud builder agent and its sandbox environment once, update
// them in place afterwards, and record their ids in data/auto/cloud.json. Never archives anything.
// --dry-run prints the bodies and needs no key.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { API_BASE, agentBody, environmentBody, headers } from "./cloud.ts";

export const IDS_FILE = "data/auto/cloud.json";
export const KEY_FILE = join(homedir(), ".config", "lente", "anthropic-cloud.key");

export const GITHUB_TOKEN_FILE = join(homedir(), ".config", "lente", "github-read.token");

export type CloudIds = { agentId?: string; environmentId?: string; agentVersion?: number; workspaceId?: string };

// Short on purpose: the runner sends the per-node prompt as the first message.
export const BUILDER_SYSTEM = [
  "You build one task group of Lente in a read-only clone at /workspace/lente.",
  "Read CLAUDE.md first and follow it. You have no secrets, no hardware and no push access.",
  "Leave your work as one cumulative patch from the base commit in /mnt/session/outputs/node.patch",
  "(stage everything, then `git diff --binary --cached <base>`) and a result.json beside it.",
  "Never touch .env, secrets.h, the data directory or audio files.",
].join(" ");

/** Read the key per call; the error names the path, never any content. */
export function readKey(file = process.env.LENTE_CLOUD_KEY_FILE ?? KEY_FILE): string {
  try {
    const key = readFileSync(file, "utf8").trim();
    if (key) return key;
  } catch {}
  throw new Error(`Claude Platform key file missing at ${file}`);
}

/** The GitHub read-only token for the repository mount; same rule as the key: the path in the error, never the content. */
export function readGithubToken(file = process.env.LENTE_GITHUB_TOKEN_FILE ?? GITHUB_TOKEN_FILE): string {
  try {
    const token = readFileSync(file, "utf8").trim();
    if (token) return token;
  } catch {}
  throw new Error(`GitHub read token file missing at ${file}`);
}

async function call(f: typeof fetch, key: string, path: string, body: unknown): Promise<{ id?: string; version?: number }> {
  const res = await f(`${API_BASE}${path}`, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { id?: string; version?: number };
}

/** Create what is not recorded, update what is. Returns the ids to record. */
export async function setupCloud(f: typeof fetch, key: string, ids: CloudIds): Promise<CloudIds> {
  const next = { ...ids };
  const agent = await call(f, key, ids.agentId ? `/agents/${ids.agentId}` : "/agents", agentBody(BUILDER_SYSTEM));
  next.agentId = agent.id ?? ids.agentId;
  if (agent.version !== undefined) next.agentVersion = agent.version;
  const env = await call(f, key, ids.environmentId ? `/environments/${ids.environmentId}` : "/environments", environmentBody());
  next.environmentId = env.id ?? ids.environmentId;
  return next;
}

export function loadIds(file = IDS_FILE): CloudIds {
  try { return JSON.parse(readFileSync(file, "utf8")) as CloudIds; } catch { return {}; }
}

export function saveIds(ids: CloudIds, file = IDS_FILE) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(ids, null, 2)}\n`);
}

if (import.meta.main) {
  const ids = loadIds();
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ mode: ids.agentId ? "update" : "create", agent: agentBody(BUILDER_SYSTEM), environment: environmentBody() }, null, 2));
  } else {
    try {
      const done = await setupCloud(fetch, readKey(), ids);
      saveIds(done);
      console.log(`${ids.agentId ? "updated" : "created"} agent ${done.agentId} and environment ${done.environmentId} (ids in ${IDS_FILE})`);
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }
}
