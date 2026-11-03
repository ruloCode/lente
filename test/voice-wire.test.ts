// add-voice-mode 1.2: the Responses adapter, on event shapes recorded from the real API on
// 2026-11-02 (docs/kb/meta-api.md), with synthetic text.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatTarget } from "../src/providers.ts";
import { VOICE_FUNCTIONS } from "../src/voice-agent.ts";
import { MAX_WEB_SOURCES, StepReader, responsesVoiceModel, toWireInput, voiceBody, webSources } from "../src/voice-wire.ts";

const toolStream = [
  { type: "response.created" },
  { type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "rs_1", summary: [] } },
  { type: "response.output_item.done", output_index: 0, item: { type: "reasoning", id: "rs_1", encrypted_content: "x" } },
  { type: "response.output_item.added", output_index: 1, item: { type: "message", id: "rs_2", phase: "commentary", role: "assistant", content: [] } },
  { type: "response.output_text.delta", output_index: 1, delta: "La agrego a tu lista." },
  { type: "response.output_item.done", output_index: 1, item: { type: "message", phase: "commentary", role: "assistant", content: [{ type: "output_text", text: "La agrego a tu lista.", annotations: [] }] } },
  { type: "response.output_item.added", output_index: 2, item: { type: "function_call", call_id: "call_1", name: "add_task", arguments: "" } },
  { type: "response.function_call_arguments.delta", output_index: 2, delta: '{"title":' },
  { type: "response.output_item.done", output_index: 2, item: { type: "function_call", call_id: "call_1", name: "add_task", arguments: '{"title":"PROBE llamar a Ana","who":"me"}', status: "completed" } },
  { type: "response.completed", response: { usage: { input_tokens: 1171, input_tokens_details: { cached_tokens: 113 }, output_tokens: 115 } } },
];

