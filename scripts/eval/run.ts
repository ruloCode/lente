// Replays the synthetic meeting set through the real hub and measures it. Each dialogue gets a
// fresh hub (so no memory leaks between them) in a scratch data folder; the clip emulator streams
// the audio at real-time pace over the real protocol; Muse Voice Transcribe and Muse Spark are the
// real ones. The runner listens to the hub's event stream like a phone would.
//
//   pnpm eval [--only d01-standup] [--vision 5] [--record-only] [--out results/eval-<stamp>]
//
// `--record-only` replays in Solo grabar: turns are recorded, and the model calls per label show
// that no addressing or reply call was made.
//
// Needs MODEL_API_KEY (.env) and `pnpm eval:render` done first. A full pass takes under ten minutes.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { TRANSCRIBE_MODEL, chatTargets } from "../../src/providers.ts";
import { SseParser } from "../../src/sse.ts";
import type { StageName, Stages } from "../../src/stages.ts";
import { type RawCue, type RawTurn, type RawUsage, type Summary, matchLines, spread, summarize, type LineResult, type Spread } from "./metrics.ts";
import { SET_FILE, labelCounts, validateSet, type Dialogue, type LineTiming } from "./set.ts";

const DEVICE_PORT = 7072;
const WEB_PORT = 8082;
const LINGER_MS = 9000; // the clip stays connected this long after its audio so late cues are caught
const SETTLE_MS = 1500;
const HUB_START_TIMEOUT_MS = 15_000;
const LOOK_TIMEOUT_MS = 20_000;
const AUDIO_DIR = "eval/audio";

const { values } = parseArgs({
  options: { only: { type: "string" }, vision: { type: "string", default: "5" }, out: { type: "string" }, "record-only": { type: "boolean", default: false } },
});
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
const outDir = values.out ?? join("results", `eval-${stamp}`);
mkdirSync(outDir, { recursive: true });

