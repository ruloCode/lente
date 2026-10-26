import { SseParser, deltaText } from "./sse.ts";
import type { ChatTarget } from "./providers.ts";

export interface StreamTiming {
  text: string;
  /** Request sent → first visible text token. */
  ttftMs: number | undefined;
  totalMs: number;
}

/** Streams one chat completion and times it. Throws with the API's own error text. */
export async function streamChat(
  target: ChatTarget,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 120,
): Promise<StreamTiming> {
  if (!target.apiKey) throw new Error(`${target.keyEnv} is not set`);
  const started = performance.now();
  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: target.model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      ...target.extra,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`${target.id}: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }

  const parser = new SseParser();
  const decoder = new TextDecoder();
  let text = "";
  let ttftMs: number | undefined;
  for await (const chunk of res.body) {
    for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) {
      const delta = deltaText(payload);
      if (delta && ttftMs === undefined) ttftMs = performance.now() - started;
      text += delta;
    }
  }
  return { text, ttftMs, totalMs: performance.now() - started };
}
