import assert from "node:assert/strict";
import { test } from "node:test";
import { HELP_LABELS } from "../src/briefing.ts";
import { PILOT_PAGE } from "../src/pilot-page.ts";
import { TRANSCRIPT_PAGE_SCRIPT, type TranscriptEvent, emptyTranscript, reduceTranscript } from "../src/transcript-view.ts";

const T0 = Date.UTC(2026, 9, 28, 15, 0, 0);
const pageScript = () => PILOT_PAGE.slice(PILOT_PAGE.indexOf("<script>") + 8, PILOT_PAGE.lastIndexOf("</script>"));

test("live view: the page's copy of the reducer gives the same rows as the module", () => {
  const page = new Function(`${TRANSCRIPT_PAGE_SCRIPT}; return { emptyTranscript, reduceTranscript };`)();
  const events: TranscriptEvent[] = [
    { kind: "status", listening: true, session: { startedAt: T0 } },
    { kind: "partial", text: "Can we" },
    { kind: "turn", at: T0 + 2000, text: "Can we ship on Friday?", turnId: 0 },
    { kind: "history", items: [{ kind: "turn", at: T0 + 2000, text: "Can we ship on Friday?", turnId: "0" }] },
    { kind: "speaker", turnId: 0, speaker: "B" },
    { kind: "partial", text: "Sure" },
  ];
  assert.deepEqual(events.reduce(page.reduceTranscript, page.emptyTranscript()), events.reduce(reduceTranscript, emptyTranscript()));
});

test("live view: the page script parses with the reducer inside it", () => {
  assert.doesNotThrow(() => new Function(pageScript()));
  assert.match(pageScript(), /function reduceTranscript\(/);
});

test("live view: strip, row, reply slot, transcript, help and bottom bar, in the sketch's order", () => {
  const ids = ["lv-state", "lv-bars", "lv-detener", "lv-collapse", "lv-mode", "lv-clip", "lv-slot", "lv-tx", "lv-help", "lv-pause", "lv-hint", "lv-stop"];
  const at = ids.map((id) => PILOT_PAGE.indexOf(`id="${id}"`));
  assert.ok(at.every((i) => i > 0), `missing: ${ids.filter((_, i) => at[i] < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(PILOT_PAGE, /Cuando te pregunten algo, aquí aparece qué decir\./);
  assert.match(PILOT_PAGE, /Escuchando… lo que se diga aparece aquí\./);
  assert.match(PILOT_PAGE, /Puedes bloquear el teléfono: el clip sigue escuchando\./);
  assert.match(PILOT_PAGE, /Nuevo ↓/);
  assert.match(PILOT_PAGE, /Toca otra vez para terminar/);
});

test("live view: the help buttons are the hub's kinds, labelled as the cards are", () => {
  const buttons = [...PILOT_PAGE.matchAll(/data-help="(\w+)">([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(buttons, Object.entries(HELP_LABELS));
});

test("live view: stop needs a second tap and ends the session; Solo grabar hides the slot and help", () => {
  const s = pageScript();
  assert.match(s, /clearTimeout\(stopTimer\); stopTimer = 0;[\s\S]*post\("\/session\/stop"\)/);
  assert.match(s, /\$\("lv-slot"\)\.hidden = !assist;/);
  assert.match(s, /\$\("lv-help"\)\.hidden = !assist;/);
  assert.match(s, /return status\.assistMode === "record" \? "Grabando" : "Escuchando";/);
});
