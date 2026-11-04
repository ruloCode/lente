// add-lens-apps 1.3: `GET /apps` and `GET /apps/:id` on the real hub, against the stubbed Meta API. No
// key, no network. Only the built-ins are served, whatever LENTE_APPS says.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, startStubMeta } from "../scripts/stub-meta.ts";

let stub: StubMeta;
const children: ChildProcess[] = [];
before(async () => (stub = await startStubMeta()));
after(() => {
  for (const c of children) c.kill();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });

async function startHub(env: Record<string, string> = {}) {
  const port = await freePort();
  const hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-apps-hub-")),
      MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`, ...env,
    },
    stdio: "ignore",
  });
  children.push(hub);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  return { base, stop: () => hub.kill() };
}

type Listing = { id: string; name: string; builtIn: boolean; soon: boolean; permissions: { id: string; label: string; sentence: string }[] };

test("GET /apps lists the four built-ins with their permissions; an unknown id is 404", { timeout: 30_000 }, async () => {
  const hub = await startHub();
  const res = await fetch(`${hub.base}/apps`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as { mode: string; apps: Listing[] };
  assert.equal(body.mode, "builtin");
  assert.deepEqual(body.apps.map((a) => a.id), ["dilo", "ver", "practicar", "idiomas"]);
  assert.ok(body.apps.every((a) => a.builtIn && a.permissions.length > 0));
  assert.deepEqual(body.apps.find((a) => a.id === "ver")!.permissions.map((p) => p.label), ["Cámara", "Micrófono", "Ubicación", "Leer tu memoria", "Escribir en tu memoria"]);
  assert.deepEqual(body.apps.find((a) => a.id === "practicar")!.permissions.map((p) => p.id), ["microphone", "memory.write"]);
  assert.equal(body.apps.find((a) => a.id === "idiomas")!.soon, true);

  const page = await fetch(`${hub.base}/apps/dilo`);
  assert.equal(page.status, 200);
  const { app } = (await page.json()) as { app: { name: string; persona: string; actions: Record<string, string> } };
  assert.equal(app.name, "Dilo");
  assert.match(app.persona, /tarjeta Dilo/);
  assert.equal(app.actions.install, "soon");

  const missing = await fetch(`${hub.base}/apps/cocina-facil`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: string }).error, "not_found");
  hub.stop();
});

test("LENTE_APPS=open still serves only the built-ins", { timeout: 30_000 }, async () => {
  const hub = await startHub({ LENTE_APPS: "open" });
  const body = (await (await fetch(`${hub.base}/apps`)).json()) as { mode: string; apps: Listing[] };
  assert.equal(body.mode, "open");
  assert.deepEqual(body.apps.map((a) => a.id), ["dilo", "ver", "practicar", "idiomas"]);
  hub.stop();
});
