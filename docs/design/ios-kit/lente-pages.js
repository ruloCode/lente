// Lente demo: one renderer per screen. Runs after lente-shell.js and before lente-nav.js.
// Uses: $, $$, toast, haptic, reduceMotion, Listen (lente-kit.js); MEETINGS, ACTIONS, … , Demo (lente-data.js); ico (lente-shell.js).

const page = $("#page");
const qs = new URLSearchParams(location.search);
const go = (href, ms = 0) => setTimeout(() => { location.href = href; }, reduceMotion ? 0 : ms);
const words = (text) => text.split(" ").map((w, k) => `<span class="w" style="--k:${k}">${w}</span>`).join(" ");
const turnLink = (m, i, label) => `reunion.html?id=${m}&t=${i}`;
const rise = (root = page) => { if (!reduceMotion && !STATIC) [...root.children].forEach((el, i) => { el.style.setProperty("--i", i); el.classList.add("l-enter"); }); };
function confirmTap(btn, label, onConfirm) {        // destructive actions need a second tap
  if (btn.dataset.armed) { onConfirm(); return; }
  btn.dataset.armed = "1"; const prev = btn.innerHTML; btn.innerHTML = label; btn.classList.add("is-confirm"); haptic([6, 30, 6]);
  setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = prev; btn.classList.remove("is-confirm"); }, 2500);
}
function segmented(el, onChange) {
  const opts = $$("button", el); el.style.setProperty("--n", opts.length);
  const pick = (i) => { el.style.setProperty("--seg", i); opts.forEach((b, j) => b.setAttribute("aria-selected", String(i === j))); onChange(i); };
  opts.forEach((b, i) => b.addEventListener("click", () => { haptic(6); pick(i); }));
  return pick;
}
function sheet(html) {
  const s = document.createElement("div"); s.className = "l-sheet"; s.setAttribute("role", "dialog"); s.setAttribute("aria-modal", "true"); s.innerHTML = html;
  const scrim = document.createElement("div"); scrim.className = "l-sheet-scrim";
  shellScreen.append(s, scrim); requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add("is-open")));
  const close = () => { s.classList.remove("is-open"); setTimeout(() => { s.remove(); scrim.remove(); }, 300); };
  scrim.addEventListener("click", close); haptic(10);
  return { el: s, close };
}
function switches(root = page) {
  $$(".l-switch", root).forEach((sw) => {
    const key = sw.dataset.key; const saved = key && Demo.get("settings", key);
    if (saved !== undefined) sw.setAttribute("aria-checked", String(saved));
    sw.addEventListener("click", () => { const on = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(on)); haptic(8);
      if (key) Demo.set("settings", key, on); sw.dispatchEvent(new CustomEvent("change", { detail: on })); });
  });
}
const sw = (key, on, label) => `<button class="l-switch" role="switch" aria-checked="${on}" data-key="${key}" aria-label="${label}"></button>`;
const li = (icon, label, right = "", href = "", small = "") => `<${href ? `a href="${href}"` : "div"} class="l-li${icon ? "" : " no-ico"}">${icon ? ico(icon) : ""}<span class="lab">${label}${small ? `<small>${small}</small>` : ""}</span>${right}${href ? ico("i-chev", "ico chev") : ""}</${href ? "a" : "div"}>`;

