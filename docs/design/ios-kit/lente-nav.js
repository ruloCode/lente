// Lente iOS kit: tab bar and side menu. Loaded after lente-kit.js (uses $, $$, haptic, toast, Listen, setThemeMode, themeMode).
// One number drives the side menu: --p on .l-screen (0 closed … 1 open). Fingers set it directly; releases animate it with a spring.

const EDGE_PX = 24;              // swipe-to-open starts this close to the left edge
const DRAWER_TRAVEL_PX = 330;    // distance the panel moves from closed to open
const FLING_PX_PER_MS = 0.35;    // a release faster than this decides the direction on its own
const OPEN_MS = 455, CLOSE_MS = 240;
const ICON_POP_DELAY_MS = 110;   // the icon answers when the pill lands, not before
const NAV_DELAY_MS = 260;        // let the pill land before the page changes
const COMPACT_AFTER_PX = 24;

const stage = $(".l-stage");

// ── Tab bar ───────────────────────────────────────────────────────────────
$$(".l-tabs").forEach((bar) => {
  const pill = $(".l-pill", bar);
  const tabs = $$(".l-tab", bar);
  // The lens wraps the icon only; it is centred on the tab.
  const place = (tab) => pill.style.setProperty("--pill-x", `${tab.offsetLeft + (tab.offsetWidth - pill.offsetWidth) / 2}px`);
  const current = () => tabs.find((t) => t.getAttribute("aria-current") === "page");
  pill.style.transition = "none"; place(current()); pill.offsetWidth; pill.style.transition = "";
  addEventListener("resize", () => place(current()));
  tabs.forEach((tab) => tab.addEventListener("click", (e) => {
    e.preventDefault();
    const from = current();
    if (tab === from) return;
    from?.removeAttribute("aria-current");
    tab.setAttribute("aria-current", "page");
    place(tab); haptic(8);
    if (!reduceMotion) {
      // Liquid stretch while travelling: wider and a little flatter mid-way, settles with the spring.
      const dir = tabs.indexOf(tab) > tabs.indexOf(from) ? 1 : -1;
      pill.animate([{ scale: "1 1" }, { scale: "1.22 .92", transformOrigin: dir > 0 ? "0% 50%" : "100% 50%", offset: .4 }, { scale: "1 1" }],
        { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" });
      const bouncy = getComputedStyle(root).getPropertyValue("--spring-bouncy");
      $(".ico", tab).animate([{ scale: 1, easing: "cubic-bezier(.3,0,.6,1)" }, { scale: .84, offset: .16, easing: bouncy }, { scale: 1 }],
        { duration: 640, delay: ICON_POP_DELAY_MS });
    }
    const href = tab.getAttribute("href");
    if (href && href !== "#") setTimeout(() => { location.href = href + location.search; }, reduceMotion ? 0 : NAV_DELAY_MS);
    else toast(`${tab.textContent.trim()}: pronto`);
  }));
});

// Compact dock while scrolling down; full again on the way up or near the top.
$$(".l-scroll").forEach((sc) => {
  const dock = $(".l-dock"); let last = 0, ticking = false;
  sc.addEventListener("scroll", () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = sc.scrollTop, dy = y - last;
      if (y < COMPACT_AFTER_PX || dy < -6) dock.classList.remove("is-compact");
      else if (dy > 6) dock.classList.add("is-compact");
      last = y; ticking = false;
    });
  }, { passive: true });
});

