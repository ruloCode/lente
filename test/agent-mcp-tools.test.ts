// add-agent-bridge 2.2: Lente's agent tools over a fake runtime API, with synthetic data only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_CALLS_BURST, AGENT_TOOLS, type AgentApi, CallLimiter, MEETING_CHARS_DEFAULT, type TaskView, agentServer } from "../src/agent-mcp-tools.ts";
import { McpError } from "../src/mcp.ts";
import type { AgentIdentity } from "../src/user-devices.ts";

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({ id, title: `PROBE-${id}`, who: "me", otherName: null, due: null, done: false, project: null, meetingId: null, createdAt: 1, ...extra });

function fakeApi() {
  const notes: string[][] = [];
  const seen: unknown[] = [];
  let paused = false;
  const tasks = [task("k1"), task("k2", { who: "lente" })];
  const api: AgentApi = {
    paused: () => paused,
    ask: async (q, project) => (project === "nope" ? "no_project" : { answer: `PROBE-answer to ${q}`, found: true, sources: [{ label: "PROBE meeting · 10:00", meetingId: "m1" }] }),
    searchMeetings: async (query, from, to) => (seen.push({ query, from, to }), [{ id: "m1", title: "PROBE", startedAt: 5, matches: [{ where: "title", line: "PROBE" }] }]),
    getMeeting: async (id, max) => (seen.push({ id, max }), id === "m1" ? { id, title: "PROBE" } : undefined),
    projects: async () => [{ id: "p1", name: "PROBE-project" }],
    tasks: async (f) => (f.project === "nope" ? "no_project" : tasks.filter((t) => (!f.who || t.who === f.who) && (!f.open || !t.done))),
    createTask: async (input) => (seen.push(input), task("k3", { title: input.title, who: input.who })),
    updateTask: async (id, patch) => (id === "k1" ? { ...tasks[0]!, ...patch } : undefined),
    completeTask: async (id) => (id === "k1" ? { ...tasks[0]!, done: true } : undefined),
    note: (tool, client, sentence) => void notes.push([tool, client, sentence]),
  };
  return { api, notes, seen, pause: (v: boolean) => (paused = v) };
}

const agent = (scopes: AgentIdentity["scopes"], deviceId = "d1"): AgentIdentity => ({ userId: "u1", deviceId, label: "Claude Code", scopes });
const structured = (r: { structuredContent?: Record<string, unknown> }) => r.structuredContent!;

test("a read token lists only the read tools; a tasks.write token gets the three writes too", () => {
  const { api } = fakeApi();
  const read = agentServer(agent(["read"]), api, new CallLimiter()).tools().map((t) => t.name);
  assert.deepEqual(read, ["ask_lente", "search_meetings", "get_meeting", "list_projects", "list_tasks"]);
  const write = agentServer(agent(["read", "tasks.write"]), api, new CallLimiter()).tools().map((t) => t.name);
  assert.deepEqual(write, [...read, "create_task", "update_task", "complete_task"]);
  assert.deepEqual(agentServer(agent(["agent.run"]), api, new CallLimiter()).tools(), [], "the bridge's token sees no tools");
  for (const t of AGENT_TOOLS) assert.equal((t.inputSchema as { additionalProperties: boolean }).additionalProperties, false, t.name);
});

test("a write tool called without its scope answers unauthorized and runs nothing", async () => {
  const { api, notes, seen } = fakeApi();
  const out = await agentServer(agent(["read"]), api, new CallLimiter()).call("create_task", { title: "PROBE-new" }, "");
  assert.equal(out.isError, true);
  assert.equal(structured(out).error, "unauthorized");
  assert.match(out.content[0]!.text, /^unauthorized: /);
  assert.equal(seen.length, 0);
  assert.equal(notes.length, 0);
});

test("every call that runs is noted with the tool, the token's label and a sentence, never the content", async () => {
  const { api, notes } = fakeApi();
  const server = agentServer(agent(["read", "tasks.write"]), api, new CallLimiter());
  await server.call("list_tasks", {}, "");
  await server.call("ask_lente", { question: "PROBE-secret question" }, "");
  assert.deepEqual(notes, [["list_tasks", "Claude Code", "Un agente consultó tus tareas"], ["ask_lente", "Claude Code", "Un agente le preguntó algo a tu memoria"]]);
  assert.ok(!JSON.stringify(notes).includes("PROBE"));
});

