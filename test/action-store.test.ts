import { strict as assert } from "node:assert";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ActionStore, decide, parseDecision } from "../src/action-store.ts";
import { TraceWriter, traceLine } from "../src/agent-trace.ts";
import { planActions, PROPOSE_TOOL, type ModelStep } from "../src/agent-loop.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "lente-actions-"));
const proposals = [
  { tool: "create_task", args: { title: "Send the deck" }, evidence: ["t2"] },
  { tool: "draft_email", args: { subject: "Hi", body: "Thanks" }, evidence: ["t3", "t4"] },
];

test("proposals are stored pending and survive a new store on the same file (hub restart)", () => {
  const file = join(tmp(), "actions.json");
  new ActionStore(file).addAll("m20261028100000", proposals, 1000);
  const after = new ActionStore(file).list();
  assert.equal(after.length, 2);
  assert.ok(after.every((a) => a.status === "pending" && a.decidedAt === undefined));
});

test("approve runs once, with the edited args; a second approve is refused", () => {
  const store = new ActionStore(join(tmp(), "a.json"));
  const [mail] = store.addAll("m20261028100000", [proposals[1]], 1);
  const first = decide(store.get(mail.id), { decision: "approve", args: { subject: "Hi", body: "Edited" } }, 5);
  assert.ok(first.ok && first.run);
  if (first.ok) {
    assert.equal(first.action.args.body, "Edited");
    assert.equal(first.action.proposedArgs.body, "Thanks");
    store.save(first.action);
  }
  const again = decide(store.get(mail.id), { decision: "approve" }, 6);
  assert.ok(!again.ok && again.status === 409);
});

test("reject never runs and sticks", () => {
  const store = new ActionStore(join(tmp(), "a.json"));
  const [task] = store.addAll("m20261028100000", [proposals[0]], 1);
  const r = decide(task, { decision: "reject" }, 2);
  assert.ok(r.ok && !r.run && r.action.status === "rejected");
  assert.ok(!decide({ ...task, status: "rejected" }, { decision: "approve" }, 3).ok);
});

test("unknown action and malformed bodies are refused", () => {
  assert.ok(!decide(undefined, { decision: "reject" }, 1).ok);
  assert.equal(parseDecision({ id: "a1", decision: "run" }), undefined);
  assert.equal(parseDecision(null), undefined);
  assert.deepEqual(parseDecision({ id: "a1", decision: "approve", args: { x: 1 } }), { id: "a1", decision: { decision: "approve", args: { x: 1 } } });
});

test("removeMeeting drops that meeting's actions only", () => {
  const store = new ActionStore(join(tmp(), "a.json"));
  store.addAll("m20261028100000", proposals, 1);
  store.addAll("m20261028110000", [proposals[0]], 2);
  assert.equal(store.removeMeeting("m20261028100000"), 2);
  assert.equal(store.list().length, 1);
});

test("a trace reads back in the order it was written, and is deleted with the meeting", () => {
  const dir = join(tmp(), "traces");
  const w = new TraceWriter(dir);
  const id = "m20261028100000";
  w.appendRun(id, [
    { kind: "model", step: 1, ms: 420, usage: { inputTokens: 900, outputTokens: 60 }, calls: ["get_meeting_record"] },
    { kind: "tool", step: 1, name: "get_meeting_record", args: {}, result: { id }, ok: true },
    { kind: "model", step: 2, ms: 300, calls: ["propose_actions"] },
    { kind: "dropped", tool: "create_task", reason: "cites no evidence" },
    { kind: "end", reason: "proposed", steps: 2 },
  ], 100);
  w.append(id, [
    { kind: "approval", at: 200, actionId: "a1", tool: "draft_email", decision: "approved", edited: true },
    { kind: "action", at: 201, actionId: "a1", tool: "draft_email", ok: true, result: "draft" },
  ]);
  const kinds = w.read(id).map((e) => e.kind);
  assert.deepEqual(kinds, ["model", "tool", "model", "dropped", "end", "approval", "action"]);
  assert.match(traceLine(w.read(id)[0]).detail, /420 ms · 900 in \/ 60 out · llama get_meeting_record/);
  assert.equal(w.read("../etc/passwd").length, 0);
  w.delete(id);
  assert.equal(w.read(id).length, 0);
  assert.ok(!existsSync(join(dir, `${id}.jsonl`)));
});

test("approving with emptied due or note leaves those fields out, not as empty strings", () => {
  const parsed = parseDecision({ id: "a1", decision: "approve", args: { title: "Send deck", due: "", note: "", to: [] } });
  assert.deepEqual(parsed, { id: "a1", decision: { decision: "approve", args: { title: "Send deck", to: [] } } });
  const store = new ActionStore(join(tmp(), "a.json"));
  const [task] = store.addAll("m20261028100000", [{ tool: "create_task", args: { title: "Send deck", due: "viernes" }, evidence: ["t1"] }], 1);
  const r = decide(task, parsed!.decision, 2);
  assert.ok(r.ok && !("due" in r.action.args) && !("note" in r.action.args));
});

test("every step of a planActions run shows up in the trace viewer lines, in order", async () => {
  const steps: ModelStep[] = [
    { toolCalls: [{ id: "1", name: "get_meeting", args: {} }], usage: { inputTokens: 500, outputTokens: 20 } },
    { toolCalls: [{ id: "2", name: PROPOSE_TOOL, args: { actions: [{ tool: "create_task", args: { text: "x" }, evidence: ["t1"] }] } }] },
  ];
  let i = 0;
  const r = await planActions({
    model: async () => steps[i++],
    tools: [{ name: "get_meeting", description: "m", parameters: { type: "object" }, effect: "none", handler: () => ({ turns: ["t1"] }) }],
    system: "plan",
    context: "meeting",
  });
  const w = new TraceWriter(join(tmp(), "traces"));
  const id = "m20261028120000";
  w.appendRun(id, r.trace, 1);
  const lines = w.read(id).map((e) => traceLine(e).label);
  assert.equal(lines.length, r.trace.length);
  assert.deepEqual(w.read(id).map((e) => e.kind), r.trace.map((t) => t.kind));
  assert.equal(r.trace.at(-1)?.kind, "end");
  assert.ok(lines.some((l) => l.includes("get_meeting")));
});
