// add-notifications 1.1: the activity feed, its read mark, the settings and the alert rules. Synthetic data only.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFS, FEED_MAX_ITEMS, FEED_WINDOW_MS, buildFeed, isQuiet, mayAlert, minuteOfDay, parsePrefs, parseSettings, shouldBuzz, unreadCount } from "../src/notifications.ts";

const now = 1_800_000_000_000;
const min = 60_000;

const sources = () => ({
  meetings: [
    { id: "m1", title: "PROBE-Revisión", status: "done", startedAt: now - 90 * min, endedAt: now - 60 * min },
    { id: "m2", title: "", topic: "PROBE-tema", status: "extracting", startedAt: now - 20 * min, endedAt: now - 2 * min },
    { id: "m3", title: "PROBE-corta", status: "too-short", startedAt: now - 30 * min, endedAt: now - 29 * min },
    { id: "m4", title: "PROBE-vieja", status: "done", startedAt: now - FEED_WINDOW_MS - 1, endedAt: now - FEED_WINDOW_MS - 1 },
    { id: "m5", title: "PROBE-viva", status: "running", startedAt: now - min },
  ],
  actions: [
    { id: "a1", tool: "run_agent", meetingId: "", args: { agent: "codex", instruction: "PROBE-correr los tests" }, status: "pending", createdAt: now - 5 * min },
    { id: "a2", tool: "draft_email", meetingId: "m1", args: { subject: "PROBE-asunto" }, status: "pending", createdAt: now - 50 * min },
    { id: "a3", tool: "run_agent", meetingId: "", args: { agent: "claude", instruction: "PROBE-README" }, status: "approved", createdAt: now - 40 * min, outcome: { state: "done", finishedAt: now - 10 * min } },
    { id: "a4", tool: "run_agent", meetingId: "", args: { agent: "claude", instruction: "PROBE-falla" }, status: "approved", createdAt: now - 40 * min, outcome: { state: "failed", finishedAt: now - 15 * min } },
    { id: "a5", tool: "create_task", meetingId: "m1", args: { title: "PROBE-hecha" }, status: "approved", createdAt: now - 70 * min },
  ],
  facts: [
    { id: "f1", text: "PROBE-recuerdo uno", status: "proposed", meetingId: "m1", createdAt: now - 59 * min },
    { id: "f2", text: "PROBE-recuerdo dos", status: "proposed", meetingId: "m1", createdAt: now - 58 * min },
    { id: "f3", text: "PROBE-guardado", status: "kept", meetingId: "m1", createdAt: now - 57 * min },
  ],
});

test("buildFeed: every kind of item, newest first, old and running meetings left out", () => {
  const feed = buildFeed(sources(), now);
  assert.deepEqual(feed.map((i) => i.id), [
    "notes-writing:m2", "approval:a1", "job-done:a3", "job-failed:a4", "notes-short:m3", "approval:a2", "memory-review:f2", "notes-ready:m1",
  ]);
  const byId = Object.fromEntries(feed.map((i) => [i.id, i]));
  assert.equal(byId["notes-writing:m2"].body, "PROBE-tema · Lente escribe las notas");
  assert.equal(byId["approval:a1"].title, "Codex espera tu aprobación");
  assert.equal(byId["approval:a1"].group, "agents");
  assert.equal(byId["approval:a1"].urgent, true);
  assert.equal(byId["approval:a2"].title, "Un correo por aprobar");
  assert.equal(byId["approval:a2"].group, "approvals");
  assert.equal(byId["job-failed:a4"].urgent, true);
  assert.equal(byId["job-done:a3"].urgent, false);
  assert.equal(byId["memory-review:f2"].title, "2 recuerdos por revisar");
  assert.equal(byId["notes-ready:m1"].title, "Notas listas: PROBE-Revisión");
});

