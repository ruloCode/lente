import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planActions, runApproved, type AgentModel } from "../src/agent-loop.ts";
import { TaskStore, emailDraft, meetingTools, reminderEvent, TOOL_CREATE_REMINDER, TOOL_CREATE_TASK, TOOL_DRAFT_EMAIL, TOOL_GLOSSARY, TOOL_MEETING, TOOL_TASKS } from "../src/agent-tools.ts";
import type { Meeting } from "../src/meetings.ts";

const meeting: Meeting = {
  id: "m20261028100000",
  title: "Sprint",
  startedAt: 0,
  status: "done",
  turns: [{ id: "t1", at: 0, text: "I will send the deck by Friday" }],
  notes: {
    summary: "Deck due",
    glossary: [{ term: "SOW", meaning: "statement of work", evidence: ["t1"] }],
    decisions: [],
    commitments: [{ what: "Send the deck", owner: "you", due: "2026-10-30", evidence: ["t1"] }],
    openQuestions: [],
  },
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lente-tools-"));
  const tasks = new TaskStore(join(dir, "tasks.json"));
  const remindersFile = join(dir, "reminders.ics");
  const tools = meetingTools({ meeting, tasks, remindersFile, now: () => 1_000 });
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  return { dir, tasks, remindersFile, tools, tool };
}

test("read-only tools return the record, glossary and task list", async () => {
  const { tool, tasks } = setup();
  assert.equal(tool(TOOL_MEETING).effect, "none");
  const rec = (await tool(TOOL_MEETING).handler({})) as { commitments: unknown[]; id: string };
  assert.equal(rec.id, meeting.id);
  assert.equal(rec.commitments.length, 1);
  assert.deepEqual(await tool(TOOL_GLOSSARY).handler({}), meeting.notes!.glossary);
  tasks.add({ title: "a", meetingId: "x", evidence: [] }, 1);
  const done = tasks.add({ title: "b", meetingId: "x", evidence: [] }, 2);
  tasks.setDone(done.id, true);
  assert.equal(((await tool(TOOL_TASKS).handler({})) as unknown[]).length, 2);
  assert.equal(((await tool(TOOL_TASKS).handler({ open: true })) as unknown[]).length, 1);
});

test("action tools are external, so the plan phase queues them instead of running", async () => {
  const { tools, tasks } = setup();
  for (const n of [TOOL_CREATE_TASK, TOOL_CREATE_REMINDER, TOOL_DRAFT_EMAIL]) assert.equal(tools.find((t) => t.name === n)!.effect, "external");
  const model: AgentModel = async () => ({ toolCalls: [{ id: "1", name: TOOL_CREATE_TASK, args: { title: "x" } }] });
  const plan = await planActions({ model, tools, system: "s", context: "c" });
  assert.equal(tasks.list().length, 0);
  assert.equal(plan.proposals[0].tool, TOOL_CREATE_TASK);
});

test("an approved task links to its meeting and persists", async () => {
  const { tools, dir } = setup();
  const r = await runApproved(tools, TOOL_CREATE_TASK, { title: "Send the deck", due: "2026-10-30", meetingId: "forged" });
  assert.ok(r.ok);
  const saved = new TaskStore(join(dir, "tasks.json")).list();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].meetingId, meeting.id);
  assert.equal(saved[0].due, "2026-10-30");
  assert.equal(saved[0].done, false);
  assert.equal((await runApproved(tools, TOOL_CREATE_TASK, { title: " " })).ok, false);
});

test("reminders accumulate in one valid .ics with an alarm a day before", async () => {
  const { tools, remindersFile } = setup();
  assert.ok((await runApproved(tools, TOOL_CREATE_REMINDER, { title: "Deck, final; v2", date: "2026-10-30" })).ok);
  assert.ok((await runApproved(tools, TOOL_CREATE_REMINDER, { title: "Other", date: "2026-11-02" })).ok);
  const ics = readFileSync(remindersFile, "utf8");
  assert.equal(ics.match(/BEGIN:VCALENDAR/g)!.length, 1);
  assert.equal(ics.match(/BEGIN:VEVENT/g)!.length, 2);
  assert.match(ics, /DTSTART:20261030T090000Z/);
  assert.match(ics, /TRIGGER:-PT24H/);
  assert.match(ics, /SUMMARY:Deck\\, final\\; v2/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((await runApproved(tools, TOOL_CREATE_REMINDER, { title: "x", date: "friday" })).ok, false);
  assert.match(reminderEvent({ title: "t", date: "2026-10-30", meetingId: "m" }, 0), /^BEGIN:VEVENT/);
});

test("an email is a draft: editable arguments, a mailto link, no send", async () => {
  const { tools } = setup();
  const original = { to: ["ana@example.com", "nope"], subject: "Follow-up", body: "Hi Ana,\nThe deck arrives Friday." };
  const edited = { ...original, body: "Hi Ana,\nThe deck arrives Monday." };
  const r = await runApproved(tools, TOOL_DRAFT_EMAIL, edited);
  assert.ok(r.ok);
  const draft = (r as { result: ReturnType<typeof emailDraft> }).result;
  assert.match(draft.body, /Monday/);
  assert.deepEqual(draft.to, ["ana@example.com"]);
  assert.ok(draft.mailto.startsWith("mailto:ana%40example.com?subject=Follow-up&body="));
  assert.ok(decodeURIComponent(draft.mailto).includes("Monday"));
  assert.throws(() => emailDraft({ subject: "s" }), /needs a body/);
  const source = readFileSync(new URL("../src/agent-tools.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|node:net|node:http|smtp/i);
});
