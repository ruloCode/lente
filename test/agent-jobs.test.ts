// add-agent-bridge 4.1 and 4.2: jobs as actions, their states, and the chat's command intent. Pure.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PendingAction } from "../src/action-store.ts";
import { INSTRUCTION_MAX_CHARS, SUMMARY_MAX_CHARS, TOOL_RUN_AGENT, asksForAction, chatCommand, claim, finish, jobArgs, parseResult, proposedAnswer, queued, queuedJobs } from "../src/agent-jobs.ts";
import { parseAsk } from "../src/ask.ts";

const titles = new Map([["k1", "PROBE-task title"]]);
const title = (id: string) => titles.get(id);
const action = (extra: Partial<PendingAction> = {}): PendingAction => ({ id: "a1", meetingId: "", tool: TOOL_RUN_AGENT, proposedArgs: {}, args: { agent: "claude", instruction: "PROBE-do" }, evidence: [], status: "pending", createdAt: 1, ...extra });

test("jobArgs: an instruction or a task, a known agent, bounded text", () => {
  assert.deepEqual(jobArgs({ instruction: "  PROBE-do it  " }, title), { ok: true, args: { agent: "claude", instruction: "PROBE-do it" } });
  assert.deepEqual(jobArgs({ taskId: "k1", agent: "codex", workdir: "lente" }, title), { ok: true, args: { agent: "codex", instruction: "PROBE-task title", workdir: "lente", taskId: "k1" } });
  assert.deepEqual(jobArgs({ taskId: "k1", instruction: "PROBE-own words" }, title).ok && jobArgs({ taskId: "k1", instruction: "PROBE-own words" }, title), { ok: true, args: { agent: "claude", instruction: "PROBE-own words", taskId: "k1" } });
  assert.deepEqual(jobArgs({ taskId: "k9" }, title), { ok: false, status: 404, error: "no such task" });
  assert.equal(jobArgs({ agent: "gpt" , instruction: "x" }, title).ok, false);
  assert.equal(jobArgs({}, title).ok, false);
  assert.equal(jobArgs({ instruction: "x".repeat(INSTRUCTION_MAX_CHARS + 1) }, title).ok, false);
});

test("a job's life: pending is invisible, approval queues, one claim, then done or failed", () => {
  const pending = action();
  assert.deepEqual(queuedJobs([pending, action({ id: "a2", status: "rejected" })]), [], "pending and rejected jobs never reach the bridge");
  assert.deepEqual(claim(pending, 5), { ok: false, status: 409, error: "the job is not approved" });

  const approved = queued({ ...pending, status: "approved", decidedAt: 2 });
  const other = { ...action({ id: "x", tool: "draft_email", status: "approved" }), outcome: { state: "queued" } };
  assert.deepEqual(queuedJobs([approved, other]), [{ id: "a1", agent: "claude", instruction: "PROBE-do" }]);

  const claimed = claim(approved, 5);
  assert.ok(claimed.ok);
  assert.deepEqual(claimed.action.outcome, { state: "running", startedAt: 5 });
  assert.deepEqual(queuedJobs([claimed.action]), []);
  assert.equal(claim(claimed.action, 6).ok, false, "a second claim is refused");
  assert.equal(claim(undefined, 6).ok, false);

  const done = finish(claimed.action, { exitCode: 0, summary: "PROBE-ok" }, 9);
  assert.ok(done.ok);
  assert.equal(done.action.status, "approved");
  assert.deepEqual(done.action.outcome, { state: "done", startedAt: 5, finishedAt: 9, exitCode: 0, summary: "PROBE-ok" });
  const failed = finish(claimed.action, { exitCode: 1, summary: "PROBE-bad" }, 9);
  assert.ok(failed.ok);
  assert.equal(failed.action.status, "failed");
  assert.equal(finish(done.action, { exitCode: 0, summary: "" }, 10).ok, false, "a finished job cannot finish again");
  assert.equal(finish(approved, { exitCode: 0, summary: "" }, 10).ok, false, "an unclaimed job cannot finish");
});

test("parseResult: an integer exit code, the summary cut to its last 2000 characters", () => {
  assert.deepEqual(parseResult({ exitCode: 0, summary: "ok" }), { exitCode: 0, summary: "ok" });
  assert.equal(parseResult({ exitCode: "0" }), undefined);
  assert.equal(parseResult(null), undefined);
  const long = parseResult({ exitCode: 1, summary: `${"a".repeat(3000)}END` })!;
  assert.equal(long.summary.length, SUMMARY_MAX_CHARS);
  assert.ok(long.summary.endsWith("END"));
});

test("asksForAction: imperatives and named agents pass, questions do not", () => {
  for (const q of ["Haz un resumen de la reunión en el README", "Que Claude actualice el README con los comandos nuevos", "que codex arregle el test que falla", "Claude, corre los tests", "Por favor ejecuta la migración en local", "Dile a Claude que prepare el informe", "fix the failing test", "Ejecuta: pnpm test"]) {
    assert.ok(asksForAction(q), q);
  }
  for (const q of ["¿Qué quedó con Ana?", "¿Quién prepara el informe?", "¿Qué dijo Claude en la reunión?", "¿Ejecutaron la migración?", "Resúmeme la última reunión", "hola"]) {
    assert.equal(asksForAction(q), false, q);
  }
});

test("chatCommand: needs both the model's intent and an action request; picks the named agent", () => {
  const raw = { intent: "command", agent: "claude", instruction: "PROBE-update the README" };
  assert.deepEqual(chatCommand(raw, "Que Claude actualice el README"), { agent: "claude", instruction: "PROBE-update the README" });
  assert.deepEqual(chatCommand(raw, "Que Codex actualice el README"), { agent: "codex", instruction: "PROBE-update the README" }, "the question's agent wins");
  assert.equal(chatCommand(raw, "¿Qué quedó con Ana?"), undefined, "a plain question never becomes a job");
  assert.equal(chatCommand({ ...raw, intent: "answer" }, "Haz el informe"), undefined);
  assert.deepEqual(chatCommand({ intent: "command", agent: "x", instruction: "" }, "Haz el informe"), { agent: "claude", instruction: "Haz el informe" });
  assert.match(proposedAnswer("codex", "PROBE"), /^Lo dejé en «Por aprobar»: Codex hará «PROBE»/);
});

test("parseAsk: a command comes back as a command, an answer stays an answer", () => {
  const raw = JSON.stringify({ intent: "command", found: true, answer: "", sources: [], agent: "claude", instruction: "PROBE-run the tests" });
  assert.deepEqual(parseAsk(raw, new Map(), "Claude, corre los tests"), { answer: "", sources: [], found: true, command: { agent: "claude", instruction: "PROBE-run the tests" } });
  assert.equal(parseAsk(raw, new Map(), "¿Corrieron los tests?").command, undefined);
  assert.equal(parseAsk(raw, new Map()).command, undefined, "without the question, no command");
});
