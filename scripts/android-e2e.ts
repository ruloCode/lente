// End to end on Android, no keys: stubbed Meta API → real hub → the Android app on an emulator or a
// phone over adb, with this script reading the hub's own event stream to check what the app did.
// The hub's data starts from a synthetic, made-up meeting (no real meeting data) so the memory
// sections have something to show. Passes when, on the device:
//   - the app connects and shows the clip the clip emulator stands in for,
//   - a tap on the listening pill starts listening on the hub,
//   - the DILO line appears and the hub records the app's acknowledgement (the `phone` stage),
//   - Reuniones opens the seeded meeting, Acciones approves its action, Memoria keeps its fact,
//   - with the clip gone, "Usar el teléfono" in Dispositivos makes the phone the device: audio reaches the hub and
//     Mirar gets a photo from the phone's camera,
//   - the clip coming back takes over and the app says so.
//
//   pnpm android:e2e                 build, install and run (ANDROID_SERIAL picks the device)
//   pnpm android:e2e --release       the shrunk release build instead of the debug one
//   pnpm android:e2e --no-build      reuse the installed app
//   pnpm android:e2e --shots <dir>   also save screenshots of every section in light and dark
//   pnpm android:e2e --serve         leave the stubbed hub running afterwards, for a look by hand

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { SseParser } from "../src/sse.ts";
import { STUB_REPLY, startStubMeta } from "./stub-meta.ts";

const { values: opts } = parseArgs({ options: { "no-build": { type: "boolean", default: false }, release: { type: "boolean", default: false }, shots: { type: "string" }, serve: { type: "boolean", default: false } } });
const DEVICE_PORT = 7076;
const WEB_PORT = 8086;
const APP = "app.lente";
const STEP_TIMEOUT_MS = 30_000;
const ROOT = new URL("..", import.meta.url).pathname;
const started = performance.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** uiautomator can wait forever for an idle screen while the level bars move, so every adb call has a deadline. */
const ADB_TIMEOUT_MS = 20_000;
const adb = (...args: string[]): string => execFileSync("adb", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: ADB_TIMEOUT_MS });
const children: ChildProcess[] = [];
const scratch = mkdtempSync(join(tmpdir(), "lente-android-"));
const stub = await startStubMeta();
let hubLog = "";

function finish(failure?: string): never {
  for (const c of children) c.kill();
  stub.server.close();
  rmSync(scratch, { recursive: true, force: true });
  if (failure) {
    console.error(`android-e2e: FAILED: ${failure}\n--- hub output ---\n${hubLog.slice(-3000)}`);
    process.exit(1);
  }
  process.exit(0);
}

const step = (name: string) => console.log(`· ${name}`);
process.on("uncaughtException", (error) => finish(`crashed: ${error.message}`));
process.on("unhandledRejection", (error) => finish(`crashed: ${(error as Error).message}`));
process.on("SIGINT", () => finish());

// --- The device -------------------------------------------------------------------------------