const children = new Set<ChildProcess>();
process.on("SIGINT", () => {
  for (const c of children) c.kill();
  process.exit(130);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Hub {
  proc: ChildProcess;
  /** Everything the hub broadcast, with the time it reached us. */
  events: { at: number; msg: Record<string, any> }[];
  stop(): Promise<void>;
}

async function startHub(name: string): Promise<Hub> {
  const dataDir = join(outDir, "data", name);
  mkdirSync(dataDir, { recursive: true });
  const log = createWriteStream(join(outDir, `${name}.hub.log`));
  const proc = spawn(process.execPath, ["--env-file-if-exists=.env", "src/pilot.ts"], {
    env: { ...process.env, PILOT_DEVICE_PORT: String(DEVICE_PORT), PILOT_WEB_PORT: String(WEB_PORT), PILOT_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(proc);
  proc.stdout!.pipe(log);
  proc.stderr!.pipe(log);
  const deadline = Date.now() + HUB_START_TIMEOUT_MS;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${WEB_PORT}/manifest.webmanifest`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`The hub did not start on port ${WEB_PORT} within ${HUB_START_TIMEOUT_MS} ms (is another hub or eval running there? see ${name}.hub.log)`);
    }
    await sleep(200);
  }
  const events: Hub["events"] = [];
  const abort = new AbortController();
  void (async () => {
    const res = await fetch(`http://127.0.0.1:${WEB_PORT}/events`, { signal: abort.signal });
    const parser = new SseParser();
    const decoder = new TextDecoder();
    for await (const chunk of res.body!) {
      for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) {
        try {
          const msg = JSON.parse(payload);
          events.push({ at: performance.now(), msg });
          // Acknowledge cards like the phone does, so the hub times delivery.
          if ((msg.kind === "cue" || msg.kind === "live") && typeof msg.id === "string") void post("/seen", { id: msg.id });
        } catch {
          // keep-alive or partial payload
        }
      }
    }
  })().catch(() => {});
  await sleep(300); // the stream replays the current status on connect; start counting after it
  events.length = 0;
  return {
    proc,
    events,
    async stop() {
      abort.abort();
      proc.kill();
      children.delete(proc);
      log.end();
      await sleep(300);
    },
  };
}

const post = (path: string, body?: object) => fetch(`http://127.0.0.1:${WEB_PORT}${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });

/** Runs the clip emulator and resolves when it exits; `onConnected` fires when the hub sees the clip. */
function runClip(hub: Hub, wav: string, extraArgs: string[] = []): { done: Promise<void>; connectedAt: Promise<number> } {
  const proc = spawn(process.execPath, ["scripts/fake-clip.ts", wav, "--port", String(DEVICE_PORT), "--linger-ms", String(LINGER_MS), ...extraArgs], { stdio: "ignore" });
  children.add(proc);
  const done = new Promise<void>((resolve, reject) => {
    proc.on("exit", (code) => {
      children.delete(proc);
      code === 0 ? resolve() : reject(new Error(`fake-clip exited with ${code}`));
    });
  });
  const connectedAt = (async () => {
    for (let waited = 0; waited < 10_000; waited += 20) {
      const seen = hub.events.find((e) => e.msg.kind === "status" && e.msg.clip === true);
      if (seen) return seen.at;
      await sleep(20);
    }
    throw new Error("The hub never saw the clip connect");
  })();
  return { done, connectedAt };
}

interface DialogueRun {
  id: string;
  results: LineResult[];
  mergedTurns: number;
  usage: RawUsage[];
  turns: number;
  cues: number;
  models: string[];
  /** Stage timings of the cards, with the phone stage from the acknowledgement. */
  stages: Stages[];
}

async function replay(d: Dialogue): Promise<DialogueRun> {
  const wav = join(AUDIO_DIR, `${d.id}.wav`);
  const timelineFile = join(AUDIO_DIR, `${d.id}.timeline.json`);
  if (!existsSync(wav) || !existsSync(timelineFile)) throw new Error(`${wav} is missing: run \`pnpm eval:render\` first`);
  const timings = (JSON.parse(readFileSync(timelineFile, "utf8")) as { lines: LineTiming[] }).lines;
  const hub = await startHub(d.id);
  try {
    await post("/profile", { names: d.names.join(", ") });
    if (values["record-only"]) await post("/assist-mode/record");
    const clip = runClip(hub, wav);
    const t0 = await clip.connectedAt;
    await clip.done;
    await sleep(SETTLE_MS);
    const turns: RawTurn[] = [];
    const cues: RawCue[] = [];
    const usage: RawUsage[] = [];
    const models = new Set<string>();
    const stages: Stages[] = [];
    const acknowledged = new Map(hub.events.filter((e) => e.msg.kind === "stages").map((e) => [e.msg.id, e.msg.stages as Stages]));
    for (const { at, msg } of hub.events) {
      if (msg.kind === "turn" && msg.turnId !== undefined && typeof msg.audioStartMs === "number") {
        turns.push({ turnId: String(msg.turnId), startMs: msg.audioStartMs, endMs: msg.audioEndMs, atMs: at - t0, text: msg.text, speaker: msg.speaker });
      } else if (msg.kind === "cue" && msg.label === "DILO" && msg.turnId !== undefined) {
        cues.push({ turnId: String(msg.turnId), atMs: at - t0, modelMs: msg.ms, meaning: typeof msg.meaning === "string" && msg.meaning !== "" });
        if (msg.stages) stages.push(acknowledged.get(msg.id) ?? msg.stages);
      } else if (msg.kind === "usage") {
        usage.push({ label: msg.label, ms: msg.ms, promptTokens: msg.promptTokens, cachedTokens: msg.cachedTokens, completionTokens: msg.completionTokens });
        models.add(msg.model);
      }
    }
    writeFileSync(join(outDir, `${d.id}.events.jsonl`), hub.events.map((e) => JSON.stringify({ atMs: Math.round(e.at - t0), ...e.msg, photo: undefined })).join("\n") + "\n");
    const { lines: results, mergedTurns } = matchLines(d, timings, turns, cues);
    return { id: d.id, results, mergedTurns, usage, turns: turns.length, cues: cues.length, models: [...models], stages };
  } finally {
    await hub.stop();
  }
}

interface VisionRun {
  requests: number;
  answered: number;
  /** Phone's Look press → card with the description. */
  roundTrip: Spread;
  /** Model time for the description, as the hub reports it. */
  modelMs: Spread;
}

/** Synthetic pictures (ffmpeg test patterns) so the vision path is timed without any real photo. */
function makePhotos(dir: string): string {
  mkdirSync(dir, { recursive: true });
  for (const [i, src] of ["testsrc2=size=640x480", "smptebars=size=640x480", "mandelbrot=size=640x480"].entries()) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", src, "-frames:v", "1", join(dir, `p${i}.jpg`)]);
  }
  return dir;
}

