// The cloud lane's pure parts: request bodies for Claude Managed Agents, the budget in cents, the
// reducer over a session's events and the check of a downloaded patch. No sockets, no files:
// scripts/auto/cloud-setup.ts and the runner do the calls. API shapes: docs/kb/claude-managed-agents.md.
import { checkWrite } from "./policy.ts";

export const API_BASE = "https://api.anthropic.com/v1";
export const API_VERSION = "2023-06-01";
export const BETA = "managed-agents-2026-04-01";
export const AGENT_NAME = "lente-cloud-builder";
export const ENVIRONMENT_NAME = "lente-cloud-sandbox";
export const AGENT_MODEL = "claude-opus-5-5";
export const REPO_URL = "https://github.com/ruloCode/lente";
export const OUTPUTS_DIR = "/mnt/session/outputs";
export const PATCH_FILE = "node.patch";
export const RESULT_FILE = "result.json";
export const MAX_PATCH_BYTES = 2_000_000;
const WORKSPACE_ID_PATTERN = /^[\w-]+$/;

/** Headers for every call; the key goes only here. */
export function headers(key: string): Record<string, string> {
  return { "x-api-key": key, "anthropic-version": API_VERSION, "anthropic-beta": BETA, "content-type": "application/json" };
}

export function agentBody(system: string) {
  return {
    name: AGENT_NAME,
    model: AGENT_MODEL,
    system,
    tools: [{
      type: "agent_toolset_20260401",
      default_config: { enabled: true, permission_policy: { type: "always_allow" } },
      configs: [{ name: "web_search", enabled: false }, { name: "web_fetch", enabled: false }],
    }],
  };
}

export function environmentBody() {
  return { name: ENVIRONMENT_NAME, config: { type: "cloud", networking: { type: "limited", allow_package_managers: true, allowed_hosts: [] as string[] } } };
}

/** USD to the API's budget: an integer string in cents (6 → "600"). */
export function budgetBody(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`budget must be a positive number of USD, got ${usd}`);
  return { type: "limit", max_list_cost: { amount: String(Math.round(usd * 100)), currency: "USD" } };
}

export type SessionInput = { agentId: string; environmentId: string; sha: string; githubToken: string; budgetUsd: number; title: string; node: string };

/** One session per node, the repository mounted read-only at the exact commit. */
export function sessionBody(i: SessionInput) {
  if (!/^[0-9a-f]{40}$/.test(i.sha)) throw new Error(`session needs a full commit sha, got "${i.sha}"`);
  return {
    agent: i.agentId,
    environment_id: i.environmentId,
    resources: [{ type: "github_repository", url: REPO_URL, authorization_token: i.githubToken, checkout: { type: "commit", sha: i.sha } }],
    budget: budgetBody(i.budgetUsd),
    title: i.title,
    metadata: { node: i.node },
  };
}

export function messageBody(text: string) {
  return { events: [{ type: "user.message", content: [{ type: "text", text }] }] };
}

export function traceUrl(workspaceId: string, sessionId: string): string {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) throw new Error("workspace id looks wrong: copy it from the Console URL");
  return `https://platform.claude.com/workspaces/${workspaceId}/sessions/${sessionId}`;
}

export type Phase = "pending" | "running" | "idle" | "terminated";
export type StopReason = "end_turn" | "requires_action" | "budget_reached" | (string & {});
export type SessionState = { phase: Phase; stopReason?: StopReason; error?: string; tools: string[]; listCostUsd: number; seen: string[] };
export type SessionEvent = { id?: string; type: string; [k: string]: unknown };

export const initialState = (): SessionState => ({ phase: "pending", tools: [], listCostUsd: 0, seen: [] });

/** Fold events into the state, ignoring ids already seen (a reopened stream repeats events). */
export function reduceEvents(state: SessionState, events: SessionEvent[]): SessionState {
  const next: SessionState = { ...state, tools: [...state.tools], seen: [...state.seen] };
  for (const ev of events) {
    if (ev.id) {
      if (next.seen.includes(ev.id)) continue;
      next.seen.push(ev.id);
    }
    switch (ev.type) {
      case "session.status_running": case "session.status_rescheduling":
        next.phase = "running"; next.stopReason = undefined; break;
      case "session.status_idle":
        next.phase = "idle";
        next.stopReason = (ev.stop_reason as { type?: string } | undefined)?.type;
        break;
      case "session.status_terminated": next.phase = "terminated"; break;
      case "session.error": {
        const e = ev.error as { message?: string } | string | undefined;
        next.error = typeof e === "string" ? e : (e?.message ?? (typeof ev.message === "string" ? ev.message : "session error"));
        break;
      }
      case "agent.tool_use": case "agent.mcp_tool_use": case "agent.custom_tool_use":
        if (typeof ev.name === "string") next.tools.push(ev.name);
        break;
      case "session.usage": {
        const cost = costUsd(ev);
        if (cost !== undefined) next.listCostUsd = cost;
        break;
      }
    }
  }
  return next;
}

// session.usage is cumulative, with the list cost as a cents string (unverified until a real call).
function costUsd(ev: SessionEvent): number | undefined {
  const raw = (ev.list_cost as { amount?: string } | undefined)?.amount ?? (ev.usage as { list_cost?: { amount?: string } } | undefined)?.list_cost?.amount;
  const cents = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(cents) ? cents / 100 : undefined;
}

export type Outcome = { kind: "done" } | { kind: "fail"; reason: string } | { kind: "wait" };

/** What the runner does with the session as it stands. */
export function outcome(state: SessionState): Outcome {
  if (state.phase === "idle") {
    if (state.stopReason === "end_turn") return { kind: "done" };
    if (state.stopReason === "budget_reached") return { kind: "fail", reason: "cloud budget reached" };
    if (state.stopReason === "requires_action") return { kind: "fail", reason: "cloud session asked for a tool confirmation (interrupt it)" };
    return { kind: "fail", reason: `cloud session stopped: ${state.stopReason ?? "unknown reason"}` };
  }
  if (state.phase === "terminated") return { kind: "fail", reason: state.error ? `cloud session error: ${state.error}` : "cloud session terminated" };
  if (state.error) return { kind: "fail", reason: `cloud session error: ${state.error}` };
  return { kind: "wait" };
}

const FORBIDDEN = /(^|\/)\.env(\.(?!example$)[\w.-]*)?$|(^|\/)secrets\.h$|^data\/|^recordings\/|\.(wav|pcm)$/;

/** Every path a git-format diff touches, old and new names. */
export function patchPaths(patch: string): string[] {
  const out = new Set<string>();
  const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
  for (const line of patch.split("\n")) {
    let m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(line);
    if (m) { out.add(m[1]!); out.add(m[2]!); continue; }
    m = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
    if (m) out.add(unquote(m[1]!));
  }
  return [...out];
}

/** Why a downloaded patch must not be applied, or null. Names every offending path. */
export function checkPatch(patch: string, root: string): string | null {
  if (!patch.trim()) return "the cloud patch is empty";
  if (Buffer.byteLength(patch) > MAX_PATCH_BYTES) return `the cloud patch is over ${MAX_PATCH_BYTES} bytes`;
  const paths = patchPaths(patch);
  if (!paths.length) return "the cloud patch has no git file headers";
  const bad = paths.filter((p) => p.startsWith("/") || p.split("/").includes("..") || p.startsWith(".git/") || FORBIDDEN.test(p) || checkWrite(p, { auto: true, root }) !== null);
  return bad.length ? `the cloud patch touches protected paths: ${bad.join(", ")}` : null;
}
