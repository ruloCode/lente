// Help on demand against the real model: one call per kind (Aportar, Pregunta, ¿De qué hablan?)
// on a synthetic English meeting, through the same prompts, parsing and streamed call as the hub.
// The dialogue is invented; no real meeting. Prints each card and its time.
//
//   pnpm bench:help

import { HELP_LABELS, type HelpKind } from "../src/briefing.ts";
import { streamResponse } from "../src/chat.ts";
import { requestHelp } from "../src/help.ts";
import { chatTargets } from "../src/providers.ts";

const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;
if (!target.apiKey) {
  console.error(`${target.keyEnv} is not set: nothing to measure`);
  process.exit(1);
}

const DIALOGUE = [
  { speaker: "A", text: "Okay, next item: the billing export. Where are we with it?" },
  { speaker: "B", text: "The backend is done, but the CSV option still has a bug with dates." },
  { speaker: "A", text: "The client wants it by Friday. Is that still realistic?" },
  { speaker: "C", text: "QA needs at least two days, so Friday is tight." },
  { speaker: "B", text: "We could ship without CSV and add it next sprint." },
  { speaker: "A", text: "I'd rather not surprise the client. Let's think about it." },
];

console.log(`${target.label}\n`);
for (const kind of Object.keys(HELP_LABELS) as HelpKind[]) {
  let ttftMs: number | undefined;
  const out = await requestHelp({ kind, assistMode: "assist", turns: DIALOGUE, memory: "" }, async (messages) => {
    const r = await streamResponse(target, messages, { maxTokens: 400 });
    ttftMs = r.ttftMs;
    return r.text;
  });
  if (!out.ok) {
    console.log(`${HELP_LABELS[kind]}: refused (${out.reason})`);
    continue;
  }
  console.log(`${out.label} · ${out.ms} ms (first token ${ttftMs === undefined ? "?" : Math.round(ttftMs)} ms)\n  ${out.text}${out.meaning ? `\n  ES: ${out.meaning}` : ""}`);
}
