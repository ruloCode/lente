// Lente's website (ship-hackathon 5.1, design 6b): light by default; this switch turns on the designed
// dark theme and remembers the choice. Loaded in the head without defer so a reader who chose dark
// never sees a light flash. Without it the site is complete, in light.
(() => {
  const KEY = "lente-theme";
  /** The browser bar follows the page: src/theme.ts --bg for each theme. */
  const BAR = { light: "#F2F2F7", dark: "#000000" };
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage off: stay light */ }

  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[theme]);
    document.querySelector(".theme")?.setAttribute("aria-pressed", String(theme === "dark"));
  }
  apply(saved === "dark" ? "dark" : "light");

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector(".theme");
    if (!button) return;
    button.hidden = false;
    apply(root.dataset.theme);
    button.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch { /* the choice lasts this page only */ }
    });
  });
})();