test("tools: answers, filters, not_found and argument checks", async () => {
  const { api, seen } = fakeApi();
  const server = agentServer(agent(["read", "tasks.write"]), api, new CallLimiter());
  assert.equal(structured(await server.call("ask_lente", { question: "  ¿Qué   quedó? " }, "")).answer, "PROBE-answer to ¿Qué quedó?");
  assert.equal(structured(await server.call("ask_lente", { question: "x", project: "nope" }, "")).error, "not_found");
  assert.equal(structured(await server.call("ask_lente", {}, "")).error, "invalid_arguments");
  assert.deepEqual((structured(await server.call("list_tasks", { who: "lente" }, "")).tasks as TaskView[]).map((t) => t.id), ["k2"]);
  assert.equal(structured(await server.call("list_tasks", { who: "boss" }, "")).error, "invalid_arguments");
  assert.equal(structured(await server.call("list_tasks", { project: "nope" }, "")).error, "not_found");

  await server.call("search_meetings", { query: "PROBE", from: "2026-11-01", to: "2026-11-01" }, "");
  assert.deepEqual(seen.at(-1), { query: "PROBE", from: "2026-11-01", to: "2026-11-01" });
  assert.equal(structured(await server.call("search_meetings", { query: "x", from: "ayer" }, "")).error, "invalid_arguments");

  assert.equal(structured(await server.call("get_meeting", { id: "m1" }, "")).id, "m1");
  assert.deepEqual(seen.at(-1), { id: "m1", max: MEETING_CHARS_DEFAULT });
  assert.equal(structured(await server.call("get_meeting", { id: "m9" }, "")).error, "not_found");
  assert.equal(structured(await server.call("get_meeting", { id: "m1", max_chars: 10 }, "")).error, "invalid_arguments");

  assert.equal((structured(await server.call("create_task", { title: "PROBE-new", who: "lente" }, "")).task as TaskView).who, "lente");
  assert.deepEqual(seen.at(-1), { title: "PROBE-new", who: "lente" });
  assert.equal((structured(await server.call("create_task", { title: "PROBE-default" }, "")).task as TaskView).who, "me");
  assert.equal(structured(await server.call("update_task", { id: "k1" }, "")).error, "invalid_arguments");
  assert.equal((structured(await server.call("update_task", { id: "k1", who: "other", other_name: "Ana" }, "")).task as TaskView).who, "other");
  assert.equal(structured(await server.call("complete_task", { id: "k9" }, "")).error, "not_found");
  assert.equal((structured(await server.call("complete_task", { id: "k1" }, "")).task as TaskView).done, true);
  await assert.rejects(server.call("rm_rf", {}, ""), McpError);
});

test("paused by the wearer: nothing runs", async () => {
  const { api, notes, pause } = fakeApi();
  pause(true);
  const out = await agentServer(agent(["read"]), api, new CallLimiter()).call("list_tasks", {}, "");
  assert.equal(structured(out).error, "paused_by_wearer");
  assert.equal(notes.length, 0);
});

test("rate limit: a burst of 60, then rate_limited, then one call back per second, per token", async () => {
  const { api } = fakeApi();
  let now = 0;
  const limiter = new CallLimiter();
  const server = agentServer(agent(["read"]), api, limiter, () => now);
  for (let i = 0; i < AGENT_CALLS_BURST; i++) assert.equal((await server.call("list_projects", {}, "")).isError, undefined, `call ${i + 1}`);
  assert.equal(structured(await server.call("list_projects", {}, "")).error, "rate_limited");
  assert.equal((await agentServer(agent(["read"], "d2"), api, limiter, () => now).call("list_projects", {}, "")).isError, undefined, "another token has its own bucket");
  now += 1000;
  assert.equal((await server.call("list_projects", {}, "")).isError, undefined);
  assert.equal(structured(await server.call("list_projects", {}, "")).error, "rate_limited");
});
