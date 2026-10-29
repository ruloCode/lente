import assert from "node:assert/strict";
import { test } from "node:test";
import { type Bench, heldTasks, holdReason, makeChange, nextTask, orderChanges, parseArchiveDir, parseBuildOrder, parseDependsOn, parseTasks, parseWhy, readyNodes } from "../scripts/progress/parse.ts";

const TASKS = `# Tasks

## 1. Synthetic set

- [x] 1.1 Ten scripted dialogues
- [X] 1.2 Renderer to 16 kHz PCM

## 2. CI

- [ ] 2.1 GitHub Actions workflow: \`pnpm test\`
- [x] 2.2 Firmware compile step
`;

test("tasks group under their headings with ids and done state", () => {
  const groups = parseTasks(TASKS);
  assert.deepEqual(groups.map((g) => g.title), ["Synthetic set", "CI"]);
  assert.deepEqual(groups[0].tasks.map((t) => [t.id, t.done]), [["1.1", true], ["1.2", true]]);
  assert.deepEqual(groups[1].tasks[0], { id: "2.1", text: "GitHub Actions workflow: `pnpm test`", done: false, tags: [] });
});

test("tasks without a heading or an id still count", () => {
  const groups = parseTasks("- [ ] write it\n- [x] ship it\n## Empty\n");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tasks.map((t) => t.id), ["1", "2"]);
});

test("why is the first paragraph, on one line, capped", () => {
  assert.equal(parseWhy("# Proposal\n\n## Why\n\nThe rule is\nthat numbers are measured.\n\nMore.\n\n## What"), "The rule is that numbers are measured.");
  assert.equal(parseWhy("# Proposal\n\nno why here"), "");
  const long = parseWhy(`## Why\n\n${"word ".repeat(100)}`);
  assert.ok(long.length <= 220 && long.endsWith("…"));
});

test("archive dirs split into date and name", () => {
  assert.deepEqual(parseArchiveDir("2026-10-28-add-meeting-memory"), { on: "2026-10-28", name: "add-meeting-memory" });
  assert.equal(parseArchiveDir("notes"), null);
});

test("build order keeps known change names in first-mention order", () => {
  const md = "# x\nBuild order: done `b` · next `c` → `a` (needs `API_KEY`) → `c`\n";
  assert.deepEqual(parseBuildOrder(md, new Set(["a", "b", "c"])), ["b", "c", "a"]);
  assert.deepEqual(parseBuildOrder("no order", new Set(["a"])), []);
});

test("archived changes come first, the rest follow the build order, and next is the first open task", () => {
  const changes = [
    makeChange("late", "- [ ] 1.1 later", ""),
    makeChange("evals", TASKS, "## Why\n\nMeasure."),
    makeChange("old", "- [x] 1.1 done", "", "2026-10-27"),
    makeChange("stray", "- [ ] 1.1 unlisted", ""),
  ];
  const ordered = orderChanges(changes, ["evals", "late"]);
  assert.deepEqual(ordered.map((c) => c.name), ["old", "evals", "late", "stray"]);
  assert.deepEqual([ordered[1].done, ordered[1].total, ordered[1].why], [3, 4, "Measure."]);
  const next = nextTask(ordered);
  assert.equal(next?.change, "evals");
  assert.equal(next?.task.id, "2.1");
});

const BARE: Bench = { board: false, phone: false, keys: new Set() };
const FULL: Bench = { board: true, phone: true, keys: new Set(["BASETEN_API_KEY"]) };

test("tags come off the task text and say what the task needs", () => {
  const [g] = parseTasks("- [ ] 1.1 Verify on the phone with the clip [hw] [phone]\n- [ ] 1.2 Bench it [key:BASETEN_API_KEY]\n- [ ] 1.3 Feel the motor [human]");
  assert.equal(g.tasks[0].text, "Verify on the phone with the clip");
  assert.deepEqual(g.tasks.map((t) => t.tags), [["hw", "phone"], ["key:BASETEN_API_KEY"], ["human"]]);
  assert.deepEqual(g.tasks.map((t) => holdReason(t, BARE)), ["clip board not connected", "BASETEN_API_KEY not set", "needs a person"]);
  assert.deepEqual(g.tasks.map((t) => holdReason(t, FULL)), [null, null, "needs a person"]);
});

test("depends-on names come from the backticks on its line", () => {
  assert.deepEqual(parseDependsOn("# Tasks\n\nDepends on: `add-phone-capture`, `add-closing-agent`\n\n## 1. X\n"), ["add-phone-capture", "add-closing-agent"]);
  assert.deepEqual(parseDependsOn("# Tasks\n"), []);
});

test("ready nodes skip held tasks, wait on dependencies and skip failed nodes", () => {
  const capture = makeChange("capture", "## 1. Ingest\n\n- [ ] 1.1 Socket\n- [ ] 1.2 TLS on the phone [phone]\n\n## 2. Page\n\n- [ ] 2.1 Mic\n", "");
  const desktop = makeChange("desktop", "Depends on: `capture`\n\n## 1. Page\n\n- [ ] 1.1 Picker [human]\n- [ ] 1.2 Resampler\n", "");
  const dilo = makeChange("dilo", "## 1. Identity\n\n- [x] 1.1 Tokens\n\n## 2. Install\n\n- [ ] 2.1 Home screen [human]\n", "");
  const ordered = [dilo, capture, desktop];

  const nodes = readyNodes(ordered, BARE);
  assert.deepEqual(nodes.map((n) => [n.change, n.group, n.tasks.map((t) => t.id)]), [["capture", "Ingest", ["1.1"]]]);
  assert.deepEqual(nodes[0].held.map((h) => h.reason), ["phone not connected"]);
  assert.equal(readyNodes(ordered, BARE, new Set(["capture/Ingest"])).length, 0, "a failed group holds back the rest of its change");

  for (const t of capture.groups.flatMap((g) => g.tasks)) t.done = !t.tags.includes("phone");
  assert.deepEqual(readyNodes(ordered, BARE).map((n) => [n.change, n.tasks.map((t) => t.id)]), [], "phone task still open, so desktop waits");
  assert.deepEqual(readyNodes(ordered, FULL).map((n) => n.change), ["capture"]);
  capture.groups[0].tasks[1].done = true;
  assert.deepEqual(readyNodes(ordered, BARE).map((n) => [n.change, n.tasks.map((t) => t.id)]), [["desktop", ["1.2"]]]);
  assert.deepEqual(heldTasks(ordered, BARE).map((h) => `${h.change} ${h.id}`), ["dilo 2.1", "desktop 1.1"]);
});
