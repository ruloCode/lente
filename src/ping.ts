// Smoke test: one real call to the Meta Model API.
// Lists the models this key can see, then asks Muse Spark for a one-line cue.

import { META_BASE_URL } from "./providers.ts";

const key = process.env.MODEL_API_KEY;
if (!key) {
  console.error("MODEL_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const models = await fetch(`${META_BASE_URL}/models`, { headers });
if (!models.ok) {
  console.error(`GET /models → HTTP ${models.status}: ${await models.text()}`);
  process.exit(1);
}
const list = (await models.json()) as { data?: { id: string }[] };
console.log("Models:", (list.data ?? []).map((m) => m.id).join(", "));

const started = performance.now();
const res = await fetch(`${META_BASE_URL}/responses`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "muse-spark-1.3",
    input:
      'You whisper meeting cues. Someone just asked me: "What would you cut to ship by Friday?". ' +
      "Reply with ONE sentence I can say, under 90 characters.",
  }),
});
if (!res.ok) {
  console.error(`POST /responses → HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const body = (await res.json()) as {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: unknown;
};
const text = (body.output ?? [])
  .filter((item) => item.type === "message")
  .flatMap((item) => item.content ?? [])
  .map((part) => part.text ?? "")
  .join("");
console.log(`Muse Spark 1.3 (${Math.round(performance.now() - started)} ms): ${text}`);
console.log("Usage:", JSON.stringify(body.usage));
