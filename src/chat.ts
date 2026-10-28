import { SseParser, deltaText } from "./sse.ts";
import type { ChatTarget } from "./providers.ts";

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
}

export interface StreamTiming {
  text: string;
  /** Request sent → first visible text token. */
  ttftMs: number | undefined;
  totalMs: number;
}

/** Streams one chat completion and times it. Throws with the API's own error text. */
export async function streamChat(
  target: ChatTarget,
  messages: ChatMessage[],
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

export interface Completion {
  text: string;
  totalMs: number;
  /** Prompt tokens, and how many of them were served from the prompt cache. */
  promptTokens: number | undefined;
  cachedTokens: number | undefined;
}

/**
 * One chat completion without streaming. Used where the whole answer is needed at once (a
 * structured briefing) and by the cache benchmark, because streamed replies carry no `usage`.
 */
export async function completeChat(target: ChatTarget, messages: ChatMessage[], opts: { maxTokens?: number; extra?: Record<string, unknown> } = {}): Promise<Completion> {
  if (!target.apiKey) throw new Error(`${target.keyEnv} is not set`);
  const started = performance.now();
  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: target.model, messages, max_tokens: opts.maxTokens ?? 400, ...target.extra, ...opts.extra }),
  });
  if (!res.ok) throw new Error(`${target.id}: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const content = json.choices?.[0]?.message?.content;
  return {
    text: typeof content === "string" ? content : "",
    totalMs: performance.now() - started,
    promptTokens: json.usage?.prompt_tokens,
    cachedTokens: json.usage?.prompt_tokens_details?.cached_tokens,
  };
}
