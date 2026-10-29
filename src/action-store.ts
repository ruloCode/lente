// Pending actions the closing agent proposed, as one JSON file (data/actions.json, git-ignored).
// A file, not memory: pending actions must survive a hub restart, and nothing in here runs a tool.
// Running happens in the hub, only after `decide` returns an approval for that specific action.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Proposal } from "./agent-loop.ts";

export type ActionStatus = "pending" | "approved" | "rejected" | "failed";

export interface PendingAction {
  id: string;
  meetingId: string;
  tool: string;
  /** What the model proposed; kept so the trace can show an edit against it. */
  proposedArgs: Record<string, unknown>;
  /** What will run: the proposal, or the wearer's edit of it. */
  args: Record<string, unknown>;
  evidence: string[];
  status: ActionStatus;
  createdAt: number;
  decidedAt?: number;
  /** The tool's result once approved and run, or the reason it failed. */
  outcome?: unknown;
}

export class ActionStore {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): PendingAction[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as PendingAction[]) : [];
    } catch (error) {
      console.error(`[actions] could not read ${this.file}: ${(error as Error).message}`);
      return [];
    }
  }

  get(id: string): PendingAction | undefined {
    return this.list().find((a) => a.id === id);
  }

  /** Queues proposals as pending. Nothing runs here. */
  addAll(meetingId: string, proposals: Proposal[], now: number): PendingAction[] {
    const all = this.list();
    const added = proposals.map((p, i): PendingAction => ({
      id: `a${now}-${all.length + i + 1}`,
      meetingId,
      tool: p.tool,
      proposedArgs: p.args,
      args: p.args,
      evidence: p.evidence,
      status: "pending",
      createdAt: now,
    }));
    this.write([...all, ...added]);
    return added;
  }

  save(action: PendingAction): void {
    this.write(this.list().map((a) => (a.id === action.id ? action : a)));
  }

  /** Drops every action of a meeting, whatever its status (the meeting was deleted). */
  removeMeeting(meetingId: string): number {
    const all = this.list();
    const kept = all.filter((a) => a.meetingId !== meetingId);
    if (kept.length !== all.length) this.write(kept);
    return all.length - kept.length;
  }

  removeAll(): void {
    if (this.list().length) this.write([]);
  }

  private write(actions: PendingAction[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(actions, null, 2) + "\n");
  }
}

export type Decision =
  | { decision: "approve"; args?: Record<string, unknown> }
  | { decision: "reject" };

export type DecideResult =
  | { ok: true; action: PendingAction; run: boolean }
  | { ok: false; status: number; error: string };

/** Parses the phone's request body; anything odd is refused rather than guessed. */
export function parseDecision(body: unknown): { id: string; decision: Decision } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string") return undefined;
  if (b.decision === "reject") return { id: b.id, decision: { decision: "reject" } };
  if (b.decision !== "approve") return undefined;
  const raw = typeof b.args === "object" && b.args !== null && !Array.isArray(b.args) ? (b.args as Record<string, unknown>) : undefined;
  // An emptied optional field (due, note) means "none": it is left out, not sent as "".
  const args = raw && Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
  return { id: b.id, decision: { decision: "approve", args } };
}

/**
 * Pure: the only way an action leaves "pending". `run` is true exactly when this call approved it,
 * so a repeated tap (or a retry after a restart) can never run an action twice.
 */
export function decide(action: PendingAction | undefined, d: Decision, now: number): DecideResult {
  if (!action) return { ok: false, status: 404, error: "no such action" };
  if (action.status !== "pending") return { ok: false, status: 409, error: `action already ${action.status}` };
  if (d.decision === "reject") return { ok: true, run: false, action: { ...action, status: "rejected", decidedAt: now } };
  return { ok: true, run: true, action: { ...action, status: "approved", args: d.args ?? action.args, decidedAt: now } };
}
