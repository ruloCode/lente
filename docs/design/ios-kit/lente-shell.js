// Lente demo shell: puts the same chrome on every screen (status bar, floating menu or back button, tab bar, side menu).
// A page declares itself on <main class="l-screen">: data-page, data-tab (which tab is current), data-back (href → back button), data-chrome="none".

const shellScreen = document.querySelector(".l-screen");
const shellStage = shellScreen.querySelector(".l-stage");
const PAGE = shellScreen.dataset.page;
const CHROME = shellScreen.dataset.chrome || "full";

const TABS = [
  ["asistir.html", "i-wave", "Ahora", "ahora"],
  ["reuniones.html", "i-cal", "Reuniones", "reuniones"],
  ["preguntar.html", "i-ask", "Preguntar", "preguntar"],
  ["memoria.html", "i-brain", "Memoria", "memoria"],
];
const MENU_MAIN = [
  ["asistir.html", "i-wave", "Ahora", "ahora"], ["reuniones.html", "i-cal", "Reuniones", "reuniones"], ["preguntar.html", "i-ask", "Preguntar", "preguntar"],
  ["acciones.html", "i-checkc", "Acciones", "acciones", () => Demo.pendingActions()], ["memoria.html", "i-brain", "Memoria", "memoria", () => Demo.pendingFacts()],
];
const MENU_MORE = [
  ["agentes.html", "i-agents", "Agentes", "agentes", () => Demo.pendingAgents()], ["dispositivos.html", "i-glasses", "Dispositivos", "dispositivos"],
  ["ajustes.html", "i-gear", "Ajustes", "ajustes"], ["accesibilidad.html", "i-a11y", "Accesibilidad", "accesibilidad"],
];

const ico = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

if (!shellStage.querySelector(".l-status")) shellStage.insertAdjacentHTML("afterbegin",
  `<div class="l-status" aria-hidden="true"><span class="t">9:41</span><svg class="sig"><use href="#i-sig"/></svg><svg class="wifi"><use href="#i-wifi"/></svg><svg class="bat"><use href="#i-bat"/></svg></div>`);

if (CHROME !== "none") {
  const back = shellScreen.dataset.back;
  shellStage.insertAdjacentHTML("beforeend", back
    ? `<a class="l-fab l-glass" href="${back}" aria-label="Volver">${ico("i-back")}</a>`
    : `<button class="l-fab l-glass" data-menu-open aria-label="Abrir menú" aria-controls="menu" aria-expanded="false">${ico("i-menu")}<i class="dot" hidden></i></button>`);

  const tab = shellScreen.dataset.tab;
  shellStage.insertAdjacentHTML("beforeend", `<div class="l-dock"><nav class="l-tabs l-glass" aria-label="Secciones principales"><i class="l-pill"></i>${
    TABS.map(([href, icon, label, key]) => `<a class="l-tab" href="${href}"${key === tab ? ' aria-current="page"' : ""}>${ico(icon)}${key === "memoria" ? '<b class="l-badge" data-count="facts" hidden></b>' : ""}<span>${label}</span></a>`).join("")
  }</nav></div>`);

  const row = ([href, icon, label, key, count]) => `<a class="l-navrow" href="${href}"${key === PAGE || key === tab && !MENU_MAIN.concat(MENU_MORE).some((r) => r[3] === PAGE) ? ' aria-current="page"' : ""} data-row>${ico(icon)}<span class="lab">${label}</span>${count ? `<span class="l-count" data-count="${key}" hidden></span>` : ""}</a>`;
  shellScreen.insertAdjacentHTML("beforeend", `
  <div class="l-scrim" aria-hidden="true"></div>
  <aside class="l-drawer" id="menu" role="dialog" aria-modal="true" aria-label="Menú de Lente">
    <div class="l-dhead" data-row><svg class="mark" aria-hidden="true"><use href="#i-logo"/></svg><b>Lente</b>
      <button class="l-iconbtn" data-menu-close aria-label="Cerrar menú">${ico("i-close")}</button></div>
    <div class="l-drawer-scroll">
      <div class="l-live" data-row role="status"><span class="state"><i></i><span>Escuchando · 12:48</span></span><button class="l-pillbtn">Pausar</button></div>
      <a class="l-device" href="dispositivos.html" data-row><img src="assets/clip-glasses@720.png" alt="" width="58" height="38"><span class="tx"><b>Clip Lente</b><span>${ico("i-ok")}Conectado</span></span><span class="bat" aria-label="Batería 82 por ciento">82 %</span></a>
      <nav class="l-nav l-nav--main" aria-label="Secciones">${MENU_MAIN.map(row).join("")}</nav>
      <p class="l-dlabel" data-row>MÁS</p>
      <nav class="l-nav" aria-label="Más">${MENU_MORE.map(row).join("")}</nav>
      <p class="l-dlabel" data-row>RECIENTES</p>
      ${MEETINGS.slice(0, 3).map((m) => `<a class="l-recent" href="reunion.html?id=${m.id}" data-row><span class="lab">${m.title}</span><time>${m.day === "Hoy" ? m.range.slice(0, 5) : m.day}</time></a>`).join("")}
      <p class="l-dlabel" data-row>APARIENCIA</p>
      <div class="l-seg" role="radiogroup" aria-label="Tema" data-row><i class="thumb"></i>
        <button role="radio" data-mode="light" aria-checked="false">${ico("i-sun")}Claro</button>
        <button role="radio" data-mode="dark" aria-checked="false">${ico("i-moon")}Oscuro</button>
        <button role="radio" data-mode="auto" aria-checked="false">${ico("i-auto")}Auto</button></div>
    </div>
  </aside>`);
}

// Counts everywhere follow the remembered demo state.
function renderCounts() {
  const counts = { acciones: Demo.pendingActions(), memoria: Demo.pendingFacts(), facts: Demo.pendingFacts(), agentes: Demo.pendingAgents() };
  document.querySelectorAll("[data-count]").forEach((el) => {
    const n = counts[el.dataset.count] || 0;
    el.hidden = !n; el.textContent = n; el.setAttribute("aria-label", `${n} pendientes`);
  });
  const dot = document.querySelector(".l-fab .dot");
  if (dot) dot.hidden = !(counts.acciones + counts.memoria + counts.agentes);
}
renderCounts();
document.addEventListener("lente:demo", renderCounts);
