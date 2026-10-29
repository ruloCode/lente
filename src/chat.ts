import { SseParser, deltaReasoning, deltaText } from "./sse.ts";
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

/** The error for a non-2xx answer; a 403/404 usually means the key and the model name do not match. */
export function httpError(target: ChatTarget, status: number, body: string): Error {
  const hint =
    (status === 403 || status === 404) && target.modelEnv
      ? ` (model "${target.model}" refused: check that ${target.modelEnv} matches the key)`
      : "";
  return new Error(`${target.id}: HTTP ${status}${hint} ${body}`);
}

const tokenBudget = (target: ChatTarget, asked: number): number => Math.max(asked, target.minMaxTokens ?? 0);

/** Aborts the request when no token arrived in `ms`; call `got()` at the first token and `end()` when done. */
function firstTokenGuard(ms: number | undefined) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined =
    ms === undefined ? undefined : setTimeout(() => controller.abort(new Error(`no first token within ${ms} ms`)), ms);
  const end = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return { signal: controller.signal, got: end, end };
}

/** Streams one chat completion and times it. Throws with the API's own error text. */
export async function streamChat(
  target: ChatTarget,
  messages: ChatMessage[],
  maxTokens = 120,
  opts: { firstTokenTimeoutMs?: number } = {},
): Promise<StreamTiming> {
  if (!target.apiKey) throw new Error(`${target.keyEnv} is not set`);
  const started = performance.now();
  const guard = firstTokenGuard(opts.firstTokenTimeoutMs);
  try {
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
        max_tokens: tokenBudget(target, maxTokens),
        ...target.extra,
      }),
      signal: guard.signal,
    });
    if (!res.ok || !res.body) throw httpError(target, res.status, await res.text().catch(() => ""));

    const parser = new SseParser();
    const decoder = new TextDecoder();
    let text = "";
    let thinking = "";
    let ttftMs: number | undefined;
    let thinkingMs: number | undefined;
    for await (const chunk of res.body) {
      for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) {
        const delta = deltaText(payload);
        const thought = deltaReasoning(payload);
        if (delta && ttftMs === undefined) ttftMs = performance.now() - started;
        if (thought && thinkingMs === undefined) thinkingMs = performance.now() - started;
        if (delta || thought) guard.got();
        text += delta;
        thinking += thought;
      }
    }
    // Some hosts leave `content` empty and put the answer in `reasoning_content`.
    if (!text.trim() && thinking.trim()) return { text: thinking, ttftMs: thinkingMs, totalMs: performance.now() - started };
    return { text, ttftMs, totalMs: performance.now() - started };
  } finally {
    guard.end();
  }
}

export interface Completion {
  text: string;
  totalMs: number;
  /** Prompt tokens, and how many of them were served from the prompt cache. */
  promptTokens: number | undefined;
  cachedTokens: number | undefined;
  completionTokens: number | undefined;
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
    body: JSON.stringify({ model: target.model, messages, max_tokens: tokenBudget(target, opts.maxTokens ?? 400), ...target.extra, ...opts.extra }),
  });
  if (!res.ok) throw httpError(target, res.status, await res.text().catch(() => ""));
  const json = (await res.json()) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const message = json.choices?.[0]?.message;
  const content = typeof message?.content === "string" && message.content.trim() ? message.content : message?.reasoning_content;
  return {
    text: typeof content === "string" ? content : "",
    totalMs: performance.now() - started,
    promptTokens: json.usage?.prompt_tokens,
    cachedTokens: json.usage?.prompt_tokens_details?.cached_tokens,
    completionTokens: json.usage?.completion_tokens,
  };
}

type ResponsesPart = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

/** Chat messages in the Responses API's `input` shape: same roles, typed content parts. */
export function toResponsesInput(messages: ChatMessage[]): { role: ChatMessage["role"]; content: string | ResponsesPart[] }[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p): ResponsesPart => (p.type === "text" ? { type: "input_text", text: p.text } : { type: "input_image", image_url: p.image_url.url })),
  }));
}

export interface ResponseEvent {
  delta?: string;
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  error?: string;
}

/** What one streamed Responses event carries that the hub uses: a text delta, the final usage, or a failure. */
export function responseEvent(payload: string): ResponseEvent {
  let json: { type?: string; delta?: unknown; response?: { usage?: ResponseEvent["usage"]; error?: { message?: string } | null }; message?: string };
  try {
    json = JSON.parse(payload);
  } catch {
    return {};
  }
  switch (json.type) {
    case "response.output_text.delta":
      return typeof json.delta === "string" ? { delta: json.delta } : {};
    case "response.completed":
      return { usage: json.response?.usage };
    case "response.failed":
    case "response.incomplete":
      return { error: json.response?.error?.message ?? json.type };
    case "error":
      return { error: json.message ?? "error event" };
    default:
      return {};
  }
}

export interface StreamedCompletion extends Completion {
  /** Request sent → first visible text token. */
  ttftMs: number | undefined;
}

/**
 * One streamed reply over the Responses API, for the calls where the first token matters (cue,
 * Look, live view). Chat Completions streams carry no `usage` on the Meta API even with
 * `stream_options.include_usage`; the Responses stream reports it, cache hits included, at the end.
 */
export async function streamResponse(target: ChatTarget, messages: ChatMessage[], opts: { maxTokens?: number; firstTokenTimeoutMs?: number } = {}): Promise<StreamedCompletion> {
  if (!target.apiKey) throw new Error(`${target.keyEnv} is not set`);
  const { reasoning_effort, ...extra } = target.extra ?? {};
  const started = performance.now();
  const guard = firstTokenGuard(opts.firstTokenTimeoutMs);
  const res = await fetch(`${target.baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: target.model,
      input: toResponsesInput(messages),
      stream: true,
      max_output_tokens: opts.maxTokens ?? 400,
      ...(reasoning_effort ? { reasoning: { effort: reasoning_effort } } : {}),
      ...extra,
    }),
    signal: guard.signal,
  });
  if (!res.ok || !res.body) {
    guard.end();
    throw httpError(target, res.status, await res.text().catch(() => ""));
  }
  const parser = new SseParser();
  const decoder = new TextDecoder();
  let text = "";
  let ttftMs: number | undefined;
  let usage: ResponseEvent["usage"];
  try {
    for await (const chunk of res.body) {
      for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) {
        const event = responseEvent(payload);
        if (event.error) throw new Error(`${target.id}: ${event.error}`);
        if (event.delta && ttftMs === undefined) ttftMs = performance.now() - started;
        if (event.delta) {
          guard.got();
          text += event.delta;
        }
        if (event.usage) usage = event.usage;
      }
    }
  } finally {
    guard.end();
  }
  return {
    text,
    ttftMs,
    totalMs: performance.now() - started,
    promptTokens: usage?.input_tokens,
    cachedTokens: usage?.input_tokens_details?.cached_tokens,
    completionTokens: usage?.output_tokens,
  };
}

/** One streamed reply on the wire format the target speaks; the cue and the other card calls use this. */
export async function streamReply(target: ChatTarget, messages: ChatMessage[], opts: { maxTokens?: number; firstTokenTimeoutMs?: number } = {}): Promise<StreamedCompletion> {
  if (target.api !== "chat") return streamResponse(target, messages, opts);
  const timing = await streamChat(target, messages, opts.maxTokens ?? 400, { firstTokenTimeoutMs: opts.firstTokenTimeoutMs });
  return { ...timing, promptTokens: undefined, cachedTokens: undefined, completionTokens: undefined };
}
