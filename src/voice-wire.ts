// The voice agent's model on the wire (add-voice-mode): one streamed Responses API request per
// step, with Lente's function tools and Spark's own web search, stateless (`store: false`). The
// shapes are the ones verified in docs/kb/meta-api.md ("Function calling and web search").

import { httpError } from "./chat.ts";
import type { ChatTarget } from "./providers.ts";
import { SseParser } from "./sse.ts";
import type { FunctionSpec, VoiceItem, VoiceModel, VoiceSource, VoiceStep } from "./voice-agent.ts";

/** Room for a short spoken answer plus minimal reasoning and a tool call's arguments. */
export const VOICE_MAX_OUTPUT_TOKENS = 400;
/** Web results shown as sources per search; the model reads more than it cites. */
export const MAX_WEB_SOURCES = 3;

export interface VoiceRequest {
  instructions: string;
  functions: FunctionSpec[];
  /** Offer Spark's web search alongside the functions. */
  webSearch: boolean;
}

/** Items in the Responses API's input shape. */
export function toWireInput(items: VoiceItem[]): Record<string, unknown>[] {
  return items.map((i) => {
    switch (i.type) {
      case "message":
        return i.role === "user"
          ? { role: "user", content: i.text }
          : { type: "message", role: "assistant", content: [{ type: "output_text", text: i.text }], ...(i.phase ? { phase: i.phase } : {}) };
      case "function_call":
        return { type: "function_call", call_id: i.callId, name: i.name, arguments: i.arguments };
      case "function_call_output":
        return { type: "function_call_output", call_id: i.callId, output: i.output };
    }
  });
}

/**
 * The request body for one step. The instructions go as the first `developer` message, not the
 * top-level `instructions` field: measured 2026-11-02, the field is never served from the prompt
 * cache (0 of 1,703 tokens on a repeat) while the same text as a message is (1,649 of 1,717).
 */
export function voiceBody(model: string, req: VoiceRequest, input: VoiceItem[]): Record<string, unknown> {
  return {
    model,
    tools: [
      ...req.functions.map((f) => ({ type: "function", name: f.name, description: f.description, parameters: f.parameters })),
      ...(req.webSearch ? [{ type: "web_search", search_context_size: "low" }] : []),
    ],
    input: [{ role: "developer", content: req.instructions }, ...toWireInput(input)],
    stream: true,
    store: false,
    reasoning: { effort: "minimal" },
    parallel_tool_calls: false,
    max_output_tokens: VOICE_MAX_OUTPUT_TOKENS,
    ...(req.webSearch ? { include: ["web_search_call.results"] } : {}),
  };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A web search's results as source chips, at most MAX_WEB_SOURCES, one per site. */
export function webSources(results: unknown): VoiceSource[] {
  if (!Array.isArray(results)) return [];
  const out: VoiceSource[] = [];
  const seen = new Set<string>();
  for (const r of results as { url?: unknown; title?: unknown }[]) {
    if (typeof r?.url !== "string" || !/^https?:\/\//.test(r.url)) continue;
    const host = hostOf(r.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push({ kind: "web", label: typeof r.title === "string" && r.title.trim() ? `${host} · ${r.title.trim().slice(0, 60)}` : host, url: r.url });
    if (out.length >= MAX_WEB_SOURCES) break;
  }
  return out;
}

/**
 * Folds the stream of one step into its result, calling `on.text` for each text delta (with
 * whether it belongs to a commentary message) and `on.search` when a search starts. Pure: give it
 * the SSE payloads in order.
 */
export class StepReader {
  readonly step: VoiceStep = { items: [], calls: [], sources: [], searches: [] };
  private phases = new Map<number, "commentary" | undefined>();
  private on: Parameters<VoiceModel>[2];
  failed: string | undefined;

  constructor(on: Parameters<VoiceModel>[2]) {
    this.on = on;
  }

  push(payload: string): void {
    let e: { type?: string; output_index?: number; delta?: unknown; item?: Record<string, unknown>; response?: { usage?: Record<string, any>; error?: { message?: string } | null }; message?: string };
    try {
      e = JSON.parse(payload);
    } catch {
      return;
    }
    switch (e.type) {
      case "response.output_item.added":
        if (e.item?.type === "message") this.phases.set(e.output_index ?? -1, e.item.phase === "commentary" ? "commentary" : undefined);
        if (e.item?.type === "web_search_call") {
          const query = (e.item.action as { query?: unknown } | undefined)?.query;
          this.on.search(typeof query === "string" ? query : "");
        }
        break;
      case "response.output_text.delta":
        if (typeof e.delta === "string") this.on.text(e.delta, this.phases.get(e.output_index ?? -1) === "commentary");
        break;
      case "response.output_item.done":
        this.itemDone(e.item ?? {});
        break;
      case "response.completed": {
        const u = e.response?.usage;
        if (u) this.step.usage = { input: u.input_tokens ?? 0, cached: u.input_tokens_details?.cached_tokens ?? 0, output: u.output_tokens ?? 0 };
        break;
      }
      case "response.failed":
      case "response.incomplete":
        this.failed = e.response?.error?.message ?? e.type;
        break;
      case "error":
        this.failed = e.message ?? "error event";
        break;
    }
  }

  private itemDone(item: Record<string, unknown>): void {
    if (item.type === "message") {
      const content = Array.isArray(item.content) ? (item.content as { type?: string; text?: unknown }[]) : [];
      const text = content.filter((c) => c.type === "output_text" && typeof c.text === "string").map((c) => c.text as string).join("");
      if (text) this.step.items.push({ type: "message", role: "assistant", text, ...(item.phase === "commentary" ? { phase: "commentary" as const } : {}) });
    } else if (item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string") {
      const raw = typeof item.arguments === "string" ? item.arguments : "{}";
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(raw || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        // Arguments that are not JSON reach the tool as none; its validation answers the model.
      }
      this.step.items.push({ type: "function_call", callId: item.call_id, name: item.name, arguments: raw });
      this.step.calls.push({ callId: item.call_id, name: item.name, args });
    } else if (item.type === "web_search_call") {
      const query = (item.action as { query?: unknown } | undefined)?.query;
      if (typeof query === "string") this.step.searches.push(query);
      else this.step.searches.push("");
      for (const s of webSources(item.results)) if (!this.step.sources.some((x) => x.url === s.url)) this.step.sources.push(s);
    }
  }
}

/** The voice agent's model on a Meta target over the Responses API. */
export function responsesVoiceModel(target: ChatTarget, req: VoiceRequest, fetcher: typeof fetch = fetch): VoiceModel {
  return async (input, signal, on) => {
    if (!target.apiKey) throw new Error(`${target.keyEnv} is not set`);
    const res = await fetcher(`${target.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(voiceBody(target.model, req, input)),
      signal,
    });
    if (!res.ok || !res.body) throw httpError(target, res.status, (await res.text().catch(() => "")).slice(0, 300));
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = new StepReader(on);
    for await (const chunk of res.body) {
      for (const payload of parser.push(decoder.decode(chunk, { stream: true }))) reader.push(payload);
      if (reader.failed) throw new Error(`${target.id}: ${reader.failed}`);
    }
    return reader.step;
  };
}
