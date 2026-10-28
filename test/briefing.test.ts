import assert from "node:assert/strict";
import { test } from "node:test";
import { MEMORY_MAX_CHARS, briefingMessages, briefingSchema, citedSources, memoryPrefix, replyMessages, validateBriefing, withMemory } from "../src/briefing.ts";
import { mergeGlossary } from "../src/language-profile.ts";
import { type Meeting, newMeeting } from "../src/meetings.ts";

const DAY = Date.UTC(2026, 9, 27, 15, 0, 0);

function done(title: string, at: number, summary: string, commitments: Meeting["notes"] extends infer N ? (N extends { commitments: infer C } ? C : never) : never = []): Meeting {
  const m = newMeeting(title, at);
  m.status = "done";
  m.notes = { summary, decisions: [], commitments, openQuestions: [{ text: "Who owns the API?", evidence: ["t1"] }] };
  return m;
}

const sprint = done("Sprint review", DAY, "Ana asked for the estimate.", [{ what: "send the estimate", owner: "you", due: "Thursday", evidence: ["t2"] }]);
const kickoff = done("Kickoff", DAY - 86_400_000, "Scope agreed.");
const glossary = mergeGlossary([], [{ term: "GA", meaning: "disponibilidad general", example: "We reach GA in March." }], sprint.id, DAY);

test("no memory yields an empty prefix and leaves the task untouched", () => {
  assert.equal(memoryPrefix({ phrases: [], glossary: [], meetings: [] }), "");
  assert.equal(withMemory("", "TASK"), "TASK");
});

test("the prefix lists phrases, terms and meetings oldest first, with ids to cite", () => {
  const text = memoryPrefix({ phrases: ["get back to you"], glossary, meetings: [sprint, kickoff].sort((a, b) => a.startedAt - b.startedAt) });
  assert.match(text, /"get back to you"/);
  assert.match(text, /GA = disponibilidad general/);
  assert.ok(text.indexOf(kickoff.id) < text.indexOf(sprint.id));
  assert.match(text, new RegExp(`\\[${sprint.id} · 2026-10-27 · "Sprint review"\\]`));
  assert.match(text, /commitment \(the wearer, due Thursday\): send the estimate/);
});

test("a meeting still running or without notes is not remembered", () => {
  const running = newMeeting("Now", DAY);
  const text = memoryPrefix({ phrases: [], glossary: [], meetings: [running, { ...kickoff, notes: undefined }] });
  assert.equal(text, "");
});

test("the prefix only grows at the end: a newer meeting leaves the earlier bytes identical", () => {
  const before = memoryPrefix({ phrases: [], glossary, meetings: [kickoff] });
  const after = memoryPrefix({ phrases: [], glossary, meetings: [kickoff, sprint] });
  assert.ok(after.startsWith(before));
});

test("past the budget the oldest meetings drop first", () => {
  const long = (n: number) => done(`M${n}`, DAY + n * 60_000, "x".repeat(MEMORY_MAX_CHARS / 3));
  const meetings = [long(0), long(1), long(2), long(3)];
  const text = memoryPrefix({ phrases: [], glossary: [], meetings });
  assert.ok(text.length <= MEMORY_MAX_CHARS);
  assert.ok(!text.includes(meetings[0].id));
  assert.ok(text.includes(meetings[3].id));
});

test("the reply prompt puts the memory before the task and mentions the wearer's words only when there is memory", () => {
  const memory = memoryPrefix({ phrases: ["get back to you"], glossary: [], meetings: [] });
  const [system, user] = replyMessages(memory, "A: hi", "Can you do it?");
  assert.ok((system.content as string).startsWith(memory));
  assert.match(system.content as string, /words and phrasings the wearer already says/);
  assert.match(user.content as string, /Question just asked: Can you do it\?/);
  assert.doesNotMatch(replyMessages("", "A: hi", "Q?")[0].content as string, /memory above/);
});

test("the briefing schema limits sources to real meetings, or any string when there are none", () => {
  const withIds = briefingSchema(["m1"]) as any;
  assert.deepEqual(withIds.properties.items.items.properties.sources.items.enum, ["m1"]);
  const none = briefingSchema([]) as any;
  assert.equal(none.properties.items.items.properties.sources.items.enum, undefined);
});

test("briefing messages carry the title and the participants", () => {
  const [, user] = briefingMessages("MEM", "Sprint review", ["Ana"]);
  assert.match(user.content as string, /"Sprint review"/);
  assert.match(user.content as string, /Participants: Ana\./);
});

test("an owed item keeps its source; the second briefing cites the first meeting", () => {
  const raw = { items: [{ kind: "owed", text: "Le debes a Ana el estimado", sources: [sprint.id] }] };
  const { items, dropped } = validateBriefing(raw, [kickoff, sprint], glossary);
  assert.equal(dropped, 0);
  assert.deepEqual(items, [{ kind: "owed", text: "Le debes a Ana el estimado", sources: [sprint.id] }]);
  assert.deepEqual(citedSources(items, [kickoff, sprint]).map((s) => s.id), [sprint.id]);
});

test("items with no valid source are dropped and counted", () => {
  const raw = {
    items: [
      { kind: "owed", text: "Invented promise", sources: [] },
      { kind: "owed", text: "Wrong id", sources: ["m99999999999999"] },
      { kind: "open", text: "From a meeting without notes", sources: [newMeeting("x", DAY).id] },
      { kind: "open", text: "Real", sources: ["nope", kickoff.id] },
    ],
  };
  const { items, dropped } = validateBriefing(raw, [kickoff, newMeeting("x", DAY)], []);
  assert.equal(dropped, 3);
  assert.deepEqual(items, [{ kind: "open", text: "Real", sources: [kickoff.id] }]);
});

test("a term must be in the glossary and is sourced from where it was heard", () => {
  const raw = { items: [{ kind: "term", text: "ga", sources: [] }, { kind: "term", text: "SLA", sources: [sprint.id] }] };
  const { items, dropped } = validateBriefing(raw, [sprint], glossary);
  assert.equal(dropped, 1);
  assert.deepEqual(items, [{ kind: "term", text: "GA", sources: [sprint.id] }]);
});

test("phrases need no source but are capped at three; junk items are dropped", () => {
  const phrases = ["a", "b", "c", "d"].map((t) => ({ kind: "phrase", text: `Phrase ${t}`, sources: [] }));
  const { items, dropped } = validateBriefing({ items: [...phrases, { kind: "gossip", text: "x", sources: [] }, null, { kind: "phrase", text: " ", sources: [] }] }, [], []);
  assert.equal(items.length, 3);
  assert.equal(dropped, 4);
});

test("nothing remembered still gives phrases and drops every claim", () => {
  const raw = { items: [{ kind: "owed", text: "x", sources: [sprint.id] }, { kind: "phrase", text: "Could you repeat that?", sources: [] }] };
  const { items } = validateBriefing(raw, [], []);
  assert.deepEqual(items.map((i) => i.kind), ["phrase"]);
});

test("garbage from the model yields an empty briefing, not a crash", () => {
  for (const raw of [undefined, null, "text", { items: "no" }, []]) assert.deepEqual(validateBriefing(raw, [sprint], glossary), { items: [], dropped: 0 });
});
