// add-memory-engine 3.4 on a real laptop hub with LENTE_RECALL=fast and a stubbed Meta API that records
// every request: a question streams over SSE (text, then its chip, then done) from exactly one model
// call whose prompt holds the concrete line; an old client still gets JSON; an aggregate shows
// «searching» and takes the deep path; and a project question sends nothing from another project.
// Synthetic PROBE- memory (scripts/eval/memory-set.ts), a fake key.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { FactStore } from "../src/fact-store.ts";
import { MeetingStore } from "../src/meeting-store.ts";
import { FileProjects } from "../src/project-store.ts";
import { memorySet } from "../scripts/eval/memory-set.ts";

const ANSWER = "PROBE: Ana dijo que el presupuesto es de 18,000 dólares.";
const bodies: { url: string; body: string }[] = [];
let stub: ReturnType<typeof createServer> | undefined;
let hub: ChildProcess | undefined;
let base = "";
let atlasId = "";

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

before(async () => {
  stub = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      bodies.push({ url: req.url ?? "", body });
      if (req.url?.endsWith("/responses")) {
        const id = /RECUPERADO:\\n\[([^\]]+)\]/.exec(body)?.[1];
        const text = id ? `@answer\n${ANSWER} [[${id}]]` : "@none";
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const delta of [text.slice(0, 5), text.slice(5, 30), text.slice(30, -4), text.slice(-4)]) res.write(`data: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\n`);
        res.end(`data: ${JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 900, output_tokens: 30 } } })}\n\n`);
      } else {
        const id = /\n\[(M\d+(?:\.t\d+)?)\]/.exec(body.replace(/\\n/g, "\n"))?.[1];
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "answer", found: Boolean(id), answer: id ? "PROBE: resumen del mes con Ana." : "", sources: id ? [id] : [], agent: "claude", instruction: "" }) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
      }
    });
  });
  await new Promise<void>((ok) => stub!.listen(0, ok));

  const dir = mkdtempSync(join(tmpdir(), "lente-recall-hub-"));
  const set = memorySet({ days: 14 });
  const store = new MeetingStore(join(dir, "meetings"));
  for (const m of set.meetings) store.save(m);
  const projects = new FileProjects(join(dir, "projects.json"));
  const atlas = projects.create("PROBE-Atlas", set.now - 30 * 86_400_000);
  const orion = projects.create("PROBE-Orion", set.now - 30 * 86_400_000);
  atlasId = atlas.id;
  for (const [m, p] of set.assignments) projects.assign(m, p === "p-atlas" ? atlas.id : orion.id);
  const facts = new FactStore(join(dir, "facts.json"));
  for (const f of set.keptFacts) facts.keep(facts.propose(f.meetingId, [{ text: f.text, evidence: f.evidence }], f.createdAt)[0]!.id);

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LENTE_RECALL: "fast", MODEL_API_KEY: "probe-fake-key", META_BASE_URL: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: dir },
    stdio: "ignore",
  });
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
});

after(async () => {
  if (hub) {
    const gone = new Promise((r) => hub!.once("exit", r));
    hub.kill();
    await gone;
  }
  stub?.close();
});

/** The SSE events of one streamed /ask, in order. */
async function askStream(body: unknown): Promise<{ event: string; data: any }[]> {
  const res = await fetch(`${base}/ask`, { method: "POST", headers: { Accept: "text/event-stream" }, body: JSON.stringify(body) });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  return text.split("\n\n").filter(Boolean).map((chunk) => {
    const [event, data] = chunk.split("\n");
    return { event: event!.slice(7), data: JSON.parse(data!.slice(6)) };
  });
}

test("a question streams its text, then its chip, then done, from one model call that saw the concrete line", { timeout: 30_000 }, async () => {
  bodies.length = 0;
  const events = await askStream({ question: "¿Qué dijo Ana sobre el presupuesto de marketing?" });
  const kinds = events.map((e) => e.event);
  assert.ok(kinds.indexOf("delta") < kinds.indexOf("source") && kinds.indexOf("source") < kinds.indexOf("done"), kinds.join(","));
  assert.ok(kinds.filter((k) => k === "delta").length >= 2, "the text arrives in pieces");
  assert.equal(events.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), ANSWER);
  const chip = events.find((e) => e.event === "source")!.data;
  assert.equal(chip.kind, "meeting");
  assert.match(chip.label, /^PROBE-Orion marketing sync · /);
  const done = events.at(-1)!.data;
  assert.equal(done.ok, true);
  assert.equal(done.found, true);
  assert.equal(done.answer, ANSWER);
  // Background consolidation (people cards on open) may call the model too; the answer is one Responses call and no plan or ask call.
  const answerCalls = bodies.filter((b) => b.url === "/responses");
  assert.equal(answerCalls.length, 1, "exactly one answer call");
  assert.ok(!bodies.some((b) => /"name":"(lookup_plan|ask)"/.test(b.body)), "no plan call");
  const sent = JSON.parse(answerCalls[0]!.body);
  assert.equal(sent.stream, true);
  assert.equal(sent.input[0].role, "developer");
  assert.match(sent.input[2].content, /RECUPERADO:[\s\S]*18,000 dollars/);
});

test("a client that does not accept an event stream still gets the JSON reply", { timeout: 30_000 }, async () => {
  const out = await (await fetch(`${base}/ask`, { method: "POST", body: JSON.stringify({ question: "¿Qué dijo Ana sobre el presupuesto de marketing?" }) })).json();
  assert.equal(out.ok, true);
  assert.equal(out.answer, ANSWER);
  assert.equal(out.sources[0].kind, "meeting");
});

test("an aggregate shows «searching» at once and takes the deep path", { timeout: 30_000 }, async () => {
  bodies.length = 0;
  const events = await askStream({ question: "Resume todo lo que hablé con Ana este mes" });
  assert.equal(events[0]!.event, "searching");
  assert.equal(events.at(-1)!.event, "done");
  assert.ok(!bodies.some((b) => b.url === "/responses"), "not the fast path's answer call");
  assert.ok(bodies.some((b) => /"name":"ask"/.test(b.body)), "the deep path's structured call");
});

test("inside a project, no model call sees another project's lines", { timeout: 30_000 }, async () => {
  bodies.length = 0;
  const events = await askStream({ question: "¿A quién entrevistamos para diseño?", project: atlasId });
  assert.equal(events.at(-1)!.event, "done");
  // The calls that answer the question; background consolidation (people cards) may read every project.
  const answering = bodies.filter((b) => b.url === "/responses" || /"name":"(lookup_plan|ask)"/.test(b.body));
  assert.ok(answering.length >= 1);
  assert.doesNotMatch(answering.map((b) => b.body).join("\n"), /Orion|Luc(i|í|\\u00ed)a/);
});
