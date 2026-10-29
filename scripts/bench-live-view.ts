// Live view delays as the wearer sees them: from the hub publishing a completed turn to its row
// being final on the page, and the interval between updates of the live row while someone speaks.
// Drives a page already open on Ahora over the Chrome DevTools protocol. On the Android phone:
//   adb -s "$LENTE_PHONE_SERIAL" forward tcp:9222 localabstract:chrome_devtools_remote
// then play test speech to the clip while this runs (lente-hardware skill).
//
// Usage: node scripts/bench-live-view.ts [--cdp 9222] [--seconds 90]
//
// The hub stamps each turn with its own clock when it publishes it (`at`, kept on the row as
// data-at); the page notes its clock on the first animation frame after the row appears. The two
// clocks are aligned with the round trip of this script's evaluations, its error printed as ± ms.

import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { cdp: { type: "string", default: "9222" }, seconds: { type: "string", default: "90" } } });
const CDP_PORT = Number(values.cdp);
const RUN_MS = Number(values.seconds) * 1000;
const CLOCK_SAMPLES = 15;

interface Target {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const targets = (await (await fetch(`http://localhost:${CDP_PORT}/json`)).json()) as Target[];
const page = targets.find((t) => t.type === "page" && /:\d+\/(#.*)?$/.test(t.url));
if (!page) throw new Error(`no Lente page among the ${targets.length} DevTools targets on port ${CDP_PORT}: open the hub's address in Chrome first`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", () => reject(new Error(`could not open DevTools for ${page.url}`)), { once: true });
});
let nextId = 0;
const waiting = new Map<number, (result: any) => void>();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));
  waiting.get(msg.id)?.(msg);
  waiting.delete(msg.id);
});

async function evaluate<T>(expression: string): Promise<T> {
  const id = ++nextId;
  const msg = await new Promise<any>((resolve) => {
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
  if (msg.error || msg.result?.exceptionDetails) throw new Error(`page evaluation failed: ${JSON.stringify(msg.error ?? msg.result.exceptionDetails).slice(0, 300)}`);
  return msg.result.result.value as T;
}

// Page clock minus this machine's (the hub's) clock, from the evaluation with the shortest round trip.
let best = { rtt: Infinity, offset: 0 };
for (let i = 0; i < CLOCK_SAMPLES; i++) {
  const sent = Date.now();
  const pageNow = await evaluate<number>("Date.now()");
  const rtt = Date.now() - sent;
  if (rtt < best.rtt) best = { rtt, offset: pageNow - (sent + rtt / 2) };
}

if (!(await evaluate<boolean>(`!!document.getElementById("lv-tx")`))) throw new Error("the page has no live view: is it this checkout's hub?");
const startedAt = Date.now();
await evaluate(`(() => {
  const out = window.__lvBench = { rows: [], partials: [] };
  const known = new Set();
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement) || !n.classList.contains("lv-line") || n.id === "lv-live" || known.has(n)) continue;
      known.add(n);
      requestAnimationFrame(() => out.rows.push({ at: Number(n.dataset.at), seen: Date.now() }));
    }
  }).observe(document.getElementById("lv-tx"), { childList: true });
  const live = document.getElementById("lv-live");
  let last = 0;
  new MutationObserver(() => {
    const now = performance.now();
    if (live.hidden || !live.textContent.trim()) { last = 0; return; }
    if (last) out.partials.push(now - last);
    last = now;
  }).observe(live, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  return true;
})()`);

console.log(`Watching ${page.url} for ${RUN_MS / 1000} s (clock offset ${Math.round(best.offset)} ms ± ${Math.ceil(best.rtt / 2)} ms). Play test speech to the clip now.`);
await new Promise((resolve) => setTimeout(resolve, RUN_MS));
const result = await evaluate<{ rows: Array<{ at: number; seen: number }>; partials: number[] }>("window.__lvBench");
ws.close();

const turnMs = result.rows.filter((r) => r.at >= startedAt).map((r) => r.seen - best.offset - r.at);
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
  return s.length ? `p50 ${at(0.5)} ms · p90 ${at(0.9)} ms · max ${Math.round(s[s.length - 1])} ms (n=${s.length})` : "no samples";
};
console.log(`Turn published → row final on the page: ${stats(turnMs)}`);
console.log(`Interval between live row updates:      ${stats(result.partials)}`);
console.log(`Clock alignment error: ± ${Math.ceil(best.rtt / 2)} ms`);