const searchStream = [
  { type: "response.output_item.added", output_index: 0, item: { type: "web_search_call", action: { type: "search", query: "PROBE capital" } } },
  { type: "response.output_item.done", output_index: 0, item: { type: "web_search_call", action: { type: "search", query: "PROBE capital", queries: ["PROBE capital"] }, results: [
    { type: "text_result", title: "PROBE City - Wiki", url: "https://en.wikipedia.org/wiki/PROBE", snippet: "" },
    { type: "text_result", title: "Otra", url: "https://en.wikipedia.org/wiki/Other", snippet: "" },
    { type: "text_result", title: "Atlas", url: "https://www.atlas.example/probe", snippet: "" },
    { type: "text_result", title: "", url: "https://third.example/x", snippet: "" },
    { type: "text_result", title: "Cuarto", url: "https://fourth.example/x", snippet: "" },
  ] } },
  { type: "response.output_item.added", output_index: 1, item: { type: "message", role: "assistant", content: [] } },
  { type: "response.output_text.delta", output_index: 1, delta: "Es PROBE City, " },
  { type: "response.output_text.delta", output_index: 1, delta: "según Wikipedia." },
  { type: "response.output_item.done", output_index: 1, item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Es PROBE City, según Wikipedia.", annotations: [] }] } },
  { type: "response.completed", response: { usage: { input_tokens: 8821, input_tokens_details: { cached_tokens: 83 }, output_tokens: 326 } } },
];

function read(events: object[]) {
  const texts: [string, boolean][] = [];
  const searches: string[] = [];
  const reader = new StepReader({ text: (d, c) => texts.push([d, c]), search: (q) => searches.push(q) });
  for (const e of events) reader.push(JSON.stringify(e));
  return { step: reader.step, texts, searches, failed: reader.failed };
}

test("a function call step: commentary deltas are marked, the call and its arguments are parsed, usage is kept", () => {
  const { step, texts } = read(toolStream);
  assert.deepEqual(texts, [["La agrego a tu lista.", true]]);
  assert.deepEqual(step.calls, [{ callId: "call_1", name: "add_task", args: { title: "PROBE llamar a Ana", who: "me" } }]);
  assert.deepEqual(step.items.map((i) => i.type === "message" ? `message:${i.phase}` : i.type), ["message:commentary", "function_call"]);
  assert.deepEqual(step.usage, { input: 1171, cached: 113, output: 115 });
});

test("a web search step: the query is reported, the results become at most three sources, one per site", () => {
  const { step, texts, searches } = read(searchStream);
  assert.deepEqual(searches, ["PROBE capital"]);
  assert.deepEqual(step.searches, ["PROBE capital"]);
  assert.equal(step.sources.length, MAX_WEB_SOURCES);
  assert.deepEqual(step.sources.map((s) => s.label), ["en.wikipedia.org · PROBE City - Wiki", "atlas.example · Atlas", "third.example"]);
  assert.ok(texts.every(([, c]) => c === false));
  assert.equal(step.calls.length, 0);
});

test("arguments that are not JSON reach the tool as none; a failed response is reported", () => {
  const bad = read([{ type: "response.output_item.done", item: { type: "function_call", call_id: "c", name: "list_tasks", arguments: "{not json" } }]);
  assert.deepEqual(bad.step.calls[0].args, {});
  assert.equal(read([{ type: "response.failed", response: { error: { message: "server_error" } } }]).failed, "server_error");
  assert.deepEqual(webSources([{ url: "javascript:alert(1)" }, { url: "nope" }]), []);
});

test("the body: developer instructions first, functions then web search, stateless, minimal effort", () => {
  const body = voiceBody("muse-spark-1.3", { instructions: "PROBE instrucciones", functions: VOICE_FUNCTIONS, webSearch: true }, [{ type: "message", role: "user", text: "hola" }]) as any;
  assert.deepEqual(body.input[0], { role: "developer", content: "PROBE instrucciones" });
  assert.equal(body.instructions, undefined);
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "minimal" });
  assert.equal(body.tools.at(-1).type, "web_search");
  assert.ok(body.tools.slice(0, -1).every((t: any) => t.type === "function" && t.name && t.parameters));
  assert.deepEqual(body.include, ["web_search_call.results"]);
  const noSearch = voiceBody("m", { instructions: "x", functions: [], webSearch: false }, []) as any;
  assert.equal(noSearch.include, undefined);
  assert.deepEqual(toWireInput([{ type: "message", role: "assistant", text: "a", phase: "commentary" }, { type: "function_call_output", callId: "c", output: "{}" }]), [
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "a" }], phase: "commentary" },
    { type: "function_call_output", call_id: "c", output: "{}" },
  ]);
});

test("the model streams over fetch, passes the abort signal, and names the HTTP failure", async () => {
  const target: ChatTarget = { id: "spark-probe", label: "", baseUrl: "http://stub/v1", model: "muse-spark-1.3", apiKey: "k", keyEnv: "MODEL_API_KEY", provider: "Meta" };
  let seenSignal: AbortSignal | undefined;
  const sse = toolStream.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const ok = (async (_url: string, init: RequestInit) => {
    seenSignal = init.signal ?? undefined;
    return new Response(sse, { status: 200 });
  }) as unknown as typeof fetch;
  const controller = new AbortController();
  const step = await responsesVoiceModel(target, { instructions: "x", functions: VOICE_FUNCTIONS, webSearch: false }, ok)([], controller.signal, { text: () => {}, search: () => {} });
  assert.equal(step.calls[0].name, "add_task");
  assert.equal(seenSignal, controller.signal);
  const fail = (async () => new Response("bad tools", { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(responsesVoiceModel(target, { instructions: "x", functions: [], webSearch: false }, fail)([], controller.signal, { text: () => {}, search: () => {} }), /spark-probe: HTTP 400/);
  await assert.rejects(responsesVoiceModel({ ...target, apiKey: undefined }, { instructions: "x", functions: [], webSearch: false }, ok)([], controller.signal, { text: () => {}, search: () => {} }), /MODEL_API_KEY is not set/);
});