const RENDER = {
  // ── Meeting detail ──────────────────────────────────────────────────────
  reunion() {
    const m = meetingById(qs.get("id")); const [topicLabel, topicCls] = TOPIC[m.topic];
    shellStage.insertAdjacentHTML("beforeend", `<div class="l-topright"><button class="l-fab l-glass" data-share aria-label="Compartir notas">${ico("i-share")}</button><button class="l-fab l-glass" data-del aria-label="Borrar reunión">${ico("i-trash")}</button></div>`);
    const at = (i) => `<span class="at">${m.turns[i]?.[1] || ""}</span>`;
    page.innerHTML = `<h1 class="l-h1">${m.title}</h1>
      <div class="l-chiprow"><span class="l-chip2">${ico("i-cal")}${m.day}</span><span class="l-chip2">${m.range}</span><span class="l-chip2">${m.dur}</span><span class="l-topic ${topicCls}" style="height:26px;line-height:26px;border-radius:13px;font-size:12.5px;padding:0 10px;margin:0">${topicLabel}</span></div>
      <div class="l-segc" role="tablist"><i class="thumb"></i><button role="tab">Notas</button><button role="tab">Transcripción</button></div>
      <div data-view="notes">
        <p class="l-label">RESUMEN</p><div class="l-panel l-pad" style="font-size:15px;line-height:1.45">${m.summary}</div>
        <p class="l-label">DECISIONES</p><div class="l-panel">${m.decisions.map(([t, i]) => `<button class="l-item" data-turn="${i}">${ico("i-ok")}<span>${t}</span>${at(i)}</button>`).join("")}</div>
        <p class="l-label">COMPROMISOS</p><div class="l-panel">${m.commitments.map(([who, t, due, i]) => `<button class="l-item" data-turn="${i}">${ico("i-checkc")}<span><b>${who}</b> · ${t} <span class="l-muted">· ${due}</span></span>${at(i)}</button>`).join("")}</div>
        ${m.open.length ? `<p class="l-label">PREGUNTAS ABIERTAS</p><div class="l-panel">${m.open.map(([t, i]) => `<button class="l-item" data-turn="${i}">${ico("i-ask")}<span>${t}</span>${at(i)}</button>`).join("")}</div>` : ""}
        <p class="l-label">GLOSARIO</p><div class="l-gloss">${m.glossary.map((g) => `<span class="l-chip2">${g}</span>`).join("")}</div>
      </div>
      <div data-view="turns" hidden>${m.turns.map(([s, t, x], i) => `<div class="l-turn" id="t${i}"><b>${s.toUpperCase()}<time>${t}</time></b><p>${x}</p></div>`).join("")}</div>`;
    const views = $$("[data-view]");
    const pick = segmented($(".l-segc"), (i) => views.forEach((v, j) => { v.hidden = i !== j; }));
    const showTurn = (i) => { pick(1); const el = $(`#t${i}`); $$(".l-turn").forEach((t) => t.classList.remove("is-hit"));
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); el.classList.add("is-hit"); setTimeout(() => el.classList.remove("is-hit"), 2400); };
    $$("[data-turn]").forEach((b) => b.addEventListener("click", () => showTurn(+b.dataset.turn)));
    pick(0); if (qs.has("t")) setTimeout(() => showTurn(+qs.get("t")), 350);
    $("[data-share]").addEventListener("click", async () => {
      const text = `${m.title}\n\n${m.summary}\n\nDecisiones:\n${m.decisions.map((d) => "· " + d[0]).join("\n")}`;
      try { if (navigator.share) await navigator.share({ title: m.title, text }); else { await navigator.clipboard.writeText(text); toast("Notas copiadas"); } } catch {}
    });
    $("[data-del]").addEventListener("click", (e) => { if (!e.currentTarget.dataset.armed) toast("Toca otra vez para borrar"); confirmTap(e.currentTarget, ico("i-trash"), () => { Demo.set("deleted", m.id, true); toast("Reunión borrada"); go("reuniones.html", 600); }); });
    rise();
  },

  // ── Ask ─────────────────────────────────────────────────────────────────
  preguntar() {
    page.innerHTML = `<h1 class="l-h1">Preguntar</h1><p class="l-lede">Lo que se dijo en tus reuniones, con la frase exacta como prueba.</p>
      <div class="l-suggest">${SUGGESTED.map((s) => `<button>${s}</button>`).join("")}</div><div class="l-chat" aria-live="polite"></div>`;
    shellStage.insertAdjacentHTML("beforeend", `<form class="l-composer l-glass"><input placeholder="Pregunta sobre tus reuniones…" aria-label="Pregunta">
      <button type="button" class="l-iconbtn" data-mic aria-label="Preguntar por voz">${ico("i-mic")}</button><button class="l-iconbtn send" aria-label="Enviar">${ico("i-send")}</button></form>`);
    $(".l-dock").hidden = false;
    const chat = $(".l-chat"), form = $(".l-composer"), input = $("input", form), sug = $(".l-suggest");
    const scroll = () => page.scrollTo({ top: page.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    const ask = (q) => {
      if (!q.trim()) return; sug.hidden = true; input.value = ""; haptic(8);
      chat.insertAdjacentHTML("beforeend", `<div class="l-msg me">${q}</div><div class="l-typing" aria-label="Lente está pensando"><i></i><i></i><i></i></div>`); scroll();
      const a = ANSWERS.find((x) => x.match.test(q));
      setTimeout(() => {
        $(".l-typing")?.remove();
        chat.insertAdjacentHTML("beforeend", a
          ? `<div class="l-msg ai"><span class="who">${ico("i-sparkle")}Lente · 1.4 s</span>${words(a.text)}<div class="l-cites">${a.cites.map(([m, t, l]) => `<a class="l-cite" href="${turnLink(m, t)}">${ico("i-quote")}${l}</a>`).join("")}</div></div>`
          : `<div class="l-msg ai"><span class="who">${ico("i-sparkle")}Lente</span>${words("No lo encuentro en tus reuniones.")}</div>`);
        scroll();
      }, reduceMotion ? 0 : 900);
    };
    $$("button", sug).forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    $("[data-mic]").addEventListener("click", () => { form.classList.add("is-listening"); input.placeholder = "Escuchando…"; haptic(12);
      setTimeout(() => { form.classList.remove("is-listening"); input.placeholder = "Pregunta sobre tus reuniones…"; ask("¿Qué le prometí a Ana la semana pasada?"); }, 1600); });
    rise();
  },

  // ── Actions ─────────────────────────────────────────────────────────────
  acciones() {
    const render = () => {
      const pending = ACTIONS.filter((a) => !Demo.get("actions", a.id)), decided = ACTIONS.filter((a) => Demo.get("actions", a.id));
      const ev = (a) => { const m = meetingById(a.meeting); return `<a class="ev" href="${turnLink(m.id, a.evidence[0])}">${ico("i-quote")}Basado en ${a.evidence.length} momento${a.evidence.length > 1 ? "s" : ""} · ${a.evidence.map((i) => m.turns[i][1]).join(", ")}</a>`; };
      page.innerHTML = `<h1 class="l-h1">Acciones</h1><p class="l-lede">Lo que el agente propone al cerrar cada reunión. Nada sale sin tu aprobación.</p>
        <p class="l-label">POR APROBAR <span class="l-count">${pending.length}</span></p>
        ${pending.length ? pending.map((a) => `<div class="l-panel l-act" data-id="${a.id}"><div class="hd">${ico(a.icon)}<span><b>${a.title}</b><small>${a.kind === "mail" ? `Para ${a.to}` : a.due}</small></span></div>
          ${a.kind === "mail" ? `<p class="pv">${a.body.split("\n")[2]}</p>` : ""}${ev(a)}
          <div class="l-row-btns"><button class="l-b l-b--primary" data-ok>Aprobar</button>${a.kind === "mail" ? `<a class="l-b" href="correo.html?id=${a.id}">Editar</a>` : ""}<button class="l-b l-b--danger" data-no>Rechazar</button></div></div>`).join("")
          : `<div class="l-panel l-empty-state">Nada por aprobar. Buen trabajo.</div>`}
        ${decided.length ? `<p class="l-label">DECIDIDAS</p><div class="l-panel">${decided.map((a) => li(a.icon, a.title, `<span class="val">${Demo.get("actions", a.id) === "ok" ? "Aprobada" : "Rechazada"}</span>`)).join("")}</div>` : ""}
        <p class="l-label">MIS TAREAS</p><div class="l-panel">${TASKS.map((t) => { const done = Demo.get("tasks", t.id) ?? !!t.done;
          return `<button class="l-check" role="checkbox" aria-checked="${done}" data-task="${t.id}"><span class="l-box"><svg viewBox="0 0 16 16"><path d="M3.5 8.4l3 3 6-6.6"/></svg></span><span class="t">${t.text}</span><span class="due">${t.due}</span></button>`; }).join("")}</div>`;
      $$(".l-act").forEach((card) => {
        const decide = (v, msg) => { card.classList.add("is-gone"); haptic(v === "ok" ? 14 : [6, 30, 6]); toast(msg); setTimeout(() => { Demo.set("actions", card.dataset.id, v); render(); }, reduceMotion ? 0 : 320); };
        $("[data-ok]", card).addEventListener("click", () => decide("ok", card.dataset.id === "mail-ana" ? "Correo listo para enviar desde tu correo" : "Hecho: quedó en tu lista"));
        $("[data-no]", card).addEventListener("click", () => decide("no", "Rechazada. No se hará nada."));
      });
      $$(".l-check").forEach((c) => c.addEventListener("click", () => { const on = c.getAttribute("aria-checked") !== "true"; c.setAttribute("aria-checked", String(on)); Demo.set("tasks", c.dataset.task, on); haptic(on ? 12 : 6); }));
    };
    render(); rise();
  },

  // ── Draft mail ──────────────────────────────────────────────────────────
  correo() {
    const a = ACTIONS.find((x) => x.id === (qs.get("id") || "mail-ana")); const m = meetingById(a.meeting);
    page.innerHTML = `<h1 class="l-h1">Correo de seguimiento</h1><p class="l-lede">Redactado por el agente de cierre. Puedes editarlo.</p>
      <div class="l-panel" style="margin-top:16px"><div class="l-field"><span>Para</span>${a.to}</div><div class="l-field"><span>Asunto</span>${a.subject}</div>
        <div class="l-editor" contenteditable="true" spellcheck="false" aria-label="Cuerpo del correo">${a.body}</div></div>
      <p class="l-label">POR QUÉ LO PROPONGO</p><div class="l-panel" style="padding:6px 0">${a.evidence.map((i) => `<a class="l-quote" href="${turnLink(m.id, i)}"><small>${m.turns[i][0]} · ${m.turns[i][1]}</small>“${m.turns[i][2]}”</a>`).join("")}</div>
      <details class="l-panel" style="margin-top:10px"><summary class="l-li no-ico"><span class="lab">Pasos del agente (${a.steps.length})</span>${ico("i-chev", "ico chev")}</summary>
        <ol class="l-steps">${a.steps.map((s) => `<li>${ico("i-ok")}${s}</li>`).join("")}</ol></details>
      <div class="l-row-btns" style="margin-top:16px"><button class="l-b" data-copy>${ico("i-copy")}Copiar</button><button class="l-b l-b--primary" data-ok>Aprobar</button></div>
      <p class="l-note">Lente no envía nada sin tu aprobación.</p>`;
    $("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText($(".l-editor").innerText); } catch {} toast("Copiado: pégalo en tu correo"); haptic(10); });
    $("[data-ok]").addEventListener("click", () => { Demo.set("actions", a.id, "ok"); toast("Aprobado"); haptic(14); go("acciones.html", 500); });
    rise();
  },

  // ── Memory: list + 3D map ───────────────────────────────────────────────
  memoria() {
    const saved = () => FACTS_REVIEW.filter((f) => Demo.get("facts", f.id) === "keep");
    page.innerHTML = `<h1 class="l-h1">Memoria</h1><p class="l-lede">Lo que Lente recuerda de tus reuniones. Tú decides qué se queda.</p>
      <div class="l-segc" role="tablist"><i class="thumb"></i><button role="tab">Lista</button><button role="tab">Mapa 3D</button></div>
      <div data-view="list"></div><div data-view="map" hidden><div class="l-map"><canvas aria-label="Mapa de la memoria en 3D: personas, proyectos, clientes y reuniones"></canvas><p class="hint">Arrastra para girar · toca un punto</p>
        <div class="legend"><span>● Personas</span><span>■ Proyectos</span><span>▲ Clientes</span><span>· Reuniones</span></div></div></div>`;
    const list = $('[data-view="list"]');
    const renderList = () => {
      const review = FACTS_REVIEW.filter((f) => !Demo.get("facts", f.id));
      const known = structuredClone(FACTS_KNOWN); saved().forEach((f) => (known[f.kind === "person" ? "Personas" : "Proyectos"]).unshift([f.text.split(" ")[0], f.text, f.meeting]));
      list.innerHTML = `<label class="l-search" style="margin:16px 0 0">${ico("i-search")}<input type="search" placeholder="Buscar en lo que recuerdo" aria-label="Buscar en la memoria"></label>
        <p class="l-label">POR REVISAR ${review.length ? `<span class="l-count">${review.length}</span>` : ""}</p>
        ${review.length ? review.map((f) => `<div class="l-panel l-fact" data-id="${f.id}"><p>${f.text}</p><a href="${turnLink(f.meeting, f.turn)}">De: ${meetingById(f.meeting).title} · ${meetingById(f.meeting).turns[f.turn][1]}</a>
          <div class="l-row-btns"><button class="l-b l-b--primary" data-keep>Guardar</button><button class="l-b" data-drop>Descartar</button></div></div>`).join("") : `<div class="l-panel l-empty-state">Todo revisado.</div>`}
        ${Object.entries(known).map(([g, rows]) => `<p class="l-label">${g.toUpperCase()}</p><div class="l-panel">${rows.map(([n, t, mid]) => li("", n, "", `reunion.html?id=${mid}`, t)).join("")}</div>`).join("")}
        <p class="l-label">MI GLOSARIO</p><div class="l-gloss">${GLOSSARY.map((g) => `<span class="l-chip2">${g}</span>`).join("")}</div>`;
      $$(".l-fact").forEach((c) => {
        const decide = (v) => { c.classList.add("is-gone"); haptic(10); toast(v === "keep" ? "Guardado en tu memoria" : "Descartado y borrado"); setTimeout(() => { Demo.set("facts", c.dataset.id, v); renderList(); }, reduceMotion ? 0 : 320); };
        $("[data-keep]", c).addEventListener("click", () => decide("keep")); $("[data-drop]", c).addEventListener("click", () => decide("drop"));
      });
      $("input", list).addEventListener("input", (e) => { const q = fold(e.target.value); $$(".l-li", list).forEach((r) => { r.hidden = q && !fold(r.textContent).includes(q); }); });
    };
    renderList();
    let map;
    const views = $$("[data-view]");
    segmented($(".l-segc"), (i) => { views.forEach((v, j) => { v.hidden = i !== j; }); if (i === 1) (map ||= memoryMap($(".l-map canvas"))).start(); else map?.stop(); })(qs.get("view") === "map" ? 1 : 0);
    rise();
  },

  // ── Tu equipo ───────────────────────────────────────────────────────────
  agentes() {
    const online = () => !!Demo.get("team", "mac-online");
    const st = (a) => Demo.get("agents", a.id) ? "done" : a.offline && !online() ? "offline" : a.status;
    const render = () => {
      const working = AGENTS.filter((a) => st(a) === "work").length, needs = AGENTS.filter((a) => ["ask", "perm"].includes(st(a))).length;
      const perm = AGENTS.find((a) => a.status === "perm" && !Demo.get("agents", a.id));
      page.innerHTML = `<h1 class="l-h1">Tu equipo</h1><p class="l-lede">${working} trabajando${needs ? ` · ${needs} te necesita${needs > 1 ? "n" : ""}` : ""}</p>
        <div class="l-crew" role="list" aria-label="Agentes">${AGENTS.map((a) => { const s = st(a);
          return `<a class="l-crewmate" role="listitem" href="agente.html?id=${a.id}">${avatar(a, s, 58)}<b>${a.name}</b><span class="l-word ${s}">${a.lead ? "Líder" : STATUS[s][0]}</span></a>`; }).join("")}</div>
        ${!online() ? `<div class="l-offline" role="status">${ico("i-offline")}<span class="tx"><b>Sin conexión con tu Mac</b>Claude Code retoma cuando vuelva.</span><button class="l-b" data-retry>Reintentar</button></div>` : ""}
        ${perm ? `<button class="l-banner" data-banner style="width:100%;text-align:left">${ico("i-hand")}<span class="tx"><b>${perm.name} pide permiso</b>Quiere publicar v0.9 en producción</span>${ico("i-chev", "ico chev")}</button>` : ""}
        <p class="l-label">QUÉ ESTÁ HACIENDO CADA UNO</p>
        <div class="l-panel" data-list>${AGENTS.filter((a) => !a.lead).map((a) => { const s = st(a), [lab, ic] = STATUS[s];
          return `<a class="l-li l-agentrow" href="agente.html?id=${a.id}">${avatar(a, s, 40)}<span class="lab">${a.name}<small>${s === "done" ? "Publicó v0.9" : a.task}</small><small class="when">${s === "offline" ? "Desconectado" : "Actualizado"} ${a.when} · ${a.where}</small></span><span class="l-status-chip ${s}">${ico(ic)}${lab}</span></a>`; }).join("")}</div>`;
      $("[data-retry]")?.addEventListener("click", (e) => { const b = e.currentTarget; b.textContent = "Conectando…"; b.disabled = true; haptic(8);
        setTimeout(() => { Demo.set("team", "mac-online", true); toast("Tu Mac volvió: Claude Code sigue"); haptic([10, 40, 10]); render(); }, reduceMotion ? 0 : 900); });
      $("[data-banner]")?.addEventListener("click", () => permissionSheet("deploy", render));
    };
    render();
    shellStage.insertAdjacentHTML("beforeend", `<form class="l-composer l-glass" data-team><input placeholder="Encárgale algo a tu equipo…" aria-label="Encárgale algo a tu equipo">
      <button type="button" class="l-iconbtn" data-mic aria-label="Dictar el encargo">${ico("i-mic")}</button><button class="l-iconbtn send" aria-label="Enviar">${ico("i-send")}</button></form>`);
    const form = $("[data-team]"), input = $("input", form);
    const assign = (text) => {
      if (!text.trim()) return; input.value = ""; haptic(8);
      const to = /resum|lee|busca|investig/i.test(text) ? "Investigador" : /public|despleg|deploy/i.test(text) ? "Despliegue" : "Constructor";
      toast(`Lente se lo pasó a ${to}`);
      $("[data-list]").insertAdjacentHTML("afterbegin", `<div class="l-li l-agentrow is-new">${avatar(AGENTS[0], "work", 40)}<span class="lab">Nuevo encargo<small>${text.replace(/</g, "&lt;")}</small><small class="when">Asignado a ${to} · ahora</small></span><span class="l-status-chip work">${ico("i-spin")}Asignado</span></div>`);
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); assign(input.value); });
    $("[data-mic]", form).addEventListener("click", () => { form.classList.add("is-listening"); input.placeholder = "Escuchando…"; haptic(12);
      setTimeout(() => { form.classList.remove("is-listening"); input.placeholder = "Encárgale algo a tu equipo…"; assign("Resume la retro del sprint para Lucía"); }, reduceMotion ? 0 : 1500); });
    rise();
  },

  agente() {
    const a = AGENTS.find((x) => x.id === qs.get("id")) || AGENTS[0];
    const offline = () => a.offline && !Demo.get("team", "mac-online");
    const st = () => Demo.get("agents", a.id) ? "done" : offline() ? "offline" : a.status;
    const line = ([k, t]) => k === "user" ? `<div class="l-msg me">${t}</div>` : k === "agent" ? `<div class="l-msg ai"><span class="who">${avatar(a, "idle", 18, true)}${a.name}</span>${t}</div>`
      : k === "tool" ? `<div class="tool">${ico("i-ok")}${t}</div>` : k === "diff" ? `<pre>${t.split("\n").map((l) => `<span class="${l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : ""}">${l.replace(/</g, "&lt;")}</span>`).join("\n")}</pre>`
      : !Demo.get("agents", a.id) ? `<button class="l-banner" data-perm style="text-align:left;margin:0">${ico("i-hand")}<span class="tx"><b>Pide permiso</b>${t}</span>${ico("i-chev", "ico chev")}</button>` : `<div class="tool">${ico("i-ok")}Permitido una vez</div>`;
    const render = () => { const s = st(), [lab, ic] = STATUS[s];
      page.innerHTML = `<div class="l-agenthero">${avatar(a, s, 116)}<h1 class="l-h1">${a.name}</h1><p class="l-lede">${a.role}</p>
          <p class="l-from">${ico(a.whereIcon)}Responde desde ${a.where === "Este Mac" ? "tu Mac" : a.where === "Teléfono" ? "este teléfono" : a.where === "Nube" ? "la nube" : "el VPS"} · ${a.sub}</p>
          <div class="l-chiprow" style="justify-content:center"><span class="l-status-chip ${s}">${ico(ic)}${lab}</span><span class="l-chip2">${a.when}</span><span class="l-chip2 l-amber">${a.cost}</span></div></div>
        ${s === "offline" ? `<div class="l-offline" role="status">${ico("i-offline")}<span class="tx"><b>Tu Mac no está conectada</b>Lo que le escribas le llega cuando vuelva.</span></div>` : ""}
        <p class="l-label">ESCRÍBELE A ${a.name.toUpperCase()}</p>
        <div class="l-suggest l-suggest--row">${TEAM_SUGGESTED.map((q) => `<button>${q}</button>`).join("")}</div>
        <div class="l-log" aria-live="polite">${a.log.map(line).join("")}</div>`;
      $("[data-perm]")?.addEventListener("click", () => permissionSheet(a.id, render));
      $$(".l-suggest button").forEach((b) => b.addEventListener("click", () => send(b.textContent)));
    };
    const send = (text) => {
      if (!text.trim()) return; $(".l-composer input").value = ""; haptic(8);
      const log = $(".l-log"); const queued = offline();
      log.insertAdjacentHTML("beforeend", `<div class="l-msg me">${text.replace(/</g, "&lt;")}${queued ? `<span class="queued">En cola</span>` : ""}</div>`);
      page.scrollTo({ top: page.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
      if (queued) return toast("Le llega cuando tu Mac vuelva");
      log.insertAdjacentHTML("beforeend", `<div class="l-typing"><i></i><i></i><i></i></div>`);
      const reply = /en qué vas/i.test(text) ? a.progress : /qué te falta/i.test(text) ? a.remaining : "Entendido. Lo hago ahora y te aviso si algo tiene efectos.";
      setTimeout(() => { $(".l-typing")?.remove(); log.insertAdjacentHTML("beforeend", `<div class="l-msg ai"><span class="who">${avatar(a, "idle", 18, true)}${a.name}</span>${words(reply)}</div>`);
        page.scrollTo({ top: page.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" }); }, reduceMotion ? 0 : 900);
    };
    render();
    shellStage.insertAdjacentHTML("beforeend", `<form class="l-composer l-glass"><input placeholder="Escríbele a ${a.name}…" aria-label="Escríbele a ${a.name}"><button class="l-iconbtn send" aria-label="Enviar">${ico("i-send")}</button></form>`);
    $(".l-composer").addEventListener("submit", (e) => { e.preventDefault(); send($(".l-composer input").value); });
    rise();
  },

  // ── Devices ─────────────────────────────────────────────────────────────
  dispositivos() {
    page.innerHTML = `<h1 class="l-h1">Dispositivos</h1>
      <div class="l-panel" style="margin-top:16px"><div class="l-hero-device"><img src="assets/clip-glasses@720.png" alt="El clip de Lente en unas gafas"><div><b>Clip Lente</b><span>${ico("i-ok")}Conectado</span>
        <div class="l-chiprow" style="margin-top:8px"><span class="l-chip2">82 %</span><span class="l-chip2">Wi-Fi Casa</span><span class="l-chip2">v2</span></div></div></div>
        ${li("i-mic", "Micrófono", sw("mic", true, "Micrófono"))}${li("i-eye", "Cámara", sw("cam", true, "Cámara"))}${li("i-bolt", "Vibración", sw("vib", true, "Vibración"))}</div>
      <div class="l-row-btns"><button class="l-b" data-buzz>Probar vibración</button><button class="l-b" data-led>Probar luz</button></div>
      <p class="l-label">HOY</p><div class="l-tiles"><div class="l-tile2"><b>42 min</b><span>transcritos</span></div><div class="l-tile2"><b>18.4 k</b><span>tokens</span></div><div class="l-tile2"><b>≈ US$0.31</b><span>gasto de hoy</span></div><div class="l-tile2"><b>1 h 05</b><span>grabado</span></div></div>
      <p class="l-label">HUB</p><div class="l-panel">${li("i-cloud", "Nube (Modal)", `<span class="val">En línea</span>`)}${li("i-ok", "Transcripción", `<span class="val">OK</span>`)}${li("i-ok", "Modelos", `<span class="val">OK</span>`)}${li("i-ok", "Almacenamiento", `<span class="val">OK</span>`)}</div>
      <p class="l-label">EMPAREJAR OTRO TELÉFONO</p><div class="l-panel"><div class="l-code" aria-label="Código 4 8 2 9">4829</div><p class="l-note" style="margin:0 0 14px">Escríbelo en el otro dispositivo</p></div>
      <p class="l-label">SIN CLIP</p><div class="l-panel">${li("i-phone", "Usar este teléfono como micrófono", sw("phone", false, "Usar este teléfono como micrófono"), "", "Para cuando no traes el clip")}</div>`;
    switches();
    $("[data-buzz]").addEventListener("click", () => { haptic([30, 60, 30]); toast("El clip vibró"); });
    $("[data-led]").addEventListener("click", () => { haptic(8); toast("La luz del clip parpadeó"); });
    rise();
  },

  // ── Settings ────────────────────────────────────────────────────────────
  ajustes() {
    const pauseOpts = ["10 min", "20 min", "30 min"];
    page.innerHTML = `<h1 class="l-h1">Ajustes</h1>
      <p class="l-label">TÚ</p><div class="l-panel">${li("i-person", "Cómo te llaman", `<span class="val">Rulo, Raúl</span>`, "bienvenida.html?step=1")}${li("i-mic", "Tu voz", `<span class="val">Reconocida</span>`, "bienvenida.html?step=2")}</div>
      <p class="l-label">AVISOS</p><div class="l-panel">${li("i-hand", "Solo cuando me preguntan a mí", sw("only-me", true, "Solo cuando me preguntan a mí"), "", "Ignora preguntas a otras personas")}${li("i-bolt", "Vibrar el clip", sw("buzz", true, "Vibrar el clip"))}${li("i-mic", "Leer la tarjeta en voz alta", sw("speak", false, "Leer la tarjeta en voz alta"))}</div>
      <p class="l-label">PRIVACIDAD</p><div class="l-panel">${li("i-pause", "Empezar en pausa", sw("start-paused", true, "Empezar en pausa"))}<button class="l-li" data-idle style="width:100%">${ico("i-moon")}<span class="lab">Pausa automática</span><span class="val" data-v>${Demo.get("settings", "idle") || "20 min"}</span></button>${li("i-wave", "Enviar solo cuando alguien habla", sw("gate", true, "Enviar solo cuando alguien habla"), "", "Ahorra y no transcribe el silencio")}${li("i-eye", "Permitir que un agente mire", sw("agent-look", false, "Permitir que un agente mire"))}</div>
      <p class="l-label">MODELOS Y GASTO</p><div class="l-panel">${li("i-sparkle", "Tarjeta Dilo", `<span class="val l-amber">p50 0.8 s</span>`, "", "Muse Spark Open · Baseten")}${li("i-bolt", "Gasto máximo diario", `<span class="val">US$2.00</span>`)}</div>
      <p class="l-label">CONEXIONES</p><div class="l-panel">${li("i-link", "Linear", `<span class="val">Conectado</span>`)}${li("i-cal", "Calendario", `<span class="val">Conectado</span>`)}${li("i-agents", "Agentes", "", "agentes.html")}</div>
      <p class="l-label">MÁS</p><div class="l-panel">${li("i-a11y", "Accesibilidad", "", "accesibilidad.html")}${li("i-sparkle", "Ver la introducción otra vez", "", "bienvenida.html")}<button class="l-li" data-reset style="width:100%;color:var(--live-ink)">${ico("i-again")}<span class="lab">Reiniciar el demo</span></button></div>`;
    switches();
    $("[data-idle]").addEventListener("click", (e) => { const v = $("[data-v]", e.currentTarget); const next = pauseOpts[(pauseOpts.indexOf(v.textContent) + 1) % pauseOpts.length]; v.textContent = next; Demo.set("settings", "idle", next); haptic(6); });
    $("[data-reset]").addEventListener("click", (e) => confirmTap(e.currentTarget, `${ico("i-again")}<span class="lab">Toca otra vez para reiniciar</span>`, () => { Demo.reset(); toast("Demo reiniciado"); go("asistir.html", 600); }));
    rise();
  },

  accesibilidad() {
    const scale = Demo.get("settings", "scale") || 1;
    page.innerHTML = `<h1 class="l-h1">Accesibilidad</h1>
      <div class="l-panel l-preview" style="margin-top:16px"><span class="l-tag">DILO</span><p class="say" style="--scale:${scale}">El lanzamiento queda para el 14.</p><p class="l-muted" style="margin-top:6px;font-size:13px">Vista previa del tamaño</p></div>
      <p class="l-label">TEXTO</p><div class="l-panel l-pad"><input class="l-range" type="range" min="1" max="1.5" step="0.05" value="${scale}" aria-label="Tamaño del texto"></div>
      <p class="l-label">CONTRASTE</p><div class="l-panel"><button class="l-radio" role="radio" aria-checked="false">Estándar${ico("i-ok")}</button><button class="l-radio" role="radio" aria-checked="true">Alto (AAA, 7:1)${ico("i-ok")}</button></div>
      <p class="l-label">MOVIMIENTO Y AVISOS</p><div class="l-panel">${li("", "Reducir movimiento", sw("reduce-motion", false, "Reducir movimiento"))}${li("", "Vibración fuerte", sw("strong-buzz", true, "Vibración fuerte"))}${li("", "Leer tarjetas en voz alta", sw("read", false, "Leer tarjetas en voz alta"))}${li("", "Tarjeta a pantalla completa", sw("full", false, "Tarjeta a pantalla completa"))}</div>
      <p class="l-note">Todo el texto cumple contraste 7:1 (WCAG AAA) en claro y en oscuro.</p>`;
    switches();
    $(".l-range").addEventListener("input", (e) => { $(".l-preview .say").style.setProperty("--scale", e.target.value); Demo.set("settings", "scale", +e.target.value); });
    $$(".l-radio").forEach((r) => r.addEventListener("click", () => { $$(".l-radio").forEach((x) => x.setAttribute("aria-checked", String(x === r))); haptic(6); }));
    $('[data-key="reduce-motion"]').addEventListener("change", (e) => { document.documentElement.classList.toggle("reduce-motion", e.detail); toast(e.detail ? "Movimiento reducido" : "Movimiento normal"); });
    rise();
  },

  // ── Welcome ─────────────────────────────────────────────────────────────
  bienvenida() {
    const name = () => (Demo.get("settings", "names") || ["Rulo", "Raúl"])[0] || "tú";
    const sw2 = (key, on, label, small) => li("", label, sw(key, on, label), "", small);
    page.innerHTML = `<div class="l-onb">
      <div class="l-onb-top"><button class="l-iconbtn" data-prev aria-label="Atrás">${ico("i-back")}</button><span class="l-progress" aria-hidden="true"><i></i></span><a class="l-b l-b--ghost" href="asistir.html" data-skip style="height:34px;padding:0 14px;font-size:13.5px">Omitir</a></div>
      <div class="l-onb-view"><div class="l-track">
        <section class="l-slide" aria-label="Qué es Lente"><img class="icon l-float" src="assets/app-icon-512.png" alt=""><h2>Una línea para decir, justo a tiempo</h2><p>Lente escucha tus reuniones desde un clip en tus gafas y te avisa cuando te preguntan.</p>
          <div class="l-values"><div>${ico("i-hand")}Te avisa solo cuando te preguntan a ti</div><div>${ico("i-cal")}Recuerda cada reunión, con notas</div><div>${ico("i-eye")}Siempre se nota cuando escucha</div></div></section>
        <section class="l-slide l-pair" aria-label="Conectar el clip"><img class="l-float" src="assets/clip-glasses@720.png" alt="El clip de Lente en unas gafas"><h2>Conecta el clip</h2><p>Enciéndelo y déjalo cerca del teléfono.</p>
          <span class="l-pairstate" role="status"><span class="spin"></span>${ico("i-ok")}<span data-pairtext>Buscando el clip…</span></span></section>
        <section class="l-slide" aria-label="Tu nombre"><h2>¿Cómo te llaman?</h2><p>Así sé cuándo la pregunta es para ti. Puedes añadir apodos.</p>
          <div class="l-names" data-names></div><form class="l-namefield"><input placeholder="Añade otro nombre" aria-label="Otro nombre" maxlength="20"><button class="l-b">Añadir</button></form></section>
        <section class="l-slide" aria-label="Tu voz"><button class="l-orb" data-orb aria-label="Toca y habla">${ico("i-mic")}</button><h2 data-say>Di «Lente, soy ${name()}»</h2><p>Así distingo tu voz de la de los demás. No guardo audio.</p>
          <div class="l-wave" aria-hidden="true">${"<i></i>".repeat(18)}</div><span class="l-ok" role="status">${ico("i-ok")}Te reconocí</span></section>
        <section class="l-slide" aria-label="Privacidad"><span class="l-led" aria-hidden="true"></span><h2>Siempre se nota</h2><p>Cuando escucho, la luz del clip está encendida y el teléfono lo dice. Nunca guardo audio.</p>
          <div class="l-panel l-consent">${sw2("start-paused", true, "Empezar en pausa")}${sw2("idle-on", true, "Pausarme si nadie habla", "Tras 20 min sin que hables")}${sw2("only-me", true, "Solo cuando me preguntan a mí")}</div></section>
        <section class="l-slide" aria-label="Listo"><span class="l-done-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><h2 data-ready>Todo listo</h2><p>Lente empieza en pausa. Toca «Empezar a escuchar» cuando entres a una reunión.</p></section>
      </div></div>
      <button class="l-b l-b--primary l-b--block" data-next>Empezar</button></div>`;
    const track = $(".l-track"), slides = $$(".l-slide"), next = $("[data-next]"), prev = $("[data-prev]"), bar = $(".l-progress");
    let i = Math.min(+qs.get("step") || 0, 5), paired = false;
    const LABELS = ["Empezar", "Continuar", "Continuar", "Continuar", "Continuar", "Ir a Lente"];
    const show = () => {
      track.style.setProperty("--x", i); bar.style.setProperty("--k", i + 1); slides.forEach((s, j) => { s.classList.toggle("on", j === i); s.inert = j !== i; });
      prev.hidden = i === 0; next.textContent = LABELS[i]; next.disabled = i === 1 && !paired; next.style.opacity = next.disabled ? .5 : 1;
      if (i === 1 && !paired) setTimeout(() => { paired = true; $(".l-pairstate").classList.add("ok"); $("[data-pairtext]").textContent = "Clip Lente conectado · 82 %"; haptic([10, 40, 10]); show(); }, 1600);
      if (i === 3) $("[data-say]").textContent = `Di «Lente, soy ${name()}»`;
      if (i === 5) $("[data-ready]").textContent = `Todo listo, ${name()}`;
    };
    const finish = () => { try { localStorage.setItem("lente-welcomed", "1"); } catch {} Listen.state = "idle"; Listen.emit(); go("asistir.html"); };
    const step = (d) => { const to = i + d; if (to < 0) return; if (to > 5) return finish(); if (d > 0 && i === 1 && !paired) return; i = to; haptic(6); show(); };
    next.addEventListener("click", () => step(1)); prev.addEventListener("click", () => step(-1));
    $("[data-skip]").addEventListener("click", () => { try { localStorage.setItem("lente-welcomed", "1"); } catch {} });
    document.addEventListener("keydown", (e) => { if (e.target.closest("input")) return; if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    // Swipe between steps: follows the finger, decides by distance or speed.
    const view = $(".l-onb-view"); let d = null;
    view.addEventListener("pointerdown", (e) => { if (e.target.closest("button, input, a")) return; d = { x: e.clientX, t: e.timeStamp }; track.classList.add("is-dragging"); view.setPointerCapture(e.pointerId); });
    view.addEventListener("pointermove", (e) => { if (d) track.style.setProperty("--drag", `${(e.clientX - d.x) * ((i === 0 && e.clientX > d.x) || (i === 5 && e.clientX < d.x) ? .25 : 1)}px`); });
    view.addEventListener("pointerup", (e) => { if (!d) return; const dx = e.clientX - d.x, v = dx / Math.max(1, e.timeStamp - d.t); d = null;
      track.classList.remove("is-dragging"); track.style.setProperty("--drag", "0px"); if (dx < -60 || v < -.4) step(1); else if (dx > 60 || v > .4) step(-1); });
    // Names
    const renderNames = () => { const names = Demo.get("settings", "names") || ["Rulo", "Raúl"];
      $("[data-names]").innerHTML = names.map((n, k) => `<button class="l-chip2" data-k="${k}" aria-label="Quitar ${n}">${n} <span aria-hidden="true">×</span></button>`).join("");
      $$("[data-names] button").forEach((b) => b.addEventListener("click", () => { const ns = names.filter((_, k) => k !== +b.dataset.k); if (!ns.length) return toast("Deja al menos un nombre"); Demo.set("settings", "names", ns); haptic(6); renderNames(); })); };
    $(".l-namefield").addEventListener("submit", (e) => { e.preventDefault(); const inp = $(".l-namefield input"); const v = inp.value.trim(); if (!v) return;
      Demo.set("settings", "names", [...(Demo.get("settings", "names") || ["Rulo", "Raúl"]), v]); inp.value = ""; haptic(8); renderNames(); });
    renderNames();
    // Voice: waveform follows a simulated level while listening
    $("[data-orb]").addEventListener("click", (e) => { const orb = e.currentTarget, bars = $$(".l-wave i"); orb.classList.add("is-on"); haptic(12);
      const t = setInterval(() => bars.forEach((b) => { b.style.height = `${8 + Math.random() * 34}px`; }), 90);
      setTimeout(() => { clearInterval(t); bars.forEach((b) => { b.style.height = "8px"; }); orb.classList.remove("is-on"); $(".l-ok").classList.add("on"); haptic([10, 40, 10]); }, 1800); });
    switches(); show();
  },

  // ── Live view ───────────────────────────────────────────────────────────
  vivo() {
    const script = [["ANA", "¿Tenemos todo para la demo del jueves?"], ["MARCOS", "Casi; falta probar el pago en el móvil."], ["ANA", "Rulo, ¿puedes mandar los números antes del viernes?", "Sí, te mando los números el jueves por la tarde.", "Ana te pidió los números de ventas."], ["TÚ", "Claro, los tengo casi listos."], ["MARCOS", "Y el texto de la tienda, ¿quién lo valida?"], ["ANA", "Lo vemos el lunes con QA."]];
    shellScreen.classList.add("l-live-screen");
    page.outerHTML = `<div id="page"><div class="l-livebar" role="status"><i></i><span data-clock>Escuchando · 18:32</span><span class="sp"></span><button class="l-b" data-stop1>Detener</button></div>
      <div class="l-liverow"><a href="asistir.html" aria-label="Minimizar">${ico("i-down")}</a><span class="mode">Asistir</span><span class="clip"><i></i>Clip conectado</span></div>
      <div class="l-reply" aria-live="polite"><p class="k">DILO</p><p class="q">Esperando una pregunta para ti…</p><p class="s">—</p></div>
      <div class="l-transcript" aria-live="off"></div>
      <div class="l-helps"><button class="l-b" data-help="APORTA">Aportar</button><button class="l-b" data-help="PREGUNTA">Pregunta</button><button class="l-b" data-help="DE QUÉ HABLAN">¿De qué hablan?</button></div>
      <div class="l-livebottom"><button class="round" data-pause aria-label="Pausar">${ico("i-pause")}</button><p>Puedes bloquear el teléfono: el clip sigue escuchando.</p><button class="round stop" data-stop2 aria-label="Detener">${ico("i-stop")}</button></div></div>`;
    const tr = $(".l-transcript"), reply = $(".l-reply"); let paused = false, sec = 18 * 60 + 32, idx = 0;
    const clock = () => { $("[data-clock]").textContent = `${paused ? "En pausa" : "Escuchando"} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
    const setReply = (k, q, s, m = "") => { reply.innerHTML = `<p class="k">${k}</p><p class="q">${q}</p><p class="s">${words(s)}</p>${m ? `<p class="m">${m}</p>` : ""}`; reply.classList.remove("is-new"); void reply.offsetWidth; reply.classList.add("is-new"); haptic([10, 40, 10]); };
    const feed = () => {
      if (paused || STATIC) return; const [who, text, say, why] = script[idx % script.length]; idx++;
      const row = document.createElement("div"); row.className = "l-turn partial"; row.innerHTML = `<b>${who}<time>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}</time></b><p></p>`; tr.append(row);
      const p = $("p", row); const ws = text.split(" "); let k = 0;
      const tick = setInterval(() => { p.textContent = ws.slice(0, ++k).join(" "); tr.scrollTop = tr.scrollHeight; if (k >= ws.length) { clearInterval(tick); row.classList.remove("partial"); if (say) setReply("DILO", `Te preguntó ${who === "ANA" ? "Ana" : who}`, say, `0.8 s · ${why}`); } }, 140);
    };
    tr.innerHTML = MEETINGS[0].turns.slice(0, 3).map(([s, t, x]) => `<div class="l-turn"><b>${s.toUpperCase()}<time>${t}</time></b><p>${x}</p></div>`).join("");
    if (!STATIC) { setInterval(() => { if (!paused) { sec++; clock(); } }, 1000); setInterval(feed, 2600); setTimeout(feed, 600); }
    $$("[data-help]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.help;
      setReply(k, "Medido: 1.2 s", { "APORTA": "Propón cerrar el texto de la tienda hoy para no frenar el lanzamiento.", "PREGUNTA": "¿Quién da el visto bueno final al texto de la tienda?", "DE QUÉ HABLAN": "De la demo del jueves, los números de ventas y el texto de la tienda." }[k]); }));
    $("[data-pause]").addEventListener("click", (e) => { paused = !paused; clock(); e.currentTarget.innerHTML = ico(paused ? "i-play" : "i-pause"); e.currentTarget.setAttribute("aria-label", paused ? "Seguir" : "Pausar"); haptic(paused ? [8, 40, 8] : 12); toast(paused ? "En pausa: no se envía nada" : "Escuchando de nuevo"); });
    const stop = (btn) => confirmTap(btn, btn.classList.contains("round") ? ico("i-stop") : "¿Detener?", () => { toast("Reunión guardada con sus notas"); go("reunion.html?id=qa", 600); });
    $("[data-stop1]").addEventListener("click", (e) => stop(e.currentTarget)); $("[data-stop2]").addEventListener("click", (e) => { toast("Toca otra vez para detener"); stop(e.currentTarget); });
  },

  reuniones() { $$(".l-mcard").forEach((c) => { if (Demo.get("deleted", c.dataset.id)) c.remove(); }); },
  asistir() {
    const idle = $('[data-when="idle"]'), active = $('[data-when="active"]'), card = $("[data-dilo]");
    const HINT = { asistir: "Te aviso cuando te pregunten y te doy una línea para decir.", grabar: "Grabo y transcribo sin sugerencias. Al terminar tendrás notas." };
    const today = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    $("[data-today]").textContent = `${today[0].toUpperCase()}${today.slice(1)} · Lente está en pausa`;
    let mode = Listen.mode || "asistir", shown = null, readyTimer;
    const seg = segmented($(".l-start .l-segc"), (k) => { mode = ["asistir", "grabar"][k]; const h = $("[data-hint]"); h.textContent = HINT[mode]; h.classList.remove("swap"); void h.offsetWidth; h.classList.add("swap");
      $("[data-go-label]").textContent = mode === "grabar" ? "Empezar a grabar" : "Empezar a escuchar"; });
    seg(mode === "grabar" ? 1 : 0);
    const pending = () => { let any = false; $$("[data-if]").forEach((r) => { const n = { acciones: Demo.pendingActions(), memoria: Demo.pendingFacts(), agentes: Demo.pendingAgents() }[r.dataset.if]; r.hidden = !n; any ||= !!n; });
      $("[data-allclear]").hidden = any; };
    const render = (L, fresh) => {
      const state = L.state === "idle" ? "idle" : "active"; if (state === shown) return; shown = state;
      idle.hidden = state !== "idle"; active.hidden = state === "idle";
      if (state === "active") {
        const rec = L.mode === "grabar";
        $("[data-active-title]").textContent = rec ? "Solo grabar" : "Asistir"; card.hidden = rec; $("[data-recinfo]").hidden = !rec;
        const ready = !fresh; $("[data-waiting]", card).hidden = ready; $("[data-ready]", card).hidden = !ready;
        clearTimeout(readyTimer);
        if (fresh && !rec) readyTimer = setTimeout(() => { $("[data-waiting]", card).hidden = true; $("[data-ready]", card).hidden = false; card.classList.remove("is-new"); void card.offsetWidth; card.classList.add("is-new"); haptic([10, 40, 10]); toast("Ana te preguntó algo"); }, STATIC ? 0 : 3200);
      }
      page.scrollTo({ top: 0 });
    };
    Listen.subs.add((L) => render(L, true)); render(Listen, false); pending();
    document.addEventListener("lente:demo", pending);
    $("[data-start]").addEventListener("click", () => Listen.start(mode));
    $("[data-end]").addEventListener("click", (e) => { if (!e.currentTarget.dataset.armed) toast("Toca otra vez para terminar"); confirmTap(e.currentTarget, "¿Terminar?", () => { Listen.stop(); toast("Reunión guardada con sus notas"); }); });
    $("[data-brief]").addEventListener("click", () => {
      const lines = ["La última vez, Lucía se llevó el prototipo del menú lateral.", "Quedó abierto si el modo oscuro va por defecto.", "Tú tienes pendiente preparar la demo para el cliente (jue 6)."];
      const s = sheet(`<h3>Revisión de diseño · 12:30</h3><p>Lo que conviene saber antes de entrar.</p><ul class="l-brief">${lines.map((l) => `<li>${ico("i-ok")}${l}</li>`).join("")}</ul>
        <div class="l-row-btns" style="margin-top:18px"><button class="l-b" data-speak>${ico("i-mic")}Escuchar</button><button class="l-b l-b--primary" data-done>Listo</button></div>`);
      $("[data-done]", s.el).addEventListener("click", s.close);
      $("[data-speak]", s.el).addEventListener("click", () => { if (!("speechSynthesis" in window)) return toast("Este navegador no puede leer en voz alta");
        speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(lines.join(" ")); u.lang = "es-ES"; speechSynthesis.speak(u); toast("Leyendo el briefing"); });
    });
  },
};

// ── Characters for Tu equipo: drawn for Lente. A soft body, a face, one accessory per role, a status badge. ──
const LOOKS = {
  lead: { body: "#7FA8FF", shade: "#5B86F0" }, builder: { body: "#FFC27A", shade: "#F2A04F" }, scout: { body: "#C2AEFF", shade: "#9F86F5" },
  coder: { body: "#86DDB0", shade: "#5CC08F" }, launcher: { body: "#FFA8BE", shade: "#F27E9D" }, voice: { body: "#86DCE3", shade: "#55BFC9" },
};
const FACE = "#14182B";
function accessory(look) {
  switch (look) {
    case "lead": return `<line x1="40" y1="14" x2="40" y2="6" stroke="${FACE}" stroke-width="2.4" stroke-linecap="round"/><circle cx="40" cy="5" r="4.2" fill="#fff" stroke="${FACE}" stroke-width="2"/><line x1="36.6" y1="5" x2="43.4" y2="5" stroke="#0A47C2" stroke-width="1.8" stroke-linecap="round"/>`;
    case "builder": return `<path d="M18 27c0-10 10-17 22-17s22 7 22 17Z" fill="#FFD84D" stroke="${FACE}" stroke-width="2"/><rect x="13" y="25" width="54" height="5" rx="2.5" fill="#FFD84D" stroke="${FACE}" stroke-width="2"/><path d="M40 10v8" stroke="${FACE}" stroke-width="2" stroke-linecap="round"/>`;
    case "scout": return `<g fill="none" stroke="${FACE}" stroke-width="2.4"><circle cx="31" cy="40" r="7.5"/><circle cx="49" cy="40" r="7.5"/><path d="M38.5 40h3"/></g>`;
    case "coder": return `<path d="M17 40a23 23 0 0 1 46 0" fill="none" stroke="${FACE}" stroke-width="3" stroke-linecap="round"/><rect x="12" y="37" width="8" height="13" rx="4" fill="${FACE}"/><rect x="60" y="37" width="8" height="13" rx="4" fill="${FACE}"/>`;
    case "launcher": return `<path d="M40 7c5 4 7 9 7 14H33c0-5 2-10 7-14Z" fill="#fff" stroke="${FACE}" stroke-width="2"/><circle cx="40" cy="15" r="2.3" fill="#0A47C2"/>`;
    case "voice": return `<g fill="none" stroke="${FACE}" stroke-width="2.4" stroke-linecap="round"><path d="M64 44a6 6 0 0 0 0-8M68.5 48a12 12 0 0 0 0-16"/></g>`;
  }
  return "";
}
const BADGE = { work: ["var(--btn-bg)", "var(--btn-ink)", "i-spin"], ask: ["var(--live-ink)", "var(--live-bg)", "i-hand"], perm: ["var(--live-ink)", "var(--live-bg)", "i-hand"],
  offline: ["var(--tx2)", "var(--card)", "i-offline"], idle: ["var(--tile)", "var(--tx1)", "i-pause"], done: ["var(--ok-ink)", "var(--card)", "i-ok"] };
/** A character as inline SVG, `size` px wide. `bare` drops the status badge (for small marks in chat). */
function avatar(agent, status, size = 64, bare = false) {
  const c = LOOKS[agent.look] || LOOKS.lead;
  const eyesY = agent.look === "scout" ? 40 : 41;
  const face = `<ellipse cx="31" cy="${eyesY}" rx="3.3" ry="4.2" fill="${FACE}"/><ellipse cx="49" cy="${eyesY}" rx="3.3" ry="4.2" fill="${FACE}"/>
    <circle cx="32.2" cy="${eyesY - 1.6}" r="1.1" fill="#fff"/><circle cx="50.2" cy="${eyesY - 1.6}" r="1.1" fill="#fff"/>
    <path d="M34 52c3.5 3.4 8.5 3.4 12 0" fill="none" stroke="${FACE}" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="24" cy="50" rx="4" ry="2.6" fill="#FF8FA3" opacity=".45"/><ellipse cx="56" cy="50" rx="4" ry="2.6" fill="#FF8FA3" opacity=".45"/>`;
  const [bg, fg, ic] = BADGE[status] || BADGE.idle;
  const badge = bare ? "" : `<g class="badge ${status}"><circle cx="64" cy="64" r="12" style="fill:${bg};stroke:var(--screen-bg, var(--bg))" stroke-width="3.5"/><svg x="56.5" y="56.5" width="15" height="15" viewBox="0 0 24 24" style="color:${fg};fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"><use href="#${ic}"/></svg></g>`;
  return `<svg class="l-avatar-svg${agent.lead ? " lead" : ""}" width="${size}" height="${size}" viewBox="0 0 80 80" role="img" aria-label="${agent.name}${bare ? "" : `, ${STATUS[status][0]}`}">
    <path d="M40 13c17 0 27 10 27 27 0 18-10 28-27 28S13 58 13 40c0-17 10-27 27-27Z" fill="${c.body}"/>
    <path d="M40 68c-17 0-27-10-27-28 0 3 1 6 2.5 8.5C19 60 28 64.5 40 64.5s21-4.5 24.5-16C66 46 67 43 67 40c0 18-10 28-27 28Z" fill="${c.shade}" opacity=".55"/>
    <path d="M40 13c17 0 27 10 27 27 0 18-10 28-27 28S13 58 13 40c0-17 10-27 27-27Z" fill="none" stroke="rgba(10,12,22,.12)" stroke-width="1.2"/>
    ${face}${accessory(agent.look)}${badge}</svg>`;
}

function permissionSheet(id, done) {
  const s = sheet(`<h3>Despliegue quiere publicar en producción</h3><p>Te pregunta porque tiene efectos.</p>
    <dl class="l-kv"><dt>Dónde</dt><dd>vps-1 · Fráncfort</dd><dt>Qué hace</dt><dd>Publica v0.9 y reinicia el hub (10 s sin escuchar)</dd><dt>Por qué</dt><dd>CI pasó en main · commit 185fa13</dd></dl>
    <div style="margin-top:16px"><button class="l-b l-b--primary l-b--block" data-allow>Permitir una vez</button><button class="l-b l-b--danger l-b--block" data-deny>Rechazar</button></div><p class="l-note">El clip vibró para avisarte.</p>`);
  $("[data-allow]", s.el).addEventListener("click", () => { Demo.set("agents", id, "allowed"); toast("Permitido una vez"); haptic(14); s.close(); done?.(); });
  $("[data-deny]", s.el).addEventListener("click", () => { toast("Rechazado. No se publica nada."); s.close(); });
}

// ── 3D memory map: points on clusters, perspective projection, drag to rotate, tap for details ──
function memoryMap(canvas) {
  const ctx = canvas.getContext("2d"); const dpr = Math.min(2, devicePixelRatio || 1);
  const COLORS = { Personas: "#6FE7F7", Proyectos: "#B79CFF", Clientes: "#FFD27A", Reuniones: "#FFFFFF" };
  const CENTERS = { Personas: [-0.9, -0.3, 0.2], Proyectos: [0.9, -0.4, -0.2], Clientes: [0.2, 0.9, 0.4], Reuniones: [0, 0.1, -0.6] };
  const nodes = []; const rnd = (s) => { let x = Math.sin(s) * 10000; return x - Math.floor(x); };
  const add = (group, name, meeting, size) => { const c = CENTERS[group], i = nodes.length;
    nodes.push({ group, name, meeting, size, x: c[0] + (rnd(i + 1) - .5) * .7, y: c[1] + (rnd(i + 7) - .5) * .7, z: c[2] + (rnd(i + 13) - .5) * .7, born: i * 70 }); };
  MEETINGS.forEach((m) => add("Reuniones", m.title, m.id, 3));
  Object.entries(FACTS_KNOWN).forEach(([g, rows]) => rows.forEach(([n, t, m]) => add(g, n, m, 6)));
  for (let k = 0; k < 26; k++) add(["Personas", "Proyectos", "Clientes"][k % 3], "", MEETINGS[k % 4].id, 2);
  const meetingNode = (id) => nodes.find((n) => n.group === "Reuniones" && n.meeting === id);
  let yaw = .4, pitch = -.25, vyaw = .0035, raf, t0 = performance.now(), drag = null, proj = [];
  const resize = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; };
  function frame(now) {
    const W = canvas.width, H = canvas.height, f = Math.min(W, H) * .55; ctx.clearRect(0, 0, W, H);
    if (!drag) yaw += reduceMotion ? 0 : vyaw;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    proj = nodes.map((n) => { const x1 = n.x * cy - n.z * sy, z1 = n.x * sy + n.z * cy; const y1 = n.y * cp - z1 * sp, z2 = n.y * sp + z1 * cp;
      const s = f / (z2 + 3.2); const grow = Math.min(1, Math.max(0, (now - t0 - n.born) / 420)); return { n, X: W / 2 + x1 * s * 1.6, Y: H / 2 + y1 * s * 1.6, s, z: z2, grow }; });
    ctx.lineWidth = 1 * dpr;
    proj.forEach((p) => { if (p.n.group === "Reuniones" || !p.grow) return; const m = proj.find((q) => q.n === meetingNode(p.n.meeting)); if (!m) return;
      ctx.strokeStyle = `rgba(140,200,255,${.12 * p.grow + (p.n === sel ? .5 : 0)})`; ctx.beginPath(); ctx.moveTo(p.X, p.Y); ctx.lineTo(m.X, m.Y); ctx.stroke(); });
    [...proj].sort((a, b) => b.z - a.z).forEach((p) => { if (!p.grow) return; const r = p.n.size * dpr * (p.s / 120) * p.grow * (p.n === sel ? 1.6 : 1);
      ctx.fillStyle = COLORS[p.n.group]; ctx.shadowColor = COLORS[p.n.group]; ctx.shadowBlur = 12 * dpr; ctx.globalAlpha = .55 + .45 * (1 - (p.z + 1.5) / 3);
      ctx.beginPath(); if (p.n.group === "Proyectos") ctx.rect(p.X - r, p.Y - r, r * 2, r * 2); else if (p.n.group === "Clientes") { ctx.moveTo(p.X, p.Y - r * 1.2); ctx.lineTo(p.X + r * 1.1, p.Y + r * .8); ctx.lineTo(p.X - r * 1.1, p.Y + r * .8); ctx.closePath(); } else ctx.arc(p.X, p.Y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (p.n.name && p.n.group !== "Reuniones") { ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.font = `600 ${11 * dpr}px -apple-system, system-ui`; ctx.fillText(p.n.name, p.X + r + 5 * dpr, p.Y + 4 * dpr); } });
    raf = requestAnimationFrame(frame);
  }
  let sel = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * .01; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * .01)); vyaw = dx * .0015 || vyaw; drag.x = e.clientX; drag.y = e.clientY; });
  canvas.addEventListener("pointerup", (e) => {
    const d = drag; drag = null; if (vyaw && Math.abs(vyaw) < .002) vyaw = .0035 * Math.sign(vyaw);
    if (d && d.moved < 8) { const r = canvas.getBoundingClientRect(), z = Number(getComputedStyle(shellScreen).zoom) || 1; const x = (e.clientX - r.left) * dpr / z, y = (e.clientY - r.top) * dpr / z;
      const hit = proj.filter((p) => p.n.name).sort((a, b) => Math.hypot(a.X - x, a.Y - y) - Math.hypot(b.X - x, b.Y - y))[0];
      if (hit && Math.hypot(hit.X - x, hit.Y - y) < 30 * dpr) { sel = hit.n; const m = meetingById(sel.meeting);
        const fact = (FACTS_KNOWN[sel.group] || []).find((r) => r[0] === sel.name)?.[1] || m.summary;
        const s = sheet(`<h3>${sel.name}</h3><p>${sel.group === "Reuniones" ? "Reunión" : sel.group.slice(0, -1)} · ${fact}</p><div style="margin-top:16px"><a class="l-b l-b--primary l-b--block" href="reunion.html?id=${m.id}">Abrir «${m.title}»</a></div>`);
      } }
  });
  return { start() { resize(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }, stop() { cancelAnimationFrame(raf); } };
}

RENDER[PAGE]?.();
