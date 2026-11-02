// add-projects 1.3: the project routes on a real laptop hub, seeded through the file stores.
// Synthetic names only; no model is called.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { TaskStore } from "../src/agent-tools.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { FileProjects } from "../src/project-store.ts";

const children: ChildProcess[] = [];
after(() => children.forEach((c) => c.kill()));
const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

test("projects on the hub: list with summaries, detail, rename, move a meeting, merge, archive", { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-projects-hub-"));
  const now = Date.now();
  const store = new MeetingStore(join(dir, "meetings"));
  for (const [id, ago] of [["m1", 3], ["m2", 1], ["m3", 2]] as const) store.save({ id, title: `PROBE ${id}`, startedAt: now - ago * 3600_000, status: "done", turns: [] });
  new TaskStore(join(dir, "tasks.json")).add({ title: "PROBE tarea", meetingId: "m2", evidence: [] }, now);
  const projects = new FileProjects(join(dir, "projects.json"));
  const a = projects.create("PROBE Alfa", now - 86_400_000);
  const b = projects.create("PROBE Beta", now - 86_400_000);
  projects.assign("m1", a.id);
  projects.assign("m2", a.id);
  projects.assign("m3", b.id);

  const port = await freePort();
  const hub = spawn(process.execPath, ["src/pilot.ts"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir }, stdio: "ignore" });
  children.push(hub);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  const get = async (path: string) => (await fetch(base + path)).json() as Promise<any>;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.status);

  const list = (await get("/projects")).projects;
  assert.deepEqual(list.map((p: any) => [p.name, p.meetings, p.openTasks, p.next]), [["PROBE Alfa", 2, 1, "PROBE tarea"], ["PROBE Beta", 1, 0, null]]);
  const detail = await get(`/projects/get?id=${a.id}`);
  assert.deepEqual(detail.meetings.map((m: any) => m.id), ["m2", "m1"], "newest first");
  assert.deepEqual(detail.tasks.map((t: any) => t.title), ["PROBE tarea"]);
  assert.equal((await fetch(`${base}/projects/get?id=nope`)).status, 404);

  assert.equal(await post("/projects/rename", { id: a.id, name: "  PROBE Alfa 2 " }), 204);
  assert.equal(await post("/projects/rename", { id: a.id, name: "   " }), 404);
  assert.equal(await post("/meetings/project", { id: "m3", project: a.id }), 204);
  assert.equal(await post("/meetings/project", { id: "nope", project: a.id }), 400);
  assert.equal((await get("/projects")).projects[0].meetings, 3);
  assert.equal(await post("/meetings/project", { id: "m3", project: null }), 204);
  assert.equal(await post("/projects/merge", { id: a.id, into: b.id }), 204);
  assert.equal(await post("/projects/merge", { id: b.id, into: b.id }), 404);
  const merged = (await get("/projects")).projects;
  assert.deepEqual(merged.map((p: any) => [p.name, p.status, p.meetings]), [["PROBE Beta", "active", 2], ["PROBE Alfa 2", "archived", 0]]);
  assert.equal(await post("/projects/archive", { id: b.id }), 204);
  assert.equal(await post("/projects/restore", { id: b.id }), 204);
});
