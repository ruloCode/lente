import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_AGENT_STEPS,
  MAX_PROPOSALS,
  PROPOSE_TOOL,
  planActions,
  resolveEvidence,
  runApproved,
  type AgentModel,
  type AgentTool,
  type ModelStep,
} from "../src/agent-loop.ts";

function script(steps: ModelStep[]): { model: AgentModel; seen: number[] } {
  const seen: number[] = [];
  let i = 0;
  return {
    seen,
    model: async (messages) => {
      seen.push(messages.length);
      const step = steps[i++];
      if (!step) throw new Error("script ran out");
      return step;
    },
  };
}

const call = (name: string, args: Record<string, unknown>, id = name) => ({ id, name, args });
const readTool = (log: string[]): AgentTool => ({
  name: "get_meeting",
  description: "meeting record",
  parameters: { type: "object" },
  effect: "none",
  handler: () => {
    log.push("get_meeting");
    return { turns: ["t1"] };
  },
});
const base = { system: "plan", context: "meeting" };

test("plan: reads a tool, then ends with proposals", async () => {
  const log: string[] = [];
  const { model, seen } = script([
    { toolCalls: [call("get_meeting", {})] },
    { toolCalls: [call(PROPOSE_TOOL, { actions: [{ tool: "create_task", args: { text: "send deck" }, evidence: ["t1"] }] })] },
  ]);
  const r = await planActions({ ...base, model, tools: [readTool(log)] });
  assert.equal(r.stopped, "proposed");
  assert.equal(r.steps, 2);
  assert.deepEqual(log, ["get_meeting"]);
  assert.deepEqual(r.proposals, [{ tool: "create_task", args: { text: "send deck" }, evidence: ["t1"] }]);
  assert.ok(seen[1]! > seen[0]!, "tool result was fed back");
  assert.deepEqual(r.trace.map((t) => t.kind), ["model", "tool", "model", "end"]);
});

test("early stop: no tool call ends the run without proposals", async () => {
  const { model } = script([{ text: "nothing to do", toolCalls: [] }]);
  const r = await planActions({ ...base, model, tools: [] });
  assert.equal(r.stopped, "no-actions");
  assert.equal(r.steps, 1);
  assert.deepEqual(r.proposals, []);
});

test("step limit: stops at eight steps and says so", async () => {
  const log: string[] = [];
  const { model } = script(Array.from({ length: 20 }, () => ({ toolCalls: [call("get_meeting", {})] })));
  const r = await planActions({ ...base, model, tools: [readTool(log)] });
  assert.equal(r.stopped, "step-limit");
  assert.equal(log.length, MAX_AGENT_STEPS);
  const last = r.trace.at(-1);
  assert.equal(last?.kind, "end");
});

test("step limit keeps proposals made so far", async () => {
  const steps: ModelStep[] = [
    { toolCalls: [call("create_task", { text: "x" }), call("get_meeting", {})] },
    ...Array.from({ length: 10 }, () => ({ toolCalls: [call("get_meeting", {})] })),
  ];
  const ext: AgentTool = { name: "create_task", description: "", parameters: {}, effect: "external", handler: () => assert.fail("ran") };
  const r = await planActions({ ...base, model: script(steps).model, tools: [readTool([]), ext] });
  assert.equal(r.stopped, "step-limit");
  assert.equal(r.proposals.length, 1);
});

test("external guard: an external tool is queued, never run, in the plan phase", async () => {
  let ran = false;
  const ext: AgentTool = { name: "draft_email", description: "", parameters: {}, effect: "external", handler: () => ((ran = true), "sent") };
  const { model } = script([{ toolCalls: [call("draft_email", { body: "hi" })] }, { toolCalls: [call(PROPOSE_TOOL, { actions: [] })] }]);
  const r = await planActions({ ...base, model, tools: [ext] });
  assert.equal(ran, false);
  assert.deepEqual(r.proposals, [{ tool: "draft_email", args: { body: "hi" }, evidence: [] }]);
  assert.ok(r.trace.some((t) => t.kind === "queued"));
});

test("unknown tool and handler errors go back to the model, not the run", async () => {
  const bad: AgentTool = { name: "boom", description: "", parameters: {}, effect: "none", handler: () => { throw new Error("disk"); } };
  const { model } = script([{ toolCalls: [call("nope", {}), call("boom", {})] }, { toolCalls: [call(PROPOSE_TOOL, { actions: [] })] }]);
  const r = await planActions({ ...base, model, tools: [bad] });
  assert.equal(r.stopped, "proposed");
  assert.deepEqual(r.trace.filter((t) => t.kind === "tool").map((t) => t.kind === "tool" && t.ok), [false, false]);
});

test("model failure ends the run with the reason", async () => {
  const r = await planActions({ ...base, model: async () => { throw new Error("503"); }, tools: [] });
  assert.equal(r.stopped, "model-error");
  assert.deepEqual(r.trace.at(-1), { kind: "end", reason: "model-error", steps: 0, detail: "503" });
});

test("runApproved runs the edited arguments and reports failure", async () => {
  const seen: unknown[] = [];
  const tool: AgentTool = { name: "create_task", description: "", parameters: {}, effect: "external", handler: (a) => (seen.push(a), "ok") };
  assert.deepEqual(await runApproved([tool], "create_task", { text: "edited" }), { ok: true, result: "ok" });
  assert.deepEqual(seen, [{ text: "edited" }]);
  assert.deepEqual(await runApproved([tool], "nope", {}), { ok: false, error: "unknown tool nope" });
});

test("evidence: ungrounded proposals are dropped, valid ids kept", () => {
  const { kept, dropped } = resolveEvidence(
    [
      { tool: "create_task", args: {}, evidence: ["t1", "t99"] },
      { tool: "create_task", args: {}, evidence: ["t99"] },
      { tool: "draft_email", args: {}, evidence: [] },
    ],
    ["t1", "t2"],
  );
  assert.deepEqual(kept, [{ tool: "create_task", args: {}, evidence: ["t1"] }]);
  assert.equal(dropped.length, 2);
  assert.match(dropped[0]!.reason, /no turn/);
  assert.match(dropped[1]!.reason, /no evidence/);
});

test("evidence: ranked by evidence count and capped at five", () => {
  const ids = ["t1", "t2", "t3", "t4"];
  const proposals = Array.from({ length: 7 }, (_, i) => ({ tool: "create_task", args: { i }, evidence: ids.slice(0, (i % 4) + 1) }));
  const { kept, dropped } = resolveEvidence(proposals, ids);
  assert.equal(kept.length, MAX_PROPOSALS);
  assert.equal(dropped.length, 2);
  assert.equal(kept[0]!.evidence.length, 4);
});
