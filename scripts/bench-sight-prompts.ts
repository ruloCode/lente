// Ver's live prompt A/B against the real model (ship-hackathon 6.2): the checklist prompt Ver shipped with
// first (5ee0323) against today's one-sentence `SIGHT_LIVE_PROMPT`, on the same frames, through the same
// streamed Responses call the hub makes for a live read (Muse Spark 1.3, minimal effort, 800-token cap,
// "First frame." as the text part). Prints time to first token, total time and output tokens per prompt.
//
//   node --env-file-if-exists=.env scripts/bench-sight-prompts.ts [--reps 2] [frame.jpg …]
//
// The default frames are three images from docs/promo/ with no one in them but a hand: a render of the clip
// on glasses (an object), the ecosystem infographic (text to read) and the real photo of the clip rig held up
// close. Calls are interleaved (rep → frame → prompt) so drift in the API hits both prompts alike. Numbers
// and reply lengths go to results/; the replies are printed once for a reader to judge, never saved.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import { type ChatMessage, streamResponse } from "../src/chat.ts";
import { chatTargets } from "../src/providers.ts";
import { parseSight, SIGHT_LIVE_PROMPT, UNCHANGED } from "../src/sight.ts";
import { percentile } from "../src/stats.ts";
import { priceTokens } from "../src/usage-meter.ts";

/** The hub's cap for a live read in Ver (src/pilot.ts, describeLive). */
const LIVE_MAX_TOKENS = 800;
const DEFAULT_FRAMES = ["docs/promo/lente-hero.jpg", "docs/promo/lente-ecosistema.jpg", "docs/promo/clip-rig-in-hand.png"];

/** Ver's first live prompt, as committed in 5ee0323 (src/sight.ts), kept here only to measure against. */
const CHECKLIST_RULES =
  "Rules that always hold: " +
  "never tell the person to move, walk, cross, step, stop, wait or go anywhere, and never say a path, street or stair is safe or clear; " +
  "never name a person or guess anyone's identity, age, health or feelings from a face; " +
  "never give medical advice or read medicine doses as instructions; " +
  "when you are not sure (blur, glare, too far), say «no estoy seguro» and what would help (acercar, más luz).";
const CHECKLIST_PROMPT =
  "You are the eyes of a person who is blind or has low vision, seeing through a small camera on their glasses. " +
  "Speak Spanish, directly to them (tú), as one or two short spoken sentences, no lists, no markdown, no preamble. In this order: " +
  "1) any text in view, read word for word (signs, screens, paper); if it is longer than about 250 characters, say only what kind of text it is and «pídeme que lo lea»; " +
  "2) what is held up close to the camera; for a banknote, its value in Colombian pesos when you can read it; " +
  "3) people: how many and where, nothing about who they are; " +
  "4) the rest of the scene in a few words. " +
  "Say where things are from their point of view: «al frente», «a tu izquierda», «a tu derecha», «cerca», «lejos». " +
  "Skip any step that has nothing: never say what is absent («no veo texto», «no hay personas»); start with the first thing that is there. " +
  `If the view shows nothing new compared with the previous description, answer exactly ${UNCHANGED} and nothing else. ` +
  CHECKLIST_RULES;

const PROMPTS = [
  { id: "checklist", prompt: CHECKLIST_PROMPT },
  { id: "one-sentence", prompt: SIGHT_LIVE_PROMPT },
];

const { values, positionals } = parseArgs({ allowPositionals: true, options: { reps: { type: "string", default: "2" } } });
const REPS = Number(values.reps);
const framePaths = positionals.length ? positionals : DEFAULT_FRAMES;

