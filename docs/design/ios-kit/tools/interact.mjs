// End-to-end test of the Lente demo: every screen, every main interaction, state across pages, links, console errors.
// usage (needs playwright-core next to it): node interact.mjs <kit-dir> <frames-dir> <path-to-chrome-headless-shell>
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "node:fs";

const [kit, frames, exe] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe });
const video = process.argv[5];   // optional: a folder to record the whole run as video
const ctx = await b.newContext({ viewport: { width: 380, height: 672 }, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: video, size: { width: 380, height: 672 } } } : {}) });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let n = 0, pass = 0, fail = 0;
const shot = async (label) => { if (frames) await page.screenshot({ path: `${frames}/${String(n++).padStart(2, "0")}-${label}.png` }); };
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got: ${JSON.stringify(got)})`}`); };
const open = async (p, q = "") => { await page.goto(`file://${kit}/${p}${q}`); await page.waitForTimeout(450); };
const text = (sel) => page.textContent(sel);
const count = (sel) => page.$$eval(sel, (els) => els.filter((e) => !e.hidden && e.offsetParent !== null).length);

// ── Links: every href in every page resolves to a file in the kit ──
const htmls = readdirSync(kit).filter((f) => f.endsWith(".html"));
const broken = [];
for (const f of htmls) {
  await open(f, f === "agente.html" ? "?id=deploy" : "");
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) { if (h === "#" || h.startsWith("http")) { if (h === "#") broken.push(`${f}: #`); continue; } const file = h.split(/[?#]/)[0]; if (!existsSync(`${kit}/${file}`)) broken.push(`${f}: ${h}`); }
}
check(`every link on ${htmls.length} screens leads to a real screen`, broken.length === 0, broken);

await page.evaluate(() => localStorage.clear());

// ── Welcome (6 steps) → Ahora at rest ──
await open("bienvenida.html"); await shot("welcome");
await page.click("[data-next]"); await page.waitForTimeout(300);
check("next is blocked until the clip pairs", await page.$eval("[data-next]", (b) => b.disabled), "enabled");
await page.waitForTimeout(1900); await shot("welcome-pair");
check("clip pairs on its own", (await text("[data-pairtext]")).includes("conectado"), await text("[data-pairtext]"));
await page.click("[data-next]"); await page.fill(".l-namefield input", "Raulito"); await page.press(".l-namefield input", "Enter"); await page.waitForTimeout(200);
check("a nickname can be added", (await text("[data-names]")).includes("Raulito"), await text("[data-names]"));
await page.click("[data-next]"); await page.waitForTimeout(450); await page.click("[data-orb]"); await page.waitForTimeout(2100);
check("voice step recognises the wearer", await page.$eval(".l-ok", (e) => e.classList.contains("on")), "not shown");
await page.click("[data-next]"); await page.waitForTimeout(300); await shot("welcome-consent");
await page.click("[data-prev]"); await page.waitForTimeout(300);
check("Atrás goes back a step", await page.$eval('.l-slide[aria-label="Tu voz"]', (s) => s.classList.contains("on")), "not on voice");
await page.click("[data-next]"); await page.click("[data-next]"); await page.waitForTimeout(500); await shot("welcome-done");
check("last step greets by name", (await text("[data-ready]")).includes("Rulo"), await text("[data-ready]"));
await page.click("[data-next]"); await page.waitForURL(/asistir/); await page.waitForTimeout(500); await shot("ahora-idle");
check("Ahora starts at rest, not listening", await page.$eval('[data-when="idle"]', (e) => !e.hidden), "active");
check("pending list shows actions", await page.$eval('[data-when="idle"] [data-if="acciones"]', (e) => !e.hidden), "hidden");
await page.click(".l-fab[data-menu-open]"); await page.waitForTimeout(500);
check("menu says Lente is paused and offers Empezar", (await text(".l-live .l-pillbtn")) === "Empezar", await text(".l-live .l-pillbtn"));
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
await page.click('.l-start [data-mode="grabar"]'); await page.waitForTimeout(200);
check("mode switch changes the start button", (await text("[data-go-label]")) === "Empezar a grabar", await text("[data-go-label]"));
await page.click("[data-start]"); await page.waitForTimeout(400);
check("Solo grabar shows no suggestions", await page.$eval("[data-dilo]", (c) => c.hidden), "card shown");
await page.click("[data-end]"); await page.click("[data-end]"); await page.waitForTimeout(300);
check("Terminar needs two taps and returns to rest", await page.$eval('[data-when="idle"]', (e) => !e.hidden), "still active");
await page.click('.l-start [data-mode="asistir"]'); await page.click("[data-start]"); await page.waitForTimeout(3600); await shot("ahora");
check("the first Dilo arrives after starting", await page.$eval("[data-ready]", (e) => !e.hidden), "still waiting");

// ── Ahora while listening: Dilo card, pill, counts ──
const t0 = await text(".l-listen .txt"); await page.waitForTimeout(1600);
check("listening timer advances", t0 !== await text(".l-listen .txt"), t0);
await page.click("[data-again]"); await page.waitForTimeout(700);
check("Otra changes the line", !(await text(".l-say")).includes("El lanzamiento"), await text(".l-say"));
await page.click("[data-copy]"); await page.waitForTimeout(200);
check("Copiar copies the line", (await page.evaluate(() => navigator.clipboard.readText())).length > 10, "empty");
check("pending actions count shows 3", (await text('[data-when="active"] [data-count="acciones"]')) === "3", await text('[data-when="active"] [data-count="acciones"]'));
check("menu button shows a pending dot", await page.$eval(".l-fab .dot", (d) => !d.hidden), "hidden");

// ── Live view: transcript grows, help, stop with second tap → meeting ──
await page.click('a[href="vivo.html"]'); await page.waitForURL(/vivo/); await page.waitForTimeout(3200); await shot("vivo");
check("live transcript grows", (await count(".l-transcript .l-turn")) > 3, await count(".l-transcript .l-turn"));
await page.click('[data-help="PREGUNTA"]'); await page.waitForTimeout(300);
check("help writes a question to ask", (await text(".l-reply .k")) === "PREGUNTA", await text(".l-reply .k"));
await page.click("[data-stop1]"); check("Detener asks for a second tap", (await text("[data-stop1]")).includes("¿Detener?"), await text("[data-stop1]"));
await page.click("[data-stop1]"); await page.waitForURL(/reunion\.html\?id=qa/);
check("stopping opens the meeting notes", page.url().includes("reunion.html?id=qa"), page.url());

// ── Meeting detail: item jumps to its turn ──
await page.waitForTimeout(400); await page.click(".l-item[data-turn]"); await page.waitForTimeout(700); await shot("reunion-turn");
check("a decision opens the transcript at its moment", await page.$eval(".l-turn.is-hit", (e) => !!e), "no highlight");

// ── Side menu → Acciones: approve and reject update counts everywhere ──
await open("acciones.html");
await page.click('.l-act[data-id="task-ventas"] [data-ok]'); await page.waitForTimeout(500);
await page.click('.l-act[data-id="rem-jue"] [data-no]'); await page.waitForTimeout(500); await shot("acciones");
check("approved and rejected actions leave the queue", (await count(".l-act")) === 1, await count(".l-act"));
await page.click(".l-check[data-task='t2']"); await page.waitForTimeout(200);
check("tasks tick", (await page.getAttribute(".l-check[data-task='t2']", "aria-checked")) === "true", "unchecked");
await page.click('a[href^="correo.html"]'); await page.waitForURL(/correo/);
await page.click(".l-editor"); await page.keyboard.type(" Gracias.");
await page.click("[data-ok]"); await page.waitForURL(/acciones/); await page.waitForTimeout(400);
check("approving the mail empties the queue", (await count(".l-act")) === 0, await count(".l-act"));
await page.click(".l-fab[data-menu-open]"); await page.waitForTimeout(600); await shot("menu");
check("menu count for Acciones is gone", await page.$eval('[data-count="acciones"]', (e) => e.hidden), "still shown");
await page.keyboard.press("Escape"); await page.waitForTimeout(300);

// ── Memoria: keep and drop facts; 3D map draws ──
await page.click('.l-tab[href="memoria.html"]'); await page.waitForURL(/memoria/); await page.waitForTimeout(400);
await page.click('.l-fact[data-id="f1"] [data-keep]'); await page.waitForTimeout(500);
await page.click('.l-fact[data-id="f2"] [data-drop]'); await page.waitForTimeout(500);
check("reviewed facts leave 'Por revisar'", (await count(".l-fact")) === 0, await count(".l-fact"));
check("kept fact joins 'Personas'", (await page.textContent('[data-view="list"]')).includes("Ana lleva el presupuesto"), "missing");
await page.click('.l-segc button:has-text("Mapa 3D")'); await page.waitForTimeout(1600); await shot("mapa");
const lit = await page.$eval(".l-map canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0) k++; return k; });
check("3D memory map draws its points", lit > 200, lit);
check("Memoria badge cleared", await page.$eval('.l-tab .l-badge', (e) => e.hidden), "shown");

// ── Preguntar: answer with citations that open the exact turn ──
await page.click('.l-tab[href="preguntar.html"]'); await page.waitForURL(/preguntar/); await page.waitForTimeout(300);
await page.fill(".l-composer input", "¿Qué le prometí a Ana?"); await page.press(".l-composer input", "Enter"); await page.waitForTimeout(1600); await shot("preguntar");
check("answer cites meetings", (await count(".l-cite")) === 2, await count(".l-cite"));
await page.fill(".l-composer input", "¿Cuál es la capital de Francia?"); await page.press(".l-composer input", "Enter"); await page.waitForTimeout(1400);
check("unknown question says it is not in memory", (await page.textContent(".l-chat")).includes("No lo encuentro"), "answered anyway");
await page.click(".l-cite"); await page.waitForURL(/reunion\.html\?id=qa&t=5/); await page.waitForTimeout(800);
check("citation opens the cited turn", await page.$eval("#t5", (e) => e.classList.contains("is-hit")), "not highlighted");

// ── Tu equipo: crew, offline Mac, permission, assign; agent page with suggested questions ──
await open("agentes.html"); await shot("equipo");
check("title is Tu equipo with how many work", (await text(".l-h1")) === "Tu equipo" && /\d+ trabajando/.test(await text(".l-lede")), await text(".l-lede"));
check("the lead comes first in the crew", (await page.$eval(".l-crewmate", (a) => a.textContent)).includes("Líder"), await page.$eval(".l-crewmate", (a) => a.textContent));
check("every character says its status in words", (await page.$$eval(".l-crewmate .l-word", (w) => w.every((x) => x.textContent.trim().length > 2))), "missing");
check("Constructor shows as working", (await page.textContent('[data-list] a[href="agente.html?id=constructor"]')).includes("Trabajando"), await page.textContent('[data-list] a[href="agente.html?id=constructor"]'));
check("Claude Code shows as offline", (await page.textContent('[data-list] a[href="agente.html?id=code"]')).includes("Sin conexión"), "online");
await page.fill("[data-team] input", "Resume la reunión con el cliente Norte"); await page.press("[data-team] input", "Enter"); await page.waitForTimeout(300);
check("an assignment goes to the right agent", (await text("[data-list] .is-new")).includes("Investigador"), await text("[data-list] .is-new"));
await page.click("[data-banner]"); await page.waitForTimeout(600); await shot("permiso");
await page.click("[data-allow]"); await page.waitForTimeout(500);
check("permission granted hides the banner", (await page.$("[data-banner]")) === null, "visible");
await page.click('[data-list] a[href="agente.html?id=code"]'); await page.waitForURL(/agente/); await page.waitForTimeout(400); await shot("agente-offline");
check("agent page says where it answers from", (await text(".l-from")).includes("tu Mac"), await text(".l-from"));
await page.fill(".l-composer input", "Cambia el test"); await page.press(".l-composer input", "Enter"); await page.waitForTimeout(300);
check("a message to an offline agent waits in line", (await page.textContent(".l-log")).includes("En cola"), "sent");
await open("agentes.html"); await page.click("[data-retry]"); await page.waitForTimeout(1200);
check("Reintentar brings the Mac back", (await page.$(".l-offline")) === null && (await page.textContent('[data-list] a[href="agente.html?id=code"]')).includes("Te pregunta"), "still offline");
await open("agente.html", "?id=constructor"); await page.click('.l-suggest button:has-text("¿En qué vas?")'); await page.waitForTimeout(1400); await shot("agente");
check("a suggested question gets the agent's own answer", (await page.textContent(".l-log")).includes("212 pruebas"), "no answer");
await page.fill(".l-composer input", "Sigue con el detalle"); await page.press(".l-composer input", "Enter"); await page.waitForTimeout(1300);
check("agent replies to a message", (await page.textContent(".l-log")).includes("Entendido"), "no reply");

// ── Dispositivos, Ajustes, Accesibilidad ──
await open("dispositivos.html"); await page.click('[data-key="cam"]'); await open("dispositivos.html");
check("device switch is remembered", (await page.getAttribute('[data-key="cam"]', "aria-checked")) === "false", "reset");
await open("accesibilidad.html"); await page.click('[data-key="reduce-motion"]'); await page.waitForTimeout(200);
check("reduce motion applies at once", await page.evaluate(() => document.documentElement.classList.contains("reduce-motion")), "no class");
await page.click('[data-key="reduce-motion"]');
await open("ajustes.html"); await page.click("[data-idle]");
check("auto-pause cycles its value", (await text("[data-idle] [data-v]")) === "30 min", await text("[data-idle] [data-v]"));

// ── Theme, menu gestures, tab bar ──
await open("reuniones.html", "?theme=light");
await page.click(".l-fab[data-menu-open]"); await page.waitForTimeout(600);
check("menu opens and the screen behind is inert", await page.$eval(".l-stage", (s) => s.inert), "not inert");
await page.click('.l-seg [data-mode="dark"]'); await page.waitForTimeout(400);
check("theme switch sets dark", (await page.getAttribute("html", "data-theme")) === "dark", await page.getAttribute("html", "data-theme"));
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
check("focus returns to the menu button", await page.evaluate(() => document.activeElement.matches(".l-fab")), "elsewhere");
await page.mouse.move(6, 330); await page.mouse.down(); for (let x = 6; x <= 220; x += 8) { await page.mouse.move(x, 332); await page.waitForTimeout(12); } await page.mouse.up(); await page.waitForTimeout(600);
check("edge swipe opens the menu", (await page.getAttribute(".l-fab[data-menu-open]", "aria-expanded")) === "true", "closed");
await page.click(".l-scrim", { position: { x: 360, y: 300 } }); await page.waitForTimeout(400);
await page.click('.l-chip[data-topic="client"]'); await page.waitForTimeout(400);
check("topic chip filters meetings", (await count(".l-mcard")) === 1, await count(".l-mcard"));
await page.click('.l-chip[data-topic="all"]'); await page.fill(".l-search input", "revision"); await page.waitForTimeout(300);
check("search ignores accents", (await count(".l-mcard")) === 1, await count(".l-mcard"));

console.log(`${pass} passed, ${fail} failed · ${errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors"}`);
await ctx.close(); await b.close();
