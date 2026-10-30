// Lente iOS kit: icons, theme and interactions. No dependencies.
// Query params: ?theme=dark|light (otherwise saved choice, then the system), ?static (no timers or entrance motion, for pixel checks).

const params = new URLSearchParams(location.search);
const STATIC = params.has("static");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOAST_MS = 1600;
const TAB_NAV_DELAY_MS = 260;

// ── Icons: one sprite, every glyph drawn for this kit ─────────────────────
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="i-sig" viewBox="0 0 16 10.5"><g fill="currentColor" stroke="none"><rect x="0" y="6.6" width="2.9" height="3.9" rx=".9"/><rect x="4.35" y="4.6" width="2.9" height="5.9" rx=".9"/><rect x="8.7" y="2.4" width="2.9" height="8.1" rx=".9"/><rect x="13.05" y="0" width="2.9" height="10.5" rx=".9"/></g></symbol>
<symbol id="i-wifi" viewBox="0 0 14.6 10.6"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.1 3.9a9 9 0 0 1 12.4 0"/><path d="M3.5 6.3a5.6 5.6 0 0 1 7.6 0"/></g><path d="M7.3 10.4 5.4 8.4a2.7 2.7 0 0 1 3.8 0Z" fill="currentColor"/></symbol>
<symbol id="i-bat" viewBox="0 0 23.5 11.2"><rect x=".6" y=".6" width="20.3" height="10" rx="3" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1"/><rect x="2.2" y="2.2" width="17.1" height="6.8" rx="1.7" fill="currentColor"/><path d="M22.2 3.8c.7.3 1 .9 1 1.8s-.3 1.5-1 1.8Z" fill="currentColor" fill-opacity=".5"/></symbol>
<symbol id="i-copy" viewBox="0 0 16.5 20"><path d="M5.6 4.3V2.4c0-.9.7-1.6 1.6-1.6h3.9l4.6 4.6v8.1c0 .9-.7 1.6-1.6 1.6h-2"/><path d="M11.1.8v3.4c0 .7.5 1.2 1.2 1.2h3.4"/><path d="M1 7.6c0-.9.7-1.6 1.6-1.6h4.6l4.1 4.1v7.5c0 .9-.7 1.6-1.6 1.6H2.6c-.9 0-1.6-.7-1.6-1.6Z"/></symbol>
<symbol id="i-check" viewBox="0 0 16.5 20"><path d="M2.5 10.5l4 4 7.5-8.5" stroke-width="2"/></symbol>
<symbol id="i-again" viewBox="0 0 15.5 16.5"><path d="M10.6 2.6a6.6 6.6 0 1 1-6.1.3"/><path d="M8.9.9l2 1.9-2.2 1.6"/></symbol>
<symbol id="i-video" viewBox="0 0 33.25 33.25"><rect x="6.6" y="11.2" width="14.2" height="11.3" rx="2.4" fill="currentColor" stroke="none"/><path d="M21.9 15.4l4.3-2.6v8.1l-4.3-2.6Z" fill="currentColor" stroke="currentColor" stroke-width="1"/></symbol>
<symbol id="i-people" viewBox="0 0 33.25 33.25"><g fill="currentColor" stroke="none"><circle cx="13" cy="12.6" r="3.2"/><circle cx="20.6" cy="12.6" r="3.2"/><path d="M6.6 23.4c0-3.4 2.9-5.5 6.4-5.5s6.4 2.1 6.4 5.5Z"/><path d="M15.8 23.4c.4-3.1 2.1-5.5 4.8-5.5 3.5 0 6.2 2.1 6.2 5.5Z"/></g></symbol>
<symbol id="i-doc" viewBox="0 0 33.25 33.25"><rect x="9.3" y="8.3" width="15.6" height="16.6" rx="2.6" fill="currentColor" stroke="none"/><path d="M12.6 13h8.4M12.6 16.5h8.4M12.6 20h5.6" stroke="#9A62EE" stroke-width="1.3"/></symbol>
<symbol id="i-chev" viewBox="0 0 7.5 12.5"><path d="M1.2 1.2l5 5-5 5"/></symbol>
<symbol id="i-cal" viewBox="0 0 20 19.5"><rect x=".9" y="2.9" width="18.2" height="15.8" rx="3"/><path d="M.9 7.6h18.2M5.6.8v3.6M14.4.8v3.6"/><g fill="currentColor" stroke="none"><circle cx="10" cy="11.2" r=".9"/><circle cx="14.2" cy="11.2" r=".9"/><circle cx="5.8" cy="14.6" r=".9"/><circle cx="10" cy="14.6" r=".9"/></g></symbol>
<symbol id="i-cal-fill" viewBox="0 0 20 19.5"><path d="M3.9 2.9h12.2a3 3 0 0 1 3 3v9.8a3 3 0 0 1-3 3H3.9a3 3 0 0 1-3-3V5.9a3 3 0 0 1 3-3Z" fill="currentColor" stroke="none"/><path d="M5.6.8v3.6M14.4.8v3.6" stroke="currentColor"/><g fill="#4A8DFC" stroke="none"><circle cx="6.4" cy="10.4" r="1"/><circle cx="10" cy="10.4" r="1"/><circle cx="13.6" cy="10.4" r="1"/><circle cx="6.4" cy="14" r="1"/><circle cx="10" cy="14" r="1"/><circle cx="13.6" cy="14" r="1"/></g></symbol>
<symbol id="i-checkc" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9.1"/><path d="M6.1 10.4l2.6 2.6 5.3-5.6"/></symbol>
<symbol id="i-brain" viewBox="0 0 20.5 19"><path d="M10.25 2.4c-.6-1-1.6-1.6-2.8-1.6-1.6 0-2.9 1.1-3.2 2.6C2.7 3.7 1.6 5 1.6 6.5c0 .7.2 1.3.6 1.8-.8.6-1.3 1.6-1.3 2.6 0 1.4.9 2.6 2.1 3 0 1.9 1.5 3.4 3.4 3.4.9 0 1.7-.3 2.3-.9.4.5 1 .8 1.6.8"/><path d="M10.25 2.4c.6-1 1.6-1.6 2.8-1.6 1.6 0 2.9 1.1 3.2 2.6 1.5.3 2.6 1.6 2.6 3.1 0 .7-.2 1.3-.6 1.8.8.6 1.3 1.6 1.3 2.6 0 1.4-.9 2.6-2.1 3 0 1.9-1.5 3.4-3.4 3.4-.9 0-1.7-.3-2.3-.9-.4.5-1 .8-1.5.8"/><path d="M10.25 2.4v15.3M5.4 6.6c.9 0 1.7.7 1.7 1.6M15.1 6.6c-.9 0-1.7.7-1.7 1.6M4.6 11.2l1.6 1M15.9 11.2l-1.6 1"/></symbol>
<symbol id="i-wave" viewBox="0 0 16 16"><path d="M1.2 6.4v3.2M4.6 3.8v8.4M8 1v14M11.4 3.8v8.4M14.8 6.4v3.2"/></symbol>
<symbol id="i-ask" viewBox="0 0 19 18"><path d="M9.5 1.2c4.4 0 8 3 8 6.8s-3.6 6.8-8 6.8c-1 0-1.9-.1-2.8-.4L2.6 16.6l1.1-3.4C2.2 11.9 1.5 10 1.5 8c0-3.8 3.6-6.8 8-6.8Z"/><path d="M9.5 5.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" fill="currentColor"/><path d="M14.6 1.8l1.9-1.4" /></symbol>
<symbol id="i-search" viewBox="0 0 15 15"><circle cx="6.3" cy="6.3" r="5.2"/><path d="M10.2 10.2l3.9 3.9"/></symbol>
<symbol id="i-person" viewBox="0 0 15 17"><circle cx="7.5" cy="4.6" r="3.7" fill="currentColor" stroke="none"/><path d="M.6 15.6c0-3.6 3.1-6 6.9-6s6.9 2.4 6.9 6c0 .5-.4.8-.9.8H1.5c-.5 0-.9-.3-.9-.8Z" fill="currentColor" stroke="none"/></symbol>
<symbol id="i-logo" viewBox="400 640 1250 760"><path style="fill:var(--mark-top, rgb(48,73,238))" d="M 1006.02 697.423 C 1016.88 696.255 1035.02 696.807 1045.61 697.531 C 1106.94 701.665 1165.84 723.106 1215.48 759.366 C 1289.81 814.13 1332.61 890.048 1346.24 980.749 C 1305.79 976.233 1273.22 974.68 1232.43 973.984 C 1207.98 880.591 1140.69 818.983 1044.21 807.217 C 932.393 799.355 843.496 866.158 816.11 974.119 C 778.05 974.016 740.019 976.272 702.238 980.876 C 708.266 918.324 739.215 854.611 780.417 807.762 C 839.681 740.375 917.122 703.756 1006.02 697.423 z" transform="translate(0,0)"/><path style="fill:var(--mark-bottom, rgb(81,140,236))" d="M 702.532 1070.68 C 743.42 1074.04 775.054 1076.83 816.944 1076.89 C 820.307 1093.52 829.737 1116.24 837.88 1131.03 C 865.511 1180.67 911.54 1217.48 966.049 1233.51 C 1019.87 1249.15 1077.73 1242.46 1126.56 1214.95 C 1181.11 1184.65 1214.62 1136.31 1231.43 1077.17 C 1272.68 1076.89 1305.17 1074.54 1345.95 1070.73 C 1340.25 1103.42 1335.17 1123.33 1322.42 1154.25 C 1313.74 1176.09 1296.06 1205.06 1282.05 1223.44 C 1229.79 1292.76 1151.73 1338.02 1065.6 1348.93 C 980.019 1359.97 893.562 1336.47 825.345 1283.63 C 759.292 1232.15 712.837 1154.03 702.532 1070.68 z" transform="translate(0,0)"/><path style="fill:var(--mark-line, rgb(4,3,47))" d="M 450.486 997.23 C 467.401 996.545 488.351 997.136 505.501 997.145 L 608.816 997.146 L 946.721 997.172 L 1373.6 997.105 C 1445.38 997.102 1517.17 996.982 1588.95 997.229 C 1593.4 997.244 1600.84 997.537 1604.82 999.347 C 1613.32 1003.2 1619.7 1010.36 1621.71 1019.55 C 1623.37 1027.06 1621.91 1034.92 1617.67 1041.34 C 1612.32 1049.52 1606.01 1052.37 1596.94 1054.32 L 812.002 1054.54 L 564.039 1054.41 C 529.075 1054.37 493.998 1054.49 459.03 1054.57 C 453.115 1054.58 445.664 1053.42 440.444 1050.66 C 434.182 1047.36 429.526 1041.66 427.542 1034.87 C 425.248 1027.25 426.164 1019.02 430.077 1012.09 C 435.13 1003.17 441.121 999.948 450.486 997.23 z" transform="translate(0,0)"/></symbol>
<symbol id="i-menu" viewBox="0 0 22 22"><path d="M3.5 6.5h15M3.5 11h15M3.5 15.5h9"/></symbol>
<symbol id="i-close" viewBox="0 0 18 18"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></symbol>
<symbol id="i-glasses" viewBox="0 0 24 24"><circle cx="6.5" cy="14" r="4"/><circle cx="17.5" cy="14" r="4"/><path d="M10.5 13.6c1-.8 2-.8 3 0M2.5 14 1.6 8.6M21.5 14l.9-5.4"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/><circle cx="12" cy="12" r="6.4"/></symbol>
<symbol id="i-agents" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 7V3.6M9 12.4v1.4M15 12.4v1.4M1.8 12v3M22.2 12v3"/><circle cx="12" cy="2.8" r="1"/></symbol>
<symbol id="i-pause" viewBox="0 0 20 20"><path d="M7 4.5v11M13 4.5v11" stroke-width="2.6"/></symbol>
<symbol id="i-sun" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v1.9M10 16.3v1.9M18.2 10h-1.9M3.7 10H1.8M15.8 4.2l-1.3 1.3M5.5 14.5l-1.3 1.3M15.8 15.8l-1.3-1.3M5.5 5.5 4.2 4.2"/></symbol>
<symbol id="i-moon" viewBox="0 0 20 20"><path d="M16.8 12.4A7.2 7.2 0 0 1 7.6 3.2a7.2 7.2 0 1 0 9.2 9.2Z"/></symbol>
<symbol id="i-auto" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.6"/><path d="M10 2.4v15.2A7.6 7.6 0 0 0 10 2.4Z" fill="currentColor"/></symbol>
<symbol id="i-a11y" viewBox="0 0 24 24"><circle cx="12" cy="4.4" r="1.8" fill="currentColor"/><path d="M4.5 8.4c2.5.8 5 1.2 7.5 1.2s5-.4 7.5-1.2M12 9.6v4.6M12 14.2l-3.4 6.6M12 14.2l3.4 6.6"/></symbol>
<symbol id="i-ok" viewBox="0 0 14 14"><path d="M2.5 7.4l2.8 2.8 6.2-6.6"/></symbol>
</svg>`;
document.body.insertAdjacentHTML("afterbegin", SPRITE);

// ── Theme: light | dark | auto (follows the system) ──────────────────────
const root = document.documentElement;
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const savedTheme = () => { try { return localStorage.getItem("lente-theme"); } catch { return null; } };
const themeMode = () => params.get("theme") || savedTheme() || "auto";
const resolve = (mode) => mode === "auto" ? (systemDark.matches ? "dark" : "light") : mode;
function applyTheme(theme) { root.dataset.theme = theme; }
applyTheme(resolve(themeMode()));
systemDark.addEventListener("change", () => { if (themeMode() === "auto") applyTheme(resolve("auto")); });
function setThemeMode(mode, { announce = true } = {}) {
  try { mode === "auto" ? localStorage.removeItem("lente-theme") : localStorage.setItem("lente-theme", mode); } catch {}
  // Keep an explicit ?theme= in step, so links that carry the query keep the choice.
  const url = new URL(location.href);
  if (url.searchParams.has("theme")) { mode === "auto" ? url.searchParams.delete("theme") : url.searchParams.set("theme", mode); history.replaceState(null, "", url); params.delete("theme"); if (mode !== "auto") params.set("theme", mode); }
  const next = resolve(mode);
  if (next !== root.dataset.theme) {
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(() => applyTheme(next)); else applyTheme(next);
  }
  document.dispatchEvent(new CustomEvent("lente:theme", { detail: mode }));
  if (announce) toast(mode === "auto" ? "Tema automático" : mode === "dark" ? "Modo oscuro" : "Modo claro");
}
const toggleTheme = () => setThemeMode(root.dataset.theme === "dark" ? "light" : "dark");
document.addEventListener("keydown", (e) => { if (e.key === "d" && !e.target.closest("input")) toggleTheme(); });

// ── Fit the 380 × 672 artboard to a phone screen ──────────────────────────
const screen = document.querySelector(".l-screen");
function fit() {
  const scale = Math.abs(innerWidth - 380) < 1 ? 1 : Math.min(innerWidth / 380, innerHeight / 672);
  screen.style.setProperty("--fit", scale);
}
fit(); addEventListener("resize", fit);

// ── Helpers ───────────────────────────────────────────────────────────────
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const haptic = (ms = 10) => { if (navigator.vibrate) navigator.vibrate(ms); };
let toastTimer;
function toast(text) {
  let el = $(".l-toast");
  if (!el) { el = document.createElement("div"); el.className = "l-toast"; el.setAttribute("role", "status"); screen.append(el); }
  el.textContent = text; el.classList.add("is-on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("is-on"), TOAST_MS);
}
const fold = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// ── Entrance ──────────────────────────────────────────────────────────────
if (!STATIC) $$("[data-enter]").forEach((el, i) => { el.style.setProperty("--i", i); el.classList.add("l-enter"); });

// ── Listening state: one timer shared by the pill and the side menu ───────
const Listen = {
  seconds: 0, paused: false, subs: new Set(),
  fmt() { const s = this.seconds; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; },
  label() { return `${this.paused ? "En pausa" : "Escuchando"} · ${this.fmt()}`; },
  emit() { this.subs.forEach((f) => f(this)); },
  toggle() {
    this.paused = !this.paused; this.emit(); haptic(this.paused ? [8, 40, 8] : 12);
    toast(this.paused ? "Lente en pausa: no se envía nada" : "Escuchando de nuevo");
  },
};
{ const [m, s] = (screen.dataset.listenStart || "12:48").split(":").map(Number); Listen.seconds = m * 60 + s; }
if (!STATIC) setInterval(() => { if (!Listen.paused) { Listen.seconds++; Listen.emit(); } }, 1000);
$$(".l-listen").forEach((pill) => {
  const txt = $(".txt", pill);
  Listen.subs.add((L) => { txt.textContent = L.label(); pill.setAttribute("aria-pressed", String(L.paused));
    pill.setAttribute("aria-label", L.paused ? "En pausa. Toca para seguir escuchando" : "Escuchando. Toca para pausar"); });
  pill.addEventListener("click", () => Listen.toggle());
});

// ── Dilo card: Otra cycles the line, Copiar copies it ─────────────────────
const SAY = [
  { say: "El lanzamiento queda<br>para el 14, con QA el lunes.", asked: "Te preguntó Ana: ¿cuándo salimos?" },
  { say: "Si QA aprueba el lunes,<br>salimos el jueves 14.", asked: "Te preguntó Ana: ¿cuándo salimos?" },
  { say: "Lo confirmo con QA hoy<br>y te escribo antes de las 5.", asked: "Te preguntó Ana: ¿cuándo salimos?" },
];
function splitWords(el) {
  let k = 0;
  el.innerHTML = el.innerHTML.split(/(<br>)/).map((part) => part === "<br>" ? part
    : part.split(" ").filter(Boolean).map((w) => `<span class="w" style="--k:${k++}">${w}</span>`).join(" ")).join("");
}
$$("[data-dilo]").forEach((card) => {
  const say = $(".l-say", card), asked = $(".l-asked", card);
  const copy = $("[data-copy]", card), again = $("[data-again]", card);
  let idx = 0;
  again.addEventListener("click", () => {
    idx = (idx + 1) % SAY.length; haptic();
    again.classList.remove("is-spin"); void again.offsetWidth; again.classList.add("is-spin");
    if (reduceMotion) { say.innerHTML = SAY[idx].say; asked.textContent = SAY[idx].asked; return; }
    say.classList.add("is-out");
    setTimeout(() => {
      say.classList.remove("is-out"); say.innerHTML = SAY[idx].say; asked.textContent = SAY[idx].asked;
      splitWords(say); say.classList.add("is-in");
      card.classList.remove("is-new"); void card.offsetWidth; card.classList.add("is-new");
      setTimeout(() => say.classList.remove("is-in"), 900);
    }, 180);
  });
  copy.addEventListener("click", async () => {
    const text = say.textContent.replace(/\s+/g, " ").trim();
    try { await navigator.clipboard.writeText(text); } catch {}
    haptic(14);
    const use = $("use", copy), label = $("span", copy);
    use.setAttribute("href", "#i-check"); label.textContent = "Copiado";
    toast("Copiado: dilo cuando quieras");
    setTimeout(() => { use.setAttribute("href", "#i-copy"); label.textContent = "Copiar"; }, TOAST_MS);
  });
});

// ── Brand and avatar toggle the theme ─────────────────────────────────────
$$("[data-theme-toggle]").forEach((el) => el.addEventListener("click", toggleTheme));

// ── Meeting list: search and topic chips, with FLIP motion ────────────────
const list = $("[data-meetings]");
if (list) {
  const cards = $$(".l-mcard", list), chips = $$(".l-chip"), input = $(".l-search input");
  let topic = "all";
  const filter = () => {
    const q = fold(input.value.trim());
    const before = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
    cards.forEach((c) => c.classList.toggle("is-hidden", !((topic === "all" || c.dataset.topic === topic) && (!q || fold(c.textContent).includes(q)))));
    $$(".l-section", list).forEach((h) => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains("l-section")) { if (n.classList.contains("l-mcard") && !n.classList.contains("is-hidden")) any = true; n = n.nextElementSibling; }
      h.hidden = !any;
    });
    $(".l-empty", list).hidden = cards.some((c) => !c.classList.contains("is-hidden"));
    if (reduceMotion) return;
    cards.filter((c) => !c.classList.contains("is-hidden")).forEach((c) => {
      const dy = before.get(c) - c.getBoundingClientRect().top;
      c.animate(dy ? [{ transform: `translateY(${dy}px)` }, { transform: "none" }] : [{ opacity: .4, transform: "scale(.98)" }, { opacity: 1, transform: "none" }],
        { duration: 360, easing: "cubic-bezier(.32,1.25,.5,1)" });
    });
  };
  chips.forEach((chip) => chip.addEventListener("click", () => {
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    topic = chip.dataset.topic; haptic(8); filter();
  }));
  input.addEventListener("input", filter);
}
