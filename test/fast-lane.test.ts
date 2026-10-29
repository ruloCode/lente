import { test } from "node:test";
import assert from "node:assert/strict";
import { completeChat, streamReply } from "../src/chat.ts";
import { chatTargets } from "../src/providers.ts";

const baseten = { ...chatTargets().find((t) => t.id === "spark-open")!, apiKey: "test-key", model: "meta-models/muse-spark-open-1026", baseUrl: "http://fake" };
const realFetch = globalThis.fetch;
const withFetch = (fake: typeof fetch) => {
  globalThis.fetch = fake;
};
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const sse = (...chunks: object[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });

test("Baseten defaults to the hackathon model and speaks chat completions", () => {
  const t = chatTargets().find((x) => x.id === "spark-open")!;
  if (!process.env.BASETEN_MODEL) assert.equal(t.model, "meta-models/muse-spark-open-1026");
  assert.equal(t.api, "chat");
  assert.equal(t.provider, "Baseten");
});

test("a 403 names the model and points at BASETEN_MODEL", async () => {
  withFetch(async () => new Response("forbidden", { status: 403 }));
  await assert.rejects(streamReply(baseten, [{ role: "user", content: "hi" }]), (e: Error) => {
    assert.match(e.message, /meta-models\/muse-spark-open-1026/);
    assert.match(e.message, /BASETEN_MODEL/);
    return true;
  });
  withFetch(async () => new Response("nope", { status: 404 }));
  await assert.rejects(completeChat(baseten, [{ role: "user", content: "hi" }]), /BASETEN_MODEL/);
});

test("a streamed answer in reasoning_content is used when content stays null, with a raised max_tokens", async () => {
  let body: { max_tokens?: number } = {};
  withFetch(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return sse({ choices: [{ delta: { content: null, reasoning_content: "Say " } }] }, { choices: [{ delta: { reasoning_content: "yes." } }] });
  });
  const r = await streamReply(baseten, [{ role: "user", content: "hi" }], { maxTokens: 120 });
  assert.equal(r.text, "Say yes.");
  assert.ok(r.ttftMs !== undefined);
  assert.ok((body.max_tokens ?? 0) >= 1024);
});

test("a non-streamed answer falls back to reasoning_content when content is null", async () => {
  withFetch(async () => Response.json({ choices: [{ message: { content: null, reasoning_content: "Because." } }] }));
  assert.equal((await completeChat(baseten, [{ role: "user", content: "hi" }])).text, "Because.");
});

test("content wins over reasoning_content", async () => {
  withFetch(async () => sse({ choices: [{ delta: { reasoning_content: "thinking" } }] }, { choices: [{ delta: { content: "answer" } }] }));
  assert.equal((await streamReply(baseten, [{ role: "user", content: "hi" }])).text, "answer");
});

test("no first token within the deadline aborts the request", async () => {
  withFetch((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
  await assert.rejects(streamReply(baseten, [{ role: "user", content: "hi" }], { firstTokenTimeoutMs: 20 }), /no first token within 20 ms/);
});