async function measureVision(count: number): Promise<VisionRun | undefined> {
  if (count <= 0) return undefined;
  const photos = makePhotos(join(outDir, "photos"));
  const silence = join(outDir, "silence.wav");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", String(count * 4 + 4), "-c:a", "pcm_s16le", silence]);
  const hub = await startHub("vision");
  try {
    const clip = runClip(hub, silence, ["--photos", photos]);
    await clip.connectedAt;
    const roundTrip: number[] = [];
    const modelMs: number[] = [];
    for (let i = 0; i < count; i++) {
      const before = hub.events.length;
      const pressed = performance.now();
      await post("/look");
      const deadline = pressed + LOOK_TIMEOUT_MS;
      let card: (typeof hub.events)[number] | undefined;
      while (!card && performance.now() < deadline) {
        card = hub.events.slice(before).find((e) => e.msg.kind === "cue" && e.msg.label === "ON SCREEN");
        if (!card) await sleep(25);
      }
      if (card) {
        roundTrip.push(Math.round(card.at - pressed));
        if (typeof card.msg.ms === "number") modelMs.push(card.msg.ms);
      }
      await sleep(1000);
    }
    writeFileSync(join(outDir, "vision.events.jsonl"), hub.events.map((e) => JSON.stringify({ ...e.msg, photo: undefined })).join("\n") + "\n");
    await clip.done.catch(() => {});
    return { requests: count, answered: roundTrip.length, roundTrip: spread(roundTrip), modelMs: spread(modelMs) };
  } finally {
    await hub.stop();
  }
}

