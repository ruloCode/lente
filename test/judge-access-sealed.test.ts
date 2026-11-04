// ship-hackathon 2.2–2.4 on the sealed stores: the real hub in accounts mode against the fake PostgREST
// over HTTP, as production runs on Supabase. A judge accepts the terms (kept on the account row), gets
// the sample through the sealed stores (no sample text in the database), asks it, and removes it.
// Synthetic PROBE- accounts, test-only keys, the stubbed Meta API.

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type StubMeta, startStubMeta } from "../scripts/stub-meta.ts";
import { servePostgrest } from "./fake-postgrest.ts";

const JUDGE = "bbbbbbbb-0000-4000-8000-00000000000b";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
let db: Awaited<ReturnType<typeof servePostgrest>>;
let stub: StubMeta;
let hub: ChildProcess | undefined;
before(async () => {
  stub = await startStubMeta();
  db = await servePostgrest({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" }] });
});
after(() => {
  hub?.kill();
  db.close();
  stub.server.closeAllConnections();
  stub.server.close();
});

const freePort = (): Promise<number> => new Promise((r) => { const s = createServer().listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => r(port)); }); });
function token(sub: string, email: string): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "ES256", kid: "k1" })}.${enc({ iss: `${db.url}/auth/v1`, aud: "authenticated", sub, email, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

test("a judge on the sealed stores: 428, accept (kept on accounts), the sample sealed, asked with a source, then removed", { timeout: 40_000 }, async () => {
  const port = await freePort();
  hub = spawn(process.execPath, ["src/pilot.ts"], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, LENTE_CLOUD: "1", SUPABASE_URL: db.url, SUPABASE_SECRET_KEY: "sb_secret_fake", LENTE_KEK: randomBytes(32).toString("base64"),
      LENTE_SIGNUP: "open", LENTE_SIGNUP_UNTIL: "2999-01-01", LENTE_RECALL: "fast",
      MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`,
      PILOT_WEB_PORT: String(port), PILOT_DEVICE_PORT: String(await freePort()), PILOT_DATA_DIR: mkdtempSync(join(tmpdir(), "lente-judge-sealed-")),
    },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await fetch(`${base}/health`).then((r) => r.status > 0, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
  const judge = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token(JUDGE, "probe-judge@example.com")}` } });

  assert.equal((await judge("/tasks")).status, 428);
  assert.equal((await judge("/terms/accept", { method: "POST", body: "{}" })).status, 200);
  const row = db.fake.tables.get("accounts")!.find((r) => r.user_id === JUDGE)!;
  assert.equal(row.terms_version, "preview-2026-11-04");
  assert.ok(row.terms_accepted_at);

  const tasks = (await (await judge("/tasks")).json()) as { tasks: unknown[] };
  assert.equal(tasks.tasks.length, 3);
  const answer = (await (await judge("/ask", { method: "POST", body: JSON.stringify({ question: "¿Qué se decidió sobre la beta?" }) })).json()) as { ok: boolean; sources: { label: string }[] };
  assert.equal(answer.ok, true);
  assert.match(answer.sources[0]?.label ?? "", /Planificación de la beta/);
  // Sealed: none of the sample's words reach the database in the clear.
  for (let i = 0; i < 100 && !db.fake.tables.get("meeting_turns")?.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok((db.fake.tables.get("meeting_turns") ?? []).length > 0, "the sample's turns were written");
  assert.doesNotMatch(db.fake.dump(), /beta el 20|Proyecto de ejemplo|PROBE-Sofía|ad calendar/);

  const removed = (await (await judge("/sample/delete", { method: "POST", body: "{}" })).json()) as { ok: boolean; removed: number };
  assert.deepEqual(removed, { ok: true, removed: 8 });
  assert.equal(((await (await judge("/tasks")).json()) as { tasks: unknown[] }).tasks.length, 0);
});
