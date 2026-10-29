// The closing agent's loop: plan (read-only tools, ends with propose_actions) then act
// (one approved action at a time). Tools with an external effect never run in the plan phase.
// Pure logic: the model call is injected (`AgentModel`), so the wire format lives in one adapter.

/** Model steps per meeting; the spec's bound on autonomy. */
export const MAX_AGENT_STEPS = 8;
/** Proposals shown to the wearer, ranked by evidence count. */
export const MAX_PROPOSALS = 5;
export const PROPOSE_TOOL = "propose_actions";

export interface AgentTool {
  name: string;
  description: string;
  /** JSON schema of the arguments. */
  parameters: Record<string, unknown>;
  /** "external" tools only ever run after approval, in `runApproved`. */
  effect: "none" | "external";
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelStep {
  text?: string;
  toolCalls: ToolCall[];
  usage?: ModelUsage;
}

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

/** Offered tools are names plus schemas; the adapter maps them to the provider's format. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type AgentModel = (messages: AgentMessage[], tools: ToolSpec[]) => Promise<ModelStep>;

export interface Proposal {
  tool: string;
  args: Record<string, unknown>;
  /** Turn ids the action relies on. */
  evidence: string[];
}

export type StopReason = "proposed" | "no-actions" | "step-limit" | "model-error";

export type TraceStep =
  | { kind: "model"; step: number; ms: number; usage?: ModelUsage; text?: string; calls: string[] }
  | { kind: "tool"; step: number; name: string; args: Record<string, unknown>; result: unknown; ok: boolean }
  | { kind: "queued"; step: number; tool: string; reason: string }
  | { kind: "dropped"; tool: string; reason: string }
  | { kind: "end"; reason: StopReason; steps: number; detail?: string };

export interface PlanResult {
  proposals: Proposal[];
  stopped: StopReason;
  steps: number;
  trace: TraceStep[];
}

/** The propose_actions tool is the plan phase's terminator; its schema is fixed here. */
export function proposeSpec(toolNames: string[]): ToolSpec {
  return {
    name: PROPOSE_TOOL,
    description: `Finish planning with the follow-up actions to offer the wearer (at most ${MAX_PROPOSALS}). Every action cites the turn ids it relies on.`,
    parameters: {
      type: "object",
      required: ["actions"],
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["tool", "args", "evidence"],
            properties: {
              tool: { type: "string", enum: toolNames },
              args: { type: "object" },
              evidence: { type: "array", items: { type: "string" }, description: "Turn ids such as t3" },
            },
          },
        },
      },
    },
  };
}

function asProposal(raw: unknown): Proposal | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.tool !== "string") return undefined;
  const args = typeof r.args === "object" && r.args !== null && !Array.isArray(r.args) ? (r.args as Record<string, unknown>) : {};
  const evidence = Array.isArray(r.evidence) ? r.evidence.filter((e): e is string => typeof e === "string") : [];
  return { tool: r.tool, args, evidence };
}

export function parseProposals(args: Record<string, unknown>): Proposal[] {
  if (!Array.isArray(args.actions)) return [];
  return args.actions.map(asProposal).filter((p): p is Proposal => p !== undefined);
}

/**
 * Keeps only evidence ids that exist in the meeting and drops proposals left with none.
 * Survivors are ranked by evidence count and capped.
 */
export function resolveEvidence(
  proposals: Proposal[],
  turnIds: Iterable<string>,
): { kept: Proposal[]; dropped: { proposal: Proposal; reason: string }[] } {
  const known = new Set(turnIds);
  const kept: Proposal[] = [];
  const dropped: { proposal: Proposal; reason: string }[] = [];
  for (const p of proposals) {
    const evidence = [...new Set(p.evidence.filter((id) => known.has(id)))];
    if (evidence.length === 0) dropped.push({ proposal: p, reason: p.evidence.length ? "cites no turn of this meeting" : "cites no evidence" });
    else kept.push({ ...p, evidence });
  }
  kept.sort((a, b) => b.evidence.length - a.evidence.length);
  for (const p of kept.splice(MAX_PROPOSALS)) dropped.push({ proposal: p, reason: `over the cap of ${MAX_PROPOSALS}` });
  return { kept, dropped };
}

export interface PlanOptions {
  model: AgentModel;
  tools: AgentTool[];
  system: string;
  /** The meeting record as the first user message. */
  context: string;
  now?: () => number;
}

/**
 * Phase 1. Read-only tools run and feed back; an external tool the model calls directly is
 * queued as a proposal (no evidence yet, so it is dropped later unless the model also cites it).
 */
export async function planActions(opts: PlanOptions): Promise<PlanResult> {
  const now = opts.now ?? Date.now;
  const registry = new Map(opts.tools.map((t) => [t.name, t]));
  const specs: ToolSpec[] = [
    ...opts.tools.map(({ name, description, parameters }) => ({ name, description, parameters })),
    proposeSpec(opts.tools.map((t) => t.name)),
  ];
  const messages: AgentMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.context },
  ];
  const trace: TraceStep[] = [];
  const proposals: Proposal[] = [];
  const end = (stopped: StopReason, steps: number, detail?: string): PlanResult => {
    trace.push({ kind: "end", reason: stopped, steps, detail });
    return { proposals, stopped, steps, trace };
  };

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    const started = now();
    let reply: ModelStep;
    try {
      reply = await opts.model(messages, specs);
    } catch (err) {
      return end("model-error", step - 1, err instanceof Error ? err.message : String(err));
    }
    trace.push({ kind: "model", step, ms: now() - started, usage: reply.usage, text: reply.text, calls: reply.toolCalls.map((c) => c.name) });
    if (reply.toolCalls.length === 0) return end("no-actions", step, "the model made no tool call");
    messages.push({ role: "assistant", content: reply.text ?? "", toolCalls: reply.toolCalls });

    let finished = false;
    for (const call of reply.toolCalls) {
      if (call.name === PROPOSE_TOOL) {
        proposals.push(...parseProposals(call.args));
        finished = true;
        continue;
      }
      const tool = registry.get(call.name);
      let result: unknown;
      let ok = true;
      if (!tool) {
        result = `unknown tool ${call.name}`;
        ok = false;
      } else if (tool.effect === "external") {
        // Never run before approval: hand it to the wearer as a proposal instead.
        proposals.push({ tool: call.name, args: call.args, evidence: [] });
        trace.push({ kind: "queued", step, tool: call.name, reason: "external effect needs approval" });
        result = "queued for the wearer's approval; it has not run";
        ok = false;
      } else {
        try {
          result = await tool.handler(call.args);
        } catch (err) {
          result = err instanceof Error ? err.message : String(err);
          ok = false;
        }
      }
      if (!tool || tool.effect !== "external") trace.push({ kind: "tool", step, name: call.name, args: call.args, result, ok });
      messages.push({ role: "tool", callId: call.id, name: call.name, content: typeof result === "string" ? result : JSON.stringify(result) });
    }
    if (finished) return end("proposed", step);
  }
  return end("step-limit", MAX_AGENT_STEPS, `no ${PROPOSE_TOOL} after ${MAX_AGENT_STEPS} steps`);
}

/** Phase 2: runs one approved action with the (possibly edited) arguments it was approved with. */
export async function runApproved(
  tools: AgentTool[],
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const def = tools.find((t) => t.name === tool);
  if (!def) return { ok: false, error: `unknown tool ${tool}` };
  try {
    return { ok: true, result: await def.handler(args) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