const devices = adb("devices").split("\n").slice(1).filter((l) => l.trim().endsWith("device"));
if (!devices.length) finish("no Android device or emulator on adb (start one, or plug in the phone)");
if (!opts["no-build"]) {
  step("building the app");
  const variant = opts.release ? "release" : "debug";
  execFileSync(join(ROOT, "android/gradlew"), ["-p", join(ROOT, "android"), opts.release ? "assembleRelease" : "assembleDebug", "--console=plain", "-q"], { stdio: "inherit" });
  adb("install", "-r", "-g", join(ROOT, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`));
}
adb("shell", "pm", "clear", APP);
for (const p of ["RECORD_AUDIO", "CAMERA", "POST_NOTIFICATIONS"]) {
  try { adb("shell", "pm", "grant", APP, `android.permission.${p}`); } catch { /* older Android: no notification permission */ }
}
adb("reverse", `tcp:${WEB_PORT}`, `tcp:${WEB_PORT}`);
adb("shell", "cmd", "uimode", "night", "no");

interface Node { id: string; text: string; desc: string; x: number; y: number }
/** The screen as uiautomator sees it: Compose test tags come through as resource ids. */
function screen(): Node[] {
  let xml: string;
  try {
    adb("shell", "uiautomator", "dump", "/sdcard/lente-ui.xml");
    xml = adb("exec-out", "cat", "/sdcard/lente-ui.xml");
  } catch {
    return []; // the dump timed out; the caller tries again
  }
  const attr = (n: string, a: string) => (n.match(new RegExp(`${a}="([^"]*)"`)) ?? [])[1] ?? "";
  return [...xml.matchAll(/<node [^>]*>/g)].map(([n]) => {
    const [x1, y1, x2, y2] = (attr(n, "bounds").match(/\d+/g) ?? ["0", "0", "0", "0"]).map(Number);
    const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return { id: attr(n, "resource-id"), text: unescape(attr(n, "text")), desc: unescape(attr(n, "content-desc")), x: (x1 + x2) >> 1, y: (y1 + y2) >> 1 };
  });
}
async function waitFor(what: string, match: (n: Node) => boolean): Promise<Node> {
  const until = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < until) {
    const hit = screen().find(match);
    if (hit) return hit;
    await sleep(400);
  }
  finish(`the app never showed ${what}`);
}
const byId = (id: string) => (n: Node) => n.id === id;
const tap = (n: Node) => adb("shell", "input", "tap", String(n.x), String(n.y));
async function tapId(id: string): Promise<void> { tap(await waitFor(`"${id}"`, byId(id))); }
async function open(section: string): Promise<void> {
  const back = screen().find(byId("back"));
  if (back) { tap(back); await sleep(400); }
  await tapId("menu");
  await tapId(`nav-${section}`);
  await sleep(500);
}
function shot(name: string): void {
  if (!opts.shots) return;
  mkdirSync(opts.shots, { recursive: true });
  writeFileSync(join(opts.shots, `${name}.png`), execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 }));
}
async function shots(name: string): Promise<void> {
  if (!opts.shots) return;
  shot(`${name}-light`);
  adb("shell", "cmd", "uimode", "night", "yes");
  await sleep(1200);
  shot(`${name}-dark`);
  adb("shell", "cmd", "uimode", "night", "no");
  await sleep(1200);
}

// --- The hub, with a made-up meeting --------------------------------------------------------------

const data = join(scratch, "data");
const MEETING = "m20261029150000";
const at = Date.parse("2026-10-29T15:00:00Z");
mkdirSync(join(data, "meetings"), { recursive: true });
const turns = [
  { speaker: "B", text: "Can we move the beta to Friday?" },
  { speaker: "A", wearer: true, text: "Yes, if QA signs off on Thursday." },
  { speaker: "B", text: "Who sends the release notes?" },
  { speaker: "A", wearer: true, text: "I'll send them tomorrow morning." },
].map((t, i) => ({ id: `t${i + 1}`, at: at + i * 20_000, ...t }));
writeFileSync(join(data, "meetings", `${MEETING}.json`), JSON.stringify({
  id: MEETING, title: "Revisión de la beta", startedAt: at, endedAt: at + 120_000, status: "done", turns, stats: { asked: 2, answered: 2 },
  notes: {
    summary: "Se movió la beta al viernes si QA aprueba el jueves; tú envías las notas de la versión mañana.",
    decisions: [{ text: "La beta sale el viernes si QA aprueba el jueves.", evidence: ["t2"] }],
    commitments: [{ what: "Enviar las notas de la versión", owner: "you", due: "mañana", evidence: ["t4"] }],
    openQuestions: [{ text: "¿Quién avisa a soporte?", evidence: ["t3"] }],
    glossary: [{ term: "sign off", meaning: "dar el visto bueno", evidence: ["t2"] }],
  },
}));
writeFileSync(join(data, "facts.json"), JSON.stringify([
  { id: "f1-1", text: "QA aprueba las versiones los jueves.", status: "proposed", meetingId: MEETING, evidence: ["t2"], createdAt: at },
  { id: "f1-2", text: "Tú envías las notas de cada versión.", status: "kept", meetingId: MEETING, evidence: ["t4"], createdAt: at },
]));
writeFileSync(join(data, "actions.json"), JSON.stringify([
  { id: "a1-1", meetingId: MEETING, tool: "create_task", proposedArgs: { title: "Enviar las notas de la versión", due: "2026-10-30" }, args: { title: "Enviar las notas de la versión", due: "2026-10-30" }, evidence: ["t4"], status: "pending", createdAt: at },
]));
writeFileSync(join(data, "tasks.json"), JSON.stringify([
  { id: "k1-1", title: "Revisar el checklist de QA", meetingId: MEETING, evidence: ["t2"], done: false, createdAt: at },
]));

