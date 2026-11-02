// add-web-desktop 1.2: the web app on a real laptop hub, seeded through the file stores with
// synthetic data: the shell and modules with their CSP, nothing outside web/app/, and the
// read-only routes the app adds. No model is called.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ActionStore } from "../src/action-store.ts";
import { TaskStore } from "../src/agent-tools.ts";
import { DayLog } from "../src/day-log.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { FileProjects } from "../src/project-store.ts";

const children: ChildProcess[] = [];
after(() => children.forEach((c) => c.kill()));
const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

test("the web app on a laptop hub: shell, modules, CSP, and the read-only routes", { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "lente-web-hub-"));
  const now = Date.now();
  new MeetingStore(join(dir, "meetings")).save({ id: "m1", title: "PROBE uno", startedAt: now - 3600_000, status: "done", turns: [] });
  const tasks = new TaskStore(join(dir, "tasks.json"));
  tasks.add({ title: "PROBE tarea", who: "lente", meetingId: "m1", evidence: [] }, now);
  new ActionStore(join(dir, "actions.json")).addAll("m1", [{ tool: "create_task", args: { title: "PROBE propuesta" }, evidence: [] }], now);
  const projects = new FileProjects(join(dir, "projects.json"));
  const p = projects.create("PROBE Alfa", now);
  projects.assign("m1", p.id);
  new DayLog(join(dir, "days")).add({ at: now, kind: "summary", text: "PROBE resumen" });

  const port = await freePort();
  const hub = spawn(process.execPath, ["src/pilot.ts"], { env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir }, stdio: "ignore" });
  children.push(hub);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));

  for (const path of ["/app", "/app/reuniones/m1", "/app/tareas"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(res.headers.get("content-security-policy") ?? "", /script-src 'self'/);
    assert.match(await res.text(), /<script type="module" src="\/app\/main.js">/);
  }
  for (const [path, type] of [["/app/main.js", /javascript/], ["/app/app.css", /css/], ["/app/theme.css", /css/], ["/app/lib/events.js", /javascript/], ["/app/lib/capture-pipeline.js", /javascript/], ["/app/lib/transcript-view.js", /javascript/], ["/app/tap-worklet.js", /javascript/]] as const) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type") ?? "", type, path);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }
  for (const path of ["/app/nope.js", "/app/..%2F..%2Fpackage.json", "/app/lib/../../package.json"]) assert.equal((await fetch(base + path)).status, 404, path);
  assert.deepEqual(await (await fetch(`${base}/app/session`)).json(), { mode: "open", signedIn: true, email: null });

  const t = await (await fetch(`${base}/tasks`)).json();
  assert.deepEqual(t.tasks.map((x: any) => [x.title, x.who, x.projectName]), [["PROBE tarea", "lente", "PROBE Alfa"]]);
  assert.deepEqual(t.pending.map((a: any) => a.args.title), ["PROBE propuesta"]);
  assert.equal(t.kind, undefined, "the event's kind is not part of the answer");
  assert.deepEqual((await (await fetch(`${base}/day`)).json()).entries.map((e: any) => e.text), ["PROBE resumen"]);
  assert.deepEqual(await (await fetch(`${base}/projects/assignments`)).json(), { assignments: { m1: p.id } });
  assert.deepEqual(await (await fetch(`${base}/memory/profile`)).json(), { profile: null }, "the laptop keeps no profile digest");
  assert.equal((await fetch(`${base}/tasks`, { method: "POST" })).status, 404, "read only");
});