test("buildFeed: long text is quoted short, and the feed is capped", () => {
  const long = { ...sources(), actions: [{ id: "x", tool: "run_agent", meetingId: "", args: { agent: "claude", instruction: "PROBE ".repeat(60) }, status: "pending", createdAt: now }] };
  assert.ok(buildFeed(long, now).find((i) => i.id === "approval:x")!.body.endsWith("…"));
  const many = { meetings: Array.from({ length: FEED_MAX_ITEMS + 10 }, (_, i) => ({ id: `m${i}`, title: "PROBE", status: "done", startedAt: now - i * min, endedAt: now - i * min })), actions: [], facts: [] };
  assert.equal(buildFeed(many, now).length, FEED_MAX_ITEMS);
});

test("unreadCount counts after the read mark", () => {
  const feed = buildFeed(sources(), now);
  assert.equal(unreadCount(feed, 0), feed.length);
  assert.equal(unreadCount(feed, now - 6 * min), 2);
  assert.equal(unreadCount(feed, now), 0);
});

test("parsePrefs keeps defaults for anything missing or wrong; parseSettings tolerates old profiles", () => {
  assert.deepEqual(parsePrefs(undefined), DEFAULT_PREFS);
  const p = parsePrefs({ phone: false, groups: { agents: false, memories: "no" }, quiet: { on: true, from: 1380, to: 99999 }, clipBuzz: true });
  assert.equal(p.phone, false);
  assert.equal(p.groups.agents, false);
  assert.equal(p.groups.memories, true);
  assert.deepEqual(p.quiet, { on: true, from: 1380, to: DEFAULT_PREFS.quiet.to });
  assert.equal(p.clipBuzz, true);
  assert.deepEqual(parseSettings({}), { readAt: 0, prefs: DEFAULT_PREFS });
  assert.equal(parseSettings({ readAt: 42 }).readAt, 42);
});

test("quiet hours cross midnight; alerts follow kind, quiet hours and meetings; the clip only for urgent", () => {
  const night = { ...DEFAULT_PREFS, quiet: { on: true, from: 22 * 60, to: 7 * 60 } };
  assert.equal(isQuiet(night, 23 * 60 + 30), true);
  assert.equal(isQuiet(night, 6 * 60), true);
  assert.equal(isQuiet(night, 12 * 60), false);
  assert.equal(isQuiet({ ...DEFAULT_PREFS, quiet: { on: true, from: 13 * 60, to: 14 * 60 } }, 13 * 60 + 5), true);
  const feed = buildFeed(sources(), now);
  const ready = feed.find((i) => i.kind === "notes-ready")!;
  const approval = feed.find((i) => i.id === "approval:a1")!;
  assert.equal(mayAlert(ready, DEFAULT_PREFS, 12 * 60, false), true);
  assert.equal(mayAlert(ready, DEFAULT_PREFS, 12 * 60, true), false);
  assert.equal(mayAlert(approval, DEFAULT_PREFS, 12 * 60, true), true);
  assert.equal(mayAlert(approval, { ...DEFAULT_PREFS, groups: { ...DEFAULT_PREFS.groups, agents: false } }, 12 * 60, false), false);
  assert.equal(mayAlert(ready, night, 23 * 60, false), false);
  assert.equal(shouldBuzz(approval, DEFAULT_PREFS, 12 * 60, false), false);
  assert.equal(shouldBuzz(approval, { ...DEFAULT_PREFS, clipBuzz: true }, 12 * 60, false), true);
  assert.equal(shouldBuzz(ready, { ...DEFAULT_PREFS, clipBuzz: true }, 12 * 60, false), false);
});

test("minuteOfDay is the wearer's local minute", () => {
  const at = Date.UTC(2026, 10, 3, 3, 30); // 03:30 UTC
  assert.equal(minuteOfDay(at, "UTC"), 3 * 60 + 30);
  assert.equal(minuteOfDay(at, "America/Bogota"), 22 * 60 + 30);
});