try {
  await fetch(`http://127.0.0.1:${WEB_PORT}/health`);
  finish(`port ${WEB_PORT} is already taken (a hub from an earlier run?)`);
} catch { /* free, as it should be */ }
const hub = spawn(process.execPath, ["src/pilot.ts"], {
  cwd: ROOT,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, MODEL_API_KEY: "stub", META_BASE_URL: `http://127.0.0.1:${stub.port}/v1`, META_REALTIME_URL: `ws://127.0.0.1:${stub.port}/v1/asr/realtime`, PILOT_DEVICE_PORT: String(DEVICE_PORT), PILOT_WEB_PORT: String(WEB_PORT), PILOT_DATA_DIR: data },
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(hub);
hub.stdout!.on("data", (c) => (hubLog += c));
hub.stderr!.on("data", (c) => (hubLog += c));
/** Set once every check passed: then the hub stopping (Ctrl-C in --serve) is the end, not a failure. */
let passed = false;
hub.on("exit", (code, signal) => (passed ? finish() : finish(`the hub exited (${code ?? signal})`)));
const web = `http://127.0.0.1:${WEB_PORT}`;
for (let waited = 0; ; waited += 100) {
  try { if ((await fetch(`${web}/health`)).status) break; } catch { /* not listening yet */ }
  if (waited > 10_000) finish(`the hub did not open port ${WEB_PORT}`);
  await sleep(100);
}
await fetch(`${web}/profile`, { method: "POST", body: JSON.stringify({ names: "Rulo" }) });

/** Everything the hub broadcasts, as this script's own phone sees it (it never acknowledges cards). Reconnects like any client. */
const seen: Record<string, any>[] = [];
let streamDrops = 0;
void (async () => {
  for (;;) {
    try {
      const res = await fetch(`${web}/events`);
      const parser = new SseParser();
      const decoder = new TextDecoder();
      for await (const chunk of res.body!) for (const p of parser.push(decoder.decode(chunk, { stream: true }))) seen.push(JSON.parse(p));
    } catch {
      // dropped: the hub replays its snapshot on reconnect
    }
    streamDrops++;
    await sleep(200);
  }
})();
async function hubSaw(what: string, match: (e: Record<string, any>) => boolean, from = 0): Promise<Record<string, any>> {
  const until = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < until) {
    const hit = seen.slice(from).find(match);
    if (hit) return hit;
    await sleep(200);
  }
  finish(`the hub never saw ${what}`);
}
const lastStatus = () => seen.filter((e) => e.kind === "status").at(-1) ?? {};

/** A tone in syllables, like the smoke test: the stub transcribes its scripted question whatever it hears. */
const wav = join(scratch, "speech.wav");
{
  const n = 16000 * 8;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(i % 8000 < 4000 ? Math.round(800 * Math.sin((2 * Math.PI * 220 * i) / 16000)) : 0, 44 + i * 2);
  writeFileSync(wav, b);
}
const startClip = () => {
  const clip = spawn(process.execPath, ["scripts/fake-clip.ts", wav, "--port", String(DEVICE_PORT), "--loop"], { cwd: ROOT, stdio: "ignore" });
  children.push(clip);
  return clip;
};

// --- The run ------------------------------------------------------------------------------------

step("the app connects to the hub");
adb("shell", "am", "start", "-n", `${APP}/.MainActivity`, "--es", "hub", `http://localhost:${WEB_PORT}`, "--ez", "welcomed", "true");
await waitFor("Ahora with no clip", (n) => n.id === "device" && n.text === "Sin clip");
await shots("ahora-empty");

