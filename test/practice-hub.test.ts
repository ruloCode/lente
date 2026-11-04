// add-practice-mode 1.3: the practice routes on the real hub, against the stubbed Meta API. No key, no
// network, no audio: the attempt is the JSON the phone sends after hearing the notes itself.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, STUB_COACH, STUB_COACH_BETTER, startStubMeta } from "../scripts/stub-meta.ts";

let stub: StubMeta;
const children: ChildProcess[] = [];
const aborts: AbortController[] = [];
before(async () => (stub = await startStubMeta()));
after(() => {
  for (const a of aborts) a.abort();
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startHub() {
  const port = await freePort();
  const devicePort = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "lente-practice-hub-"));
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(devicePort), PILOT_DATA_DIR: dir, MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime` },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await sleep(50);
  return { base, dir };
}

/** Every event from /events, parsed, as they arrive. */
function listen(base: string) {
  const events: Record<string, any>[] = [];
  const abort = new AbortController();
  aborts.push(abort);
  void (async () => {
    const res = await fetch(`${base}/events`, { signal: abort.signal });
    const reader = res.body!.getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buf += new TextDecoder().decode(value);
      let at;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        if (data) try { events.push(JSON.parse(data)); } catch { /* keep-alive */ }
      }
    }
  })();
  return events;
}

async function until<T>(check: () => T | undefined, ms = 5000): Promise<T> {
  for (let waited = 0; waited < ms; waited += 50) {
    const v = check();
    if (v) return v;
    await sleep(50);
  }
  throw new Error("timed out");
}

const practiceLines = (dir: string): Record<string, any>[] => {
  const days = join(dir, "days");
  if (!existsSync(days)) return [];
  return readdirSync(days)
    .flatMap((f) => readFileSync(join(days, f), "utf8").split("\n"))
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.kind === "practice");
};

const scale = [60, 62, 64, 65, 67, 69, 71, 72];
const attempt = (wrongAt?: number) => ({
  lessonId: "escala-do",
  expected: scale,
  played: scale.map((midi, i) => ({ midi: i === wrongAt ? midi + 2 : midi, atMs: i * 600 })),
  marks: scale.map((_, i) => (i === wrongAt ? "wrong" : "right")),
  extra: 0,
  durationMs: 4800,
});
const postAttempt = (base: string, body: unknown) => fetch(`${base}/practice/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("practice: lessons listed, an attempt kept and coached, a second one sees the first, an unknown lesson refused, a guest coached and not kept", { timeout: 60_000 }, async () => {
  const { base, dir } = await startHub();
  const events = listen(base);

  const lessons = await fetch(`${base}/practice/lessons`).then((r) => r.json()) as { lessons: { id: string; title: string; notes: number[] }[] };
  assert.deepEqual(lessons.lessons.map((l) => l.id), ["escala-do", "estrellita", "himno-alegria"]);
  assert.deepEqual(lessons.lessons[0]!.notes, scale);

  const first = await postAttempt(base, attempt(3));
  assert.equal(first.status, 200);
  const one = await first.json() as { line: string; summary: string };
  assert.equal(one.line, STUB_COACH);
  assert.equal(one.summary, "Piano · Escala de Do: 7 de 8 notas bien; falló la 4.ª (tocó Sol en vez de Fa); 5 s");
  const event = await until(() => events.find((e) => e.kind === "practice"));
  assert.equal(event.line, STUB_COACH);
  assert.equal(event.text, one.summary);
  assert.equal(event.lessonId, "escala-do");
  assert.deepEqual(practiceLines(dir).map((e) => [e.lessonId, e.right, e.total, e.text]), [["escala-do", 7, 8, one.summary]]);

  // The coach sees today's earlier attempt at the same lesson.
  const two = await postAttempt(base, attempt()).then((r) => r.json()) as { line: string; summary: string };
  assert.equal(two.line, STUB_COACH_BETTER);
  assert.equal(practiceLines(dir).length, 2);

  const calls = stub.requests.filter((r) => r === "POST /v1/responses").length;
  const unknown = await postAttempt(base, { ...attempt(), lessonId: "PROBE-unknown" });
  assert.equal(unknown.status, 400);
  assert.match(((await unknown.json()) as { error: string }).error, /lesson/);
  const tooMany = await postAttempt(base, { ...attempt(), played: Array.from({ length: 65 }, (_, i) => ({ midi: 60, atMs: i })) });
  assert.equal(tooMany.status, 400);
  const notJson = await fetch(`${base}/practice/attempt`, { method: "POST", body: "PROBE{" });
  assert.equal(notJson.status, 400);
  assert.equal(stub.requests.filter((r) => r === "POST /v1/responses").length, calls, "a refused attempt calls no model");
  assert.equal(practiceLines(dir).length, 2);

  assert.equal((await fetch(`${base}/guest/on`, { method: "POST" })).status, 204);
  const guest = await postAttempt(base, attempt(1)).then((r) => r.json()) as { line: string; summary: string };
  assert.equal(guest.line, STUB_COACH, "a guest's coach does not see the wearer's attempts");
  assert.match(guest.summary, /falló la 2.ª/);
  await sleep(200);
  assert.equal(practiceLines(dir).length, 2, "a guest's attempt is not kept");
  assert.equal((await fetch(`${base}/guest/off`, { method: "POST" })).status, 204);
});
