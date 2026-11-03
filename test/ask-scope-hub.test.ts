// add-memory-engine 1.3 on a real laptop hub with a stubbed Meta API that records every prompt: a
// question asked inside a project sends the model nothing from another project (meetings, turns or
// kept facts), and the same question outside any project does. Synthetic PROBE- names, a fake key.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { FactStore } from "../src/fact-store.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { FileProjects } from "../src/project-store.ts";

const children: ChildProcess[] = [];
let stub: ReturnType<typeof createServer> | undefined;
after(() => {
  children.forEach((c) => c.kill());
  stub?.close();
});
const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

test("a scoped question's prompt holds no text from another project; the whole memory's does", { timeout: 30_000 }, async () => {
  const prompts: string[] = [];
  stub = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      prompts.push(body);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "answer", found: false, answer: "", sources: [], agent: "claude", instruction: "" }) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((ok) => stub!.listen(0, ok));

  const dir = mkdtempSync(join(tmpdir(), "lente-ask-scope-"));
  const now = Date.now();
  const store = new MeetingStore(join(dir, "meetings"));
  store.save({ id: "m1", title: "PROBE-Atlas semanal", startedAt: now - 7_200_000, endedAt: now - 3_600_000, status: "done", turns: [{ id: "t1", at: now - 7_000_000, speaker: "A", text: "PROBE-Atlas: el piloto arranca el lunes." }] });
  store.save({ id: "m2", title: "PROBE-Orion diseño", startedAt: now - 3_000_000, endedAt: now - 2_000_000, status: "done", turns: [{ id: "t1", at: now - 2_900_000, speaker: "B", text: "PROBE-Orion entrevistó a PROBE-Lucía para diseño." }] });
  const facts = new FactStore(join(dir, "facts.json"));
  for (const [m, text] of [["m1", "PROBE-Atlas usa el piloto en Bogotá."], ["m2", "PROBE-Lucía es la candidata de PROBE-Orion."]] as const) {
    const [f] = facts.propose(m, [{ text, evidence: ["t1"] }], now);
    facts.keep(f!.id);
  }
  const projects = new FileProjects(join(dir, "projects.json"));
  const atlas = projects.create("PROBE-Atlas", now - 86_400_000);
  const orion = projects.create("PROBE-Orion", now - 86_400_000);
  projects.assign("m1", atlas.id);
  projects.assign("m2", orion.id);

  const port = await freePort();
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, MODEL_API_KEY: "probe-fake-key", META_BASE_URL: `http://localhost:${(stub.address() as AddressInfo).port}`, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir };
  children.push(spawn(process.execPath, ["src/pilot.ts"], { env, stdio: "ignore" }));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  const ask = (body: unknown) => fetch(`${base}/ask`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ answer: string }>);

  const scoped = await ask({ question: "¿A quién entrevistamos para diseño?", project: atlas.id });
  assert.equal(scoped.answer, "No lo encuentro en lo que viste y escuchaste.");
  const prompt = prompts.join("\n");
  assert.match(prompt, /PROBE-Atlas usa el piloto/);
  assert.doesNotMatch(prompt, /Orion|Luc/, "no meeting, turn or kept fact from another project reaches the model");

  prompts.length = 0;
  await ask({ question: "¿A quién entrevistamos para diseño?" });
  assert.match(prompts.join("\n"), /PROBE-Lucía es la candidata/);
});