const pct = (v: number | undefined) => (v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
const sec = (v: number | undefined) => (v === undefined ? "n/a" : `${(v / 1000).toFixed(2)} s`);

function markdown(date: string, set: Dialogue[], s: Summary, vision: VisionRun | undefined, models: string[]): string {
  const c = labelCounts(set);
  const effort = chatTargets().find((t) => models.includes(t.id))?.extra?.reasoning_effort ?? "default";
  const rows = [
    ["Transcription finalize (line end → turn)", `${sec(s.finalize.p50)} / ${sec(s.finalize.p95)}`, `n=${s.finalize.n}`],
    ["Cue (question end → card on the phone)", `${sec(s.cue.p50)} / ${sec(s.cue.p95)}`, `n=${s.cue.n}; p90 ${sec(s.cue.p90)}`],
    ["Spanish meaning on the card", `${s.meanings.english.withMeaning} of ${s.meanings.english.cued} English`, `${s.meanings.spanish.withMeaning} of ${s.meanings.spanish.cued} Spanish (should be 0)`],
    ["Reply model time", `${sec(s.modelMs.p50)} / ${sec(s.modelMs.p95)}`, `n=${s.modelMs.n}`],
    ["Addressing precision", pct(s.scores.precision), `${s.scores.truePositives} right of ${s.scores.truePositives + s.scores.falsePositives} cues`],
    ["Addressing recall", pct(s.scores.recall), `${s.scores.truePositives} of ${s.scores.truePositives + s.scores.falseNegatives} questions for the wearer`],
    ["False cue rate", pct(s.scores.falseCueRate), `on questions for someone else; ${s.scores.cuesOnStatements} cue(s) on statements`],
    ["Questions heard", `${s.scores.questionsHeard} of ${s.scores.questions}`, `${s.mergedTurns} turn(s) merged two lines`],
    ["Vision (Look → card)", vision ? `${sec(vision.roundTrip.p50)} / ${sec(vision.roundTrip.p95)}` : "not run", vision ? `${vision.answered} of ${vision.requests}; model ${sec(vision.modelMs.p50)} / ${sec(vision.modelMs.p95)}` : ""],
    ["Tokens per meeting", `${s.tokensPerMeeting.prompt} in (${s.tokensPerMeeting.cached} cached) / ${s.tokensPerMeeting.completion} out`, `${s.tokensPerMeeting.calls} model calls`],
  ];
  const STAGE_ROWS: [StageName, string][] = [
    ["turn", "Transcription (last audio at the hub → turn)"],
    ["asked", "Speaker label and addressing (turn → reply requested)"],
    ["firstToken", "Model first token"],
    ["done", "Rest of the reply"],
    ["sent", "Hub (reply → event stream)"],
    ["phone", "Delivery (event stream → phone's acknowledgement at the hub)"],
  ];
  const stageRows = STAGE_ROWS.filter(([k]) => s.stages[k]).map(([k, name]) => `| ${name} | ${sec(s.stages[k]!.p50)} / ${sec(s.stages[k]!.p95)} | n=${s.stages[k]!.n} |`);
  return [
    `### Eval run ${date}`,
    "",
    `Set: ${set.length} synthetic dialogues, ${c.lines} lines, ${c.questions} questions (${c.addressed} aimed at the wearer). Replayed at real time through the hub with the clip emulator.`,
    `Models: ${models.join(", ") || "n/a"} (reasoning effort ${effort}); transcription \`${TRANSCRIBE_MODEL}\` in DIARIZATION mode; wearer name "${set[0].names.join(", ")}"; ${values["record-only"] ? "Solo grabar (no cues)" : "cues only when addressed"}.`,
    "",
    "| Metric | p50 / p95 or value | Detail |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
    ...(stageRows.length ? ["Where the cue time goes, stage by stage:", "", "| Stage | p50 / p95 | Cues |", "|---|---|---|", ...stageRows, ""] : []),
  ].join("\n");
}

const set = validateSet(JSON.parse(readFileSync(SET_FILE, "utf8"))).filter((d) => !values.only || d.id === values.only);
if (!set.length) throw new Error(`No dialogue matches --only ${values.only}`);
if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set (put it in .env): the eval calls the real Meta models");

const runs: DialogueRun[] = [];
for (const d of set) {
  const started = performance.now();
  const run = await replay(d);
  runs.push(run);
  const q = run.results.filter((r) => r.question);
  const perLabel = new Map<string, number>();
  for (const u of run.usage) perLabel.set(u.label, (perLabel.get(u.label) ?? 0) + 1);
  const calls = [...perLabel].map(([label, n]) => `${label} ${n}`).join(", ") || "none";
  console.log(`${d.id}: ${run.turns} turns, ${q.filter((r) => r.turnId).length}/${q.length} questions heard, ${run.cues} cue(s), model calls: ${calls}, ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
const vision = await measureVision(values.only ? 0 : Number(values.vision));
const summary = summarize(runs);
const models = [...new Set(runs.flatMap((r) => r.models))];
const date = new Date().toISOString().slice(0, 10);
writeFileSync(join(outDir, "summary.json"), JSON.stringify({ date, models, summary, vision, dialogues: runs.map(({ id, results, mergedTurns, usage, stages }) => ({ id, results, mergedTurns, usage, stages })) }, null, 1) + "\n");
const md = markdown(date, set, summary, vision, models);
writeFileSync(join(outDir, "summary.md"), md);
console.log("\n" + md);
console.log(`Raw events and summary in ${outDir}/`);