// ── Side menu ─────────────────────────────────────────────────────────────
const drawer = $(".l-drawer");
if (drawer) {
  const screenEl = $(".l-screen");
  const scrim = $(".l-scrim");
  const openers = $$("[data-menu-open]");
  let p = 0, isOpen = false, lastOpener = null, anim = null;

  $$("[data-row]", drawer).forEach((el, i) => el.style.setProperty("--i", i));
  drawer.inert = true;

  const setP = (v) => { p = v; screenEl.style.setProperty("--p", v.toFixed(4)); };
  const springFor = (opening) => opening
    ? { easing: getComputedStyle(root).getPropertyValue("--spring-drawer"), ms: OPEN_MS }
    : { easing: "cubic-bezier(.3,.0,.2,1)", ms: CLOSE_MS };

  function animateTo(target, velocity = 0) {
    anim?.cancel();
    const opening = target === 1;
    const { easing, ms } = springFor(opening);
    // Shorter when the finger already did part of the way, or flung fast.
    const remaining = Math.abs(target - p);
    const speedup = Math.min(1, Math.abs(velocity) / 1.2);
    const duration = reduceMotion ? 0 : Math.max(160, ms * Math.max(.35, remaining) * (1 - speedup * .35));
    const from = p;
    if (!duration) { setP(target); return finish(target); }
    anim = screenEl.animate([{ "--p": from }, { "--p": target }], { duration, easing, fill: "forwards" });
    anim.onfinish = () => { anim.cancel(); setP(target); finish(target); };
  }
  function finish(target) {
    isOpen = target === 1;
    screenEl.classList.toggle("is-menu", isOpen);
    drawer.inert = !isOpen; stage.inert = isOpen;
    openers.forEach((b) => b.setAttribute("aria-expanded", String(isOpen)));
    if (isOpen) ($('[aria-current="page"]', drawer) || $("button, a", drawer)).focus({ preventScroll: true });
    else if (lastOpener) lastOpener.focus({ preventScroll: true });
  }
  function open(from) { lastOpener = from || openers[0]; drawer.classList.add("is-open"); haptic(10); animateTo(1); }
  function close() { drawer.classList.remove("is-open"); animateTo(0); }

  openers.forEach((b) => b.addEventListener("click", () => open(b)));
  $("[data-menu-close]", drawer).addEventListener("click", close);
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) close(); });

  // Gestures: swipe right from the left edge to open; swipe left on the open menu to close.
  let drag = null;
  const scale = () => Number(getComputedStyle(screenEl).zoom) || 1;
  screenEl.addEventListener("pointerdown", (e) => {
    const r = screenEl.getBoundingClientRect(), x = (e.clientX - r.left) / scale();
    const fromEdge = !isOpen && x < EDGE_PX;
    const onOpen = isOpen && (e.target.closest(".l-drawer") || e.target === scrim);
    if (!fromEdge && !onOpen) return;
    drag = { x0: e.clientX, y0: e.clientY, p0: p, decided: false, horizontal: false, samples: [[e.timeStamp, e.clientX]], id: e.pointerId };
  });
  screenEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.decided && Math.hypot(dx, dy) > 8) { drag.decided = true; drag.horizontal = Math.abs(dx) > Math.abs(dy); if (drag.horizontal) { screenEl.setPointerCapture(e.pointerId); anim?.cancel(); drawer.classList.add("is-open"); } }
    if (!drag.horizontal) return;
    let next = drag.p0 + dx / scale() / DRAWER_TRAVEL_PX;
    if (next > 1) next = 1 + (next - 1) * .18;          // rubber band past fully open
    setP(Math.max(0, next));
    drag.samples.push([e.timeStamp, e.clientX]); if (drag.samples.length > 6) drag.samples.shift();
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.horizontal) return;
    const [t0, x0] = d.samples[0], [t1, x1] = d.samples[d.samples.length - 1];
    const v = (x1 - x0) / Math.max(1, t1 - t0) / scale();   // px per ms
    const target = Math.abs(v) > FLING_PX_PER_MS ? (v > 0 ? 1 : 0) : (p > .5 ? 1 : 0);
    if (target === 1) { lastOpener = lastOpener || openers[0]; drawer.classList.add("is-open"); } else drawer.classList.remove("is-open");
    animateTo(target, v);
  };
  screenEl.addEventListener("pointerup", release);
  screenEl.addEventListener("pointercancel", release);

  // Rows that go to a page that exists navigate; the rest say they're coming.
  $$(".l-navrow, .l-recent, .l-device", drawer).forEach((row) => row.addEventListener("click", (e) => {
    const href = row.getAttribute("href");
    if (!href || href === "#") { e.preventDefault(); toast(`${($(".lab", row) || $("b", row)).textContent}: pronto`); return; }
    if (row.getAttribute("aria-current") === "page") { e.preventDefault(); close(); return; }
    e.preventDefault(); close(); setTimeout(() => { location.href = href + location.search; }, reduceMotion ? 0 : CLOSE_MS);
  }));

  // Live status mirrors the shared listening state.
  const live = $(".l-live", drawer);
  if (live) {
    const state = $(".state span", live), btn = $(".l-pillbtn", live);
    const render = (L) => { state.textContent = L.paused ? `En pausa · ${L.fmt()}` : `Escuchando · ${L.fmt()}`; live.classList.toggle("is-paused", L.paused);
      btn.textContent = L.paused ? "Seguir" : "Pausar"; btn.setAttribute("aria-label", L.paused ? "Seguir escuchando" : "Pausar Lente"); };
    Listen.subs.add(render); render(Listen);
    btn.addEventListener("click", () => Listen.toggle());
  }

  // Theme segmented control.
  const seg = $(".l-seg", drawer);
  if (seg) {
    const opts = $$("button", seg), order = ["light", "dark", "auto"];
    const sync = (mode) => { const i = order.indexOf(mode); seg.style.setProperty("--seg", i); opts.forEach((b, j) => b.setAttribute("aria-checked", String(j === i))); };
    sync(themeMode());
    opts.forEach((b) => b.addEventListener("click", () => { sync(b.dataset.mode); haptic(8); setThemeMode(b.dataset.mode); }));
    document.addEventListener("lente:theme", (e) => sync(e.detail));
  }
}
