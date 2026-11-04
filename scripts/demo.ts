// Lente on this computer in one command, for a judge or a first look: a local hub with the synthetic
// PROBE sample (meetings, tasks, facts) in its own data folder, and the web app at /app. With
// MODEL_API_KEY in .env the hub calls Meta's models; without it (or with --stub) it talks to the
// stubbed Meta API in scripts/stub-meta.ts, so every screen works with canned answers and no key
// leaves this machine. Never touches data/ outside data/demo/.
//
//   pnpm demo            # real models when .env has MODEL_API_KEY, the stub otherwise
//   pnpm demo --stub     # always the stub
//   pnpm demo --fresh    # start again from the bare sample

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startStubMeta } from "./stub-meta.ts";

const DATA_DIR = fileURLToPath(new URL("../data/demo/", import.meta.url));
const WEB_PORT = Number(process.env.PILOT_WEB_PORT ?? 8080);
const DEVICE_PORT = Number(process.env.PILOT_DEVICE_PORT ?? 7070);
const args = process.argv.slice(2);
const stubbed = args.includes("--stub") || !process.env.MODEL_API_KEY;

if (args.includes("--fresh")) rmSync(DATA_DIR, { recursive: true, force: true });

const hubEnv: NodeJS.ProcessEnv = { PILOT_DATA_DIR: DATA_DIR, PILOT_WEB_PORT: String(WEB_PORT), PILOT_DEVICE_PORT: String(DEVICE_PORT), PILOT_SAMPLE: "on" };
let stub: Awaited<ReturnType<typeof startStubMeta>> | undefined;
if (stubbed) {
  // Only stub addresses and a dummy key, as in the smoke test: no real API is reachable from here.
  stub = await startStubMeta();
  Object.assign(hubEnv, {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    MODEL_API_KEY: "stub",
    META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`,
    META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`,
  });
} else {
  // Local open mode on this machine: never the cloud's accounts, whatever the shell exports.
  Object.assign(hubEnv, { ...process.env, ...hubEnv });
  delete hubEnv.SUPABASE_URL;
  delete hubEnv.SUPABASE_SECRET_KEY;
}

const hub = spawn(process.execPath, ["src/pilot.ts"], { env: hubEnv, stdio: ["ignore", "inherit", "inherit"], cwd: fileURLToPath(new URL("..", import.meta.url)) });

function stop(code: number): never {
  hub.kill("SIGTERM");
  stub?.server.close();
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop(0));
hub.on("exit", (code) => {
  if (code) console.error(`demo: the hub exited with ${code}; is port ${WEB_PORT} or ${DEVICE_PORT} in use? Set PILOT_WEB_PORT / PILOT_DEVICE_PORT.`);
  stop(code ?? 0);
});

const app = `http://localhost:${WEB_PORT}/app`;
for (let waited = 0; waited <= 15_000; waited += 200) {
  try {
    if ((await fetch(`http://127.0.0.1:${WEB_PORT}/manifest.webmanifest`)).ok) {
      // The stub always hears STUB_QUESTION, addressed to "Rulo": with that name the question is
      // the wearer's and a recording from the browser's microphone ends in a Dilo card.
      if (stubbed) await fetch(`http://127.0.0.1:${WEB_PORT}/profile`, { method: "POST", body: JSON.stringify({ names: "Rulo" }) });
      console.log(`\nLente demo is up: open ${app}`);
      console.log(stubbed ? "Models: the stubbed Meta API (canned answers, no key). Add MODEL_API_KEY to .env for Meta's models." : "Models: Meta's, with MODEL_API_KEY from .env.");
      console.log(`Data: synthetic PROBE sample in ${DATA_DIR} (pnpm demo --fresh starts again). Ctrl-C stops.\n`);
      break;
    }
  } catch {
    // not listening yet
  }
  await new Promise((r) => setTimeout(r, 200));
}
