// add-memory-engine 4.2: the web chat's streamed answer, pure parts. Events arrive in pieces, are read
// as named SSE events, and change the waiting message in order: text grows, chips join once per label,
// «Buscando más…» before the deep path, replace drops a made-up answer, and done wins.

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAskEvent, sseReader } from "../web/app/lib/chat.js";

test("the SSE reader returns named events once complete, across pieces", () => {
  const r = sseReader();
  assert.deepEqual(r.push('event: delta\ndata: {"text":"Ho'), []);
  assert.deepEqual(r.push('la"}\n\nevent: searching\ndata: {}\n\n: keep\n\n'), [{ event: "delta", data: { text: "Hola" } }, { event: "searching", data: {} }]);
});

test("deltas grow the text, chips join once, done wins", () => {
  const m: any = { text: "", pending: true };
  applyAskEvent(m, "delta", { text: "Ana dijo 18,000" });
  assert.equal(m.pending, false);
  assert.equal(m.streaming, true);
  applyAskEvent(m, "delta", { text: " dólares." });
  applyAskEvent(m, "source", { label: "Marketing · 10:03", kind: "meeting", meetingId: "m1", turnId: "t7" });
  applyAskEvent(m, "source", { label: "Marketing · 10:03", kind: "meeting", meetingId: "m1", turnId: "t8" });
  assert.equal(m.text, "Ana dijo 18,000 dólares.");
  assert.equal(m.sources.length, 1);
  applyAskEvent(m, "done", { ok: true, answer: "Ana dijo 18,000 dólares.", sources: [{ label: "Marketing · 10:03" }], found: true, ms: 2100 });
  assert.equal(m.streaming, false);
  assert.equal(m.ms, 2100);
});

test("searching, then the deep answer; replace drops a made-up answer and its chips", () => {
  const m: any = { text: "", pending: true };
  applyAskEvent(m, "searching", {});
  assert.equal(m.searching, true);
  assert.equal(m.pending, true);
  const made: any = { text: "", pending: true };
  applyAskEvent(made, "delta", { text: "El lanzamiento es el 3." });
  applyAskEvent(made, "source", { label: "Lo viste · 09:00" });
  applyAskEvent(made, "replace", { text: "No lo encuentro en lo que viste y escuchaste." });
  assert.deepEqual([made.text, made.sources, made.found], ["No lo encuentro en lo que viste y escuchaste.", [], false]);
  const failed: any = { text: "x", pending: true };
  applyAskEvent(failed, "done", { ok: false, message: "No pude responder ahora; prueba otra vez." });
  assert.equal(failed.error, true);
});
