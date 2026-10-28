// Measures how much of the memory prefix the model's prompt cache serves on repeated calls.
// The memory is synthetic (invented projects, no real meetings). Each reply call changes only
// the conversation and the question, as in a live meeting. Streamed replies carry no `usage`,
// so these calls are not streamed.
//
//   pnpm bench:cache [meetings=12] [calls=6]

import { briefingMessages, memoryPrefix, replyMessages } from "../src/briefing.ts";
import { completeChat } from "../src/chat.ts";
import { mergeGlossary } from "../src/language-profile.ts";
import { type Meeting, newMeeting } from "../src/meetings.ts";
import { chatTargets } from "../src/providers.ts";

const meetingCount = Number(process.argv[2] ?? 12);
const calls = Number(process.argv[3] ?? 6);
const target = chatTargets().find((t) => t.id === "spark-1.3-minimal")!;

const TOPICS = ["billing export", "onboarding flow", "search ranking", "mobile release", "data retention", "pricing page", "audit log", "API limits"];
const BASE = Date.UTC(2026, 9, 1, 15, 0, 0);

function synthetic(n: number): Meeting {
  const topic = TOPICS[n % TOPICS.length];
  const m = newMeeting(`Review ${n + 1}: ${topic}`, BASE + n * 86_400_000);
  m.status = "done";
  m.notes = {
    summary: `The team reviewed the ${topic} and agreed to cut scope for the first release. Ana asked for a new estimate.`,
    decisions: [{ text: `Ship the ${topic} behind a flag first`, evidence: ["t1"] }, { text: `Postpone the second phase of the ${topic}`, evidence: ["t2"] }],
    commitments: [
      { what: `send Ana the estimate for the ${topic}`, owner: "you", due: "Thursday", evidence: ["t3"] },
      { what: `write the rollout checklist for the ${topic}`, owner: "Luis", evidence: ["t4"] },
    ],
    openQuestions: [{ text: `Who owns the on-call rotation for the ${topic}?`, evidence: ["t5"] }],
  };
  return m;
}

const meetings = Array.from({ length: meetingCount }, (_, i) => synthetic(i));
const glossary = mergeGlossary([], [{ term: "GA", meaning: "disponibilidad general", example: "We reach GA in March." }, { term: "SLA", meaning: "acuerdo de nivel de servicio", example: "The SLA is 99.9." }], meetings[0].id, BASE);
const memory = memoryPrefix({ phrases: ["i'll double-check and get back to you", "sounds good to me"], glossary, meetings });
const QUESTIONS = ["Can you send the estimate by Thursday?", "Who owns the rollout checklist?", "Is the second phase still on?", "What did we decide about the flag?", "When do you expect GA?", "Can you take the on-call this week?"];
const conversation = "A: Okay, let's go through the open items.\nB: Right, starting with the estimate.";

console.log(`${target.label}\nmemory: ${memory.length} chars from ${meetingCount} synthetic meetings\n`);
console.log("call | prompt tokens | cached | hit    | ms");
let promptSum = 0;
let cachedSum = 0;
for (let i = 0; i < calls; i++) {
  const messages = i === calls - 1 ? briefingMessages(memory, "Sprint review", ["Ana"]) : replyMessages(memory, conversation, QUESTIONS[i % QUESTIONS.length]);
  const r = await completeChat(target, messages, { maxTokens: 60 });
  const prompt = r.promptTokens ?? 0;
  const cached = r.cachedTokens ?? 0;
  console.log(`${String(i + 1).padStart(4)} | ${String(prompt).padStart(13)} | ${String(cached).padStart(6)} | ${((100 * cached) / Math.max(prompt, 1)).toFixed(1).padStart(5)}% | ${Math.round(r.totalMs)}`);
  if (i > 0) {
    promptSum += prompt;
    cachedSum += cached;
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
console.log(`\nhit rate on calls 2-${calls}: ${((100 * cachedSum) / Math.max(promptSum, 1)).toFixed(1)}% of prompt tokens (${cachedSum}/${promptSum})`);
