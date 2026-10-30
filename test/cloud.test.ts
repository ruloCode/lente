import assert from "node:assert/strict";
import { test } from "node:test";
import { agentBody, budgetBody, checkPatch, environmentBody, headers, initialState, messageBody, outcome, patchPaths, reduceEvents, sessionBody, traceUrl } from "../scripts/auto/cloud.ts";
import { setupCloud } from "../scripts/auto/cloud-setup.ts";

const ROOT = "/repo/.claude/worktrees/auto";
const SHA = "a".repeat(40);
const diff = (...paths: string[]) => paths.map((p) => `diff --git a/${p} b/${p}\nnew file mode 100644\n--- /dev/null\n+++ b/${p}\n@@ -0,0 +1 @@\n+x\n`).join("");

test("budget is an integer string in cents", () => {
  assert.deepEqual(budgetBody(6), { type: "limit", max_list_cost: { amount: "600", currency: "USD" } });
  assert.equal(budgetBody(0.5).max_list_cost.amount, "50");
  assert.throws(() => budgetBody(0));
});

test("bodies: agent without web tools, limited environment, read-only session at a sha", () => {
  assert.equal(agentBody("s").tools[0]!.configs.every((c) => !c.enabled), true);
  assert.equal(environmentBody().config.networking.type, "limited");
  const s = sessionBody({ agentId: "ag", environmentId: "en", sha: SHA, githubToken: "t", budgetUsd: 6, title: "n", node: "add-x" });
  assert.deepEqual(s.resources[0]!.checkout, { type: "commit", sha: SHA });
  assert.equal(s.budget.max_list_cost.amount, "600");
  assert.throws(() => sessionBody({ agentId: "a", environmentId: "e", sha: "main", githubToken: "t", budgetUsd: 1, title: "n", node: "x" }));
  assert.equal(messageBody("hi").events[0]!.type, "user.message");
  assert.equal(headers("k")["x-api-key"], "k");
  assert.equal(traceUrl("wrkspc_1", "sesn_2"), "https://platform.claude.com/workspaces/wrkspc_1/sessions/sesn_2");
  assert.throws(() => traceUrl("a/b", "s"));
});

test("reducer tracks status, stop reason, tools and cost, and dedupes by id", () => {
  const evs = [
    { id: "1", type: "session.status_running" },
    { id: "2", type: "agent.tool_use", name: "bash" },
    { id: "3", type: "session.usage", list_cost: { amount: "125" } },
    { id: "4", type: "session.status_idle", stop_reason: { type: "end_turn" } },
  ];
  let s = reduceEvents(initialState(), evs);
  s = reduceEvents(s, evs);
  assert.equal(s.phase, "idle");
  assert.equal(s.stopReason, "end_turn");
  assert.deepEqual(s.tools, ["bash"]);
  assert.equal(s.listCostUsd, 1.25);
  assert.deepEqual(outcome(s), { kind: "done" });
});

test("outcomes: budget, confirmation, error and still running", () => {
  const idle = (t: string) => reduceEvents(initialState(), [{ type: "session.status_idle", stop_reason: { type: t } }]);
  assert.deepEqual(outcome(idle("budget_reached")), { kind: "fail", reason: "cloud budget reached" });
  assert.equal(outcome(idle("requires_action")).kind, "fail");
  const err = reduceEvents(initialState(), [{ type: "session.error", error: { message: "boom" } }, { type: "session.status_terminated" }]);
  assert.deepEqual(outcome(err), { kind: "fail", reason: "cloud session error: boom" });
  assert.deepEqual(outcome(reduceEvents(initialState(), [{ type: "session.status_running" }])), { kind: "wait" });
});

test("patch check: clean patch passes, protected paths fail by name", () => {
  assert.equal(checkPatch(diff("src/a.ts", "docs/x.md"), ROOT), null);
  assert.deepEqual(patchPaths(diff("src/a.ts")), ["src/a.ts"]);
  assert.match(checkPatch(diff("src/a.ts", "firmware/lente-clip/secrets.h"), ROOT)!, /secrets\.h/);
  for (const p of [".env", ".env.local", "data/day.json", "recordings/a.txt", "eval/audio/q.wav", "../x", ".git/config"]) assert.ok(checkPatch(diff(p), ROOT), p);
  assert.equal(checkPatch(diff(".env.example"), ROOT), null);
  assert.ok(checkPatch("", ROOT));
  assert.ok(checkPatch("not a diff", ROOT));
  assert.ok(checkPatch("diff --git a/a.ts b/b.ts\nrename from a.ts\nrename to data/b.ts\n", ROOT));
});

test("setup creates once, then updates in place", async () => {
  const calls: string[] = [];
  const fake = (async (url: string, init: { headers: Record<string, string> }) => {
    const path = url.replace("https://api.anthropic.com/v1", "");
    calls.push(`POST ${path}`);
    assert.equal(init.headers["x-api-key"], "k");
    const id = path.split("/")[2] ?? (path === "/agents" ? "agent_1" : "env_1");
    return new Response(JSON.stringify({ id, version: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
  const first = await setupCloud(fake, "k", {});
  assert.deepEqual(calls, ["POST /agents", "POST /environments"]);
  assert.deepEqual([first.agentId, first.environmentId], ["agent_1", "env_1"]);
  calls.length = 0;
  const second = await setupCloud(fake, "k", first);
  assert.deepEqual(calls, ["POST /agents/agent_1", "POST /environments/env_1"]);
  assert.equal(second.agentId, "agent_1");
});