const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
if (!target.apiKey) {
  console.error(`${target.keyEnv} is not set: nothing to measure`);
  process.exit(1);
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const frames = framePaths.map((path) => {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error(`${path}: not a JPEG, PNG or WebP frame`);
  const bytes = readFileSync(path);
  return { name: basename(path), kb: Math.round(bytes.length / 1024), url: `data:${mime};base64,${bytes.toString("base64")}` };
});

interface Run {
  prompt: string;
  frame: string;
  rep: number;
  ttftMs: number | undefined;
  totalMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  usd: number | undefined;
  replyChars: number;
  unchanged: boolean;
  cut: boolean;
}

const runs: Run[] = [];
const seen = new Set<string>();
console.log(`${target.label} · ${frames.length} frames × ${PROMPTS.length} prompts × ${REPS}\n`);
for (let rep = 1; rep <= REPS; rep++) {
  for (const frame of frames) {
    for (const { id, prompt } of PROMPTS) {
      const messages: ChatMessage[] = [
        { role: "system", content: prompt },
        { role: "user", content: [{ type: "text", text: "First frame." }, { type: "image_url", image_url: { url: frame.url } }] },
      ];
      try {
        const r = await streamResponse(target, messages, { maxTokens: LIVE_MAX_TOKENS, allowIncomplete: true });
        const said = parseSight(r.text);
        const usd = priceTokens(target.model, { input: r.promptTokens ?? 0, cached: r.cachedTokens ?? 0, output: r.completionTokens ?? 0, calls: 1 });
        runs.push({ prompt: id, frame: frame.name, rep, ttftMs: r.ttftMs, totalMs: r.totalMs, inputTokens: r.promptTokens, outputTokens: r.completionTokens, usd, replyChars: r.text.length, unchanged: said === undefined, cut: r.finishReason === "length" });
        console.log(`${id.padEnd(12)} ${frame.name.padEnd(24)} rep ${rep} · first token ${fmt(r.ttftMs)} · total ${fmt(r.totalMs)} · ${r.completionTokens ?? "?"} out`);
        if (!seen.has(`${id}|${frame.name}`)) {
          seen.add(`${id}|${frame.name}`);
          console.log(`    «${(said ?? r.text).trim()}»`);
        }
      } catch (error) {
        console.error(`${id} ${frame.name} rep ${rep}: ${(error as Error).message.slice(0, 200)}`);
      }
    }
  }
}

const mid = (xs: (number | undefined)[]) => percentile(xs.filter((x): x is number => x !== undefined), 50);
const rows = PROMPTS.map(({ id }) => {
  const mine = runs.filter((r) => r.prompt === id);
  const usd = mine.reduce((sum, r) => sum + (r.usd ?? 0), 0);
  return {
    prompt: id,
    n: mine.length,
    ttftP50: mid(mine.map((r) => r.ttftMs)),
    ttftMax: percentile(mine.flatMap((r) => (r.ttftMs === undefined ? [] : [r.ttftMs])), 100),
    totalP50: mid(mine.map((r) => r.totalMs)),
    outP50: mid(mine.map((r) => r.outputTokens)),
    outMean: mine.length ? Math.round(mine.reduce((s, r) => s + (r.outputTokens ?? 0), 0) / mine.length) : undefined,
    inP50: mid(mine.map((r) => r.inputTokens)),
    unchanged: mine.filter((r) => r.unchanged).length,
    cut: mine.filter((r) => r.cut).length,
    usd,
  };
});

const table = [
  "| Prompt | n | First token p50 | First token max | Total p50 | Output tokens p50 (mean) | Input tokens p50 | Unchanged | Cut at cap | Cost |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.prompt} | ${r.n} | ${fmt(r.ttftP50)} | ${fmt(r.ttftMax)} | ${fmt(r.totalP50)} | ${r.outP50 ?? "—"} (${r.outMean ?? "—"}) | ${r.inP50 ?? "—"} | ${r.unchanged} | ${r.cut} | US$ ${r.usd.toFixed(4)} |`),
].join("\n");
// Per frame there are only `REPS` calls, too few for a percentile: every value is listed, in run order.
const perFrame = [
  "| Frame | KB | " + PROMPTS.map((p) => `${p.id}: first token · output tokens`).join(" | ") + " |",
  "|---|---|" + PROMPTS.map(() => "---").join("|") + "|",
  ...frames.map((f) => {
    const cells = PROMPTS.map(({ id }) => {
      const mine = runs.filter((r) => r.prompt === id && r.frame === f.name);
      return `${mine.map((r) => fmt(r.ttftMs)).join(", ")} · ${mine.map((r) => r.outputTokens ?? "—").join(", ")}`;
    });
    return `| ${f.name} | ${f.kb} | ${cells.join(" | ")} |`;
  }),
].join("\n");
const spend = runs.reduce((sum, r) => sum + (r.usd ?? 0), 0);
console.log(`\n${table}\n\n${perFrame}\n\nSpend: US$ ${spend.toFixed(4)} (list prices, src/usage-meter.ts)`);

const started = Date.now();
const dir = `results/sight-${new Date(started).toISOString().slice(0, 10)}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/prompts-${started}.json`, JSON.stringify({ model: target.model, frames: frames.map(({ name, kb }) => ({ name, kb })), rows, runs }, null, 2));
console.log(`Numbers: ${dir}/prompts-${started}.json`);

function fmt(ms: number | undefined): string {
  return ms === undefined ? "—" : `${(ms / 1000).toFixed(2)} s`;
}