step("the clip emulator connects");
let clip = startClip();
await waitFor("the clip connected", (n) => n.id === "device" && n.text === "Clip conectado");

step("a tap on the pill starts listening");
await tapId("pill");
await hubSaw("listening start", (e) => e.kind === "status" && e.listening === true);

step("the DILO line appears and the app acknowledges it");
const dilo = await waitFor("the DILO line", (n) => n.id === "dilo-text" && n.text === STUB_REPLY);
const cue = await hubSaw("the DILO cue", (e) => e.kind === "cue" && e.label === "DILO" && typeof e.id === "string");
const ack = await hubSaw("the app's acknowledgement", (e) => e.kind === "stages" && e.id === cue.id && typeof e.stages?.phone === "number");
console.log(`  DILO on the app: ${ack.stages.phone - ack.stages.sent} ms from the hub sending it to the app's acknowledgement (hub clock)`);
if (!dilo) finish("no DILO");
await sleep(800); // the live view opens for the new session; collapse it to see Ahora
if (screen().some(byId("live"))) {
  await shots("live");
  await tapId("live-collapse");
  await sleep(800);
}
await shots("ahora-dilo");

step("Reuniones opens the made-up meeting");
await open("Reuniones");
await shots("reuniones");
await tapId(`meeting-${MEETING}`);
await waitFor("the meeting title", (n) => n.id === "md-title" && n.text === "Revisión de la beta");
await shots("reunion");

step("Acciones approves the proposed task");
await open("Acciones");
await shots("acciones");
let mark = seen.length;
await tapId("approve-a1-1");
await hubSaw("the approval", (e) => e.kind === "actions" && !e.pending.some((a: any) => a.id === "a1-1") && e.tasks.some((t: any) => t.title === "Enviar las notas de la versión"), mark);

step("Memoria keeps the proposed fact");
await open("Memoria");
await shots("memoria");
await tapId("keep-f1-1");
for (let i = 0; ; i++) {
  const facts = (await (await fetch(`${web}/facts`)).json()).facts as any[];
  if (facts.find((f) => f.id === "f1-1")?.status === "kept") break;
  if (i > 50) finish("the fact was not kept");
  await sleep(200);
}

await open("Dispositivos");
await shots("dispositivos");
await open("Ajustes");
await shots("ajustes");

step("with the clip gone, the phone becomes the device");
clip.kill();
await hubSaw("the clip leaving", (e) => e.kind === "status" && e.clip === false);
// Inicio leaves "Usar el teléfono" to Dispositivos, which the device pill opens (add-projects 2.2).
await open("Dispositivos");
await tapId("phone-toggle");
mark = seen.length;
await hubSaw("the phone as the device", (e) => e.kind === "status" && e.clip === true && e.device === "phone", mark);
const before = seen.filter((e) => e.kind === "recorded").at(-1)?.ms ?? 0;
await hubSaw("audio from the phone", (e) => e.kind === "recorded" && e.ms > before + 1000, mark);
await waitFor("the phone shown as the device", (n) => n.id === "device" && n.text === "Teléfono conectado");

step("Mirar takes a photo with the phone's camera");
mark = seen.length;
await fetch(`${web}/look`, { method: "POST" });
await hubSaw("a photo from the phone", (e) => e.kind === "cue" && typeof e.photo === "string" && e.photo.startsWith("data:image/jpeg"), mark);
await sleep(1500);
await shots("ahora-phone");

step("the clip comes back and takes over");
clip = startClip();
await hubSaw("the clip back as the device", (e) => e.kind === "status" && e.clip === true && e.device === "clip", mark);
await waitFor("the takeover note", (n) => n.id === "phone-note" || n.text.startsWith("El clip tomó el control"));
if (lastStatus().device !== "clip") finish("the phone is still the device");

passed = true;
if (streamDrops) console.log(`(this script's event stream reconnected ${streamDrops} time(s))`);
console.log(`android-e2e: passed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
if (opts.serve) {
  console.log(`the stubbed hub stays on http://localhost:${WEB_PORT} (reversed to the device); Ctrl-C to stop`);
  await new Promise(() => {});
}
finish();
