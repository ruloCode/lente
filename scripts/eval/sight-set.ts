// The sight eval on the real bench (add-sight-mode 5.2): for each object in the set, the Mac says what to put
// in front of the clip, waits for Enter, taps the Ver screen on the phone (a look), reads the answer off the
// screen through uiautomator, scores it, and lets the owner override. Times run from the tap to the answer on
// the phone's screen, as the wearer gets it. Nothing is saved but ids, scores and times.
//
//   node scripts/eval/sight-set.ts --serial <adb serial> --page-word <a word printed on the page> [--only billete]
//
// Before: the phone on the Ver screen (TalkBack off), the clip connected and pointed where the objects go.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { scoreAnswer, type SightResult, sightSet, summarizeEval } from "../../src/sight-eval.ts";

const { values } = parseArgs({ options: { serial: { type: "string" }, "page-word": { type: "string", default: "salida" }, only: { type: "string" }, x: { type: "string", default: "540" }, y: { type: "string", default: "1100" }, quiet: { type: "boolean", default: false } } });
if (!values.serial) throw new Error("--serial is required: the phone's adb serial (adb devices)");
const adb = (...args: string[]) => execFileSync("adb", ["-s", values.serial!, ...args], { encoding: "utf8", maxBuffer: 8 << 20 });
const ANSWER_WAIT_MS = 15_000;
/** Texts that are the screen's own labels, never an answer. */
const CHROME = /^(Mirando…|Mirando\.\.\.|Narrando|Narración en pausa|Salir|Ver|Invitado: no se guarda nada|Toca para mirar.*)$/;

function screenTexts(): Set<string> {
  adb("shell", "uiautomator", "dump", "/sdcard/lente-ui.xml");
  const xml = adb("exec-out", "cat", "/sdcard/lente-ui.xml");
  const texts = new Set<string>();
  for (const m of xml.matchAll(/\b(?:text|content-desc)="([^"]{12,})"/g)) {
    const t = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#10;/g, " ").trim();
    if (!CHROME.test(t)) texts.add(t);
  }
  return texts;
}

const say = (text: string) => { if (!values.quiet) try { execFileSync("say", ["-v", "Paulina", text]); } catch { /* no voice */ } };
const rl = createInterface({ input: process.stdin, output: process.stdout });
const items = sightSet(values["page-word"]!).filter((i) => !values.only || i.kind === values.only || i.id === values.only);
const results: SightResult[] = [];

for (const [n, item] of items.entries()) {
  console.log(`\n[${n + 1}/${items.length}] Pon ${item.show}.`);
  say(`Pon ${item.show}`);
  await rl.question("Enter cuando esté listo… ");
  const before = screenTexts();
  const tapped = Date.now();
  adb("shell", "input", "tap", values.x!, values.y!);
  let answer: string | undefined;
  let ms: number | undefined;
  while (Date.now() - tapped < ANSWER_WAIT_MS && !answer) {
    const fresh = [...screenTexts()].filter((t) => !before.has(t));
    if (fresh.length) {
      ms = Date.now() - tapped;
      answer = fresh.sort((a, b) => b.length - a.length)[0];
    }
  }
  const auto = answer ? scoreAnswer(item, answer) : false;
  console.log(answer ? `  Lente (${((ms ?? 0) / 1000).toFixed(1)} s): ${answer}` : "  Sin respuesta en 15 s.");
  const override = (await rl.question(`  Automático: ${auto ? "BIEN" : "MAL"}. Enter para aceptar, o b (bien) / m (mal): `)).trim().toLowerCase();
  const right = override === "b" ? true : override === "m" ? false : auto;
  results.push({ id: item.id, kind: item.kind, right, ...(ms !== undefined ? { ms } : {}), ...(right !== auto ? { overridden: true } : {}) });
}
rl.close();

const rows = summarizeEval(results);
console.log("\n| Clase | Bien | p50 toque → respuesta |\n|---|---|---|");
for (const r of rows) console.log(`| ${r.kind} | ${r.right} de ${r.of} | ${r.p50 === undefined ? "—" : `${(r.p50 / 1000).toFixed(2)} s`} |`);
const dir = `results/sight-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(dir, { recursive: true });
const file = `${dir}/eval-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ results, rows }, null, 2));
console.log(`\nResultados (ids, puntajes y tiempos): ${file}`);
