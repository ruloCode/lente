# Lente iOS kit

A small, dependency-free HTML/CSS/JS kit for Lente's phone screens in the iOS 26 style, built by cloning two reference renders pixel by pixel and then turning the clone into reusable components. Light is the measured theme; dark keeps the same geometry with WCAG AAA (7:1) text.

| Screen | Light | Dark | Reference |
|---|---|---|---|
| Asistir | [renders/asistir-light.png](renders/asistir-light.png) | [renders/asistir-dark.png](renders/asistir-dark.png) | [refs/asistir.png](refs/asistir.png) |
| Reuniones | [renders/reuniones-light.png](renders/reuniones-light.png) | [renders/reuniones-dark.png](renders/reuniones-dark.png) | [refs/reuniones.png](refs/reuniones.png) |

| Side menu | [renders/menu-light.png](renders/menu-light.png) | [renders/menu-dark.png](renders/menu-dark.png) | (new, no reference) |

Interactions, recorded by the test run: [renders/interacciones.gif](renders/interacciones.gif). Navigation motion at 30 fps: [renders/navegacion.mp4](renders/navegacion.mp4).

Open `asistir.html` or `reuniones.html` in a browser. The menu button (left of the tab bar), a swipe from the left edge, or Reuniones' avatar opens the side menu; its "Apariencia" switch sets Claro, Oscuro or Auto (`d` also toggles).

## Files

- `tokens.css`: colors, type stack, elevation and motion, for `:root` (light) and `[data-theme="dark"]`.
- `components.css`: the components below, in flow layout.
- `lente-kit.js`: icon sprite, theme (light, dark, auto), phone fit, shared listening state and the screen interactions.
- `nav.css` + `lente-nav.js`: the dock (menu button + tab bar) and the side menu, with the spring curves.
- `assets/`: made with Higgsfield for Lente: `logo-mark.svg` (Recraft V4.1 vector; cleaned into `logo-mark-clean.svg` and the themeable `#i-logo` symbol), `app-icon.png` (GPT Image 2.5; `app-icon-512.png`, `apple-touch-icon.png`, `favicon-64.png`), `clip-glasses.png` (GPT Image 2.5, transparent; `clip-glasses@720.png` is the one the menu loads).
- `asistir.html`, `reuniones.html`: screens built only from the kit.
- `refs/`: the reference renders (Higgsfield, GPT Image 2.5, generated for Lente).
- `tools/`: render, compare, zoom and interaction test (see Method).

## Components

| Class | What it is | Notes |
|---|---|---|
| `.l-screen` | 380 × 672 artboard | `--screen-top` sets where content starts; `.l-screen--cool` is the Reuniones variant (cooler background, content at 35 px). Scales to the phone with `--fit`. |
| `.l-status` | Status bar overlay | Time, signal, Wi-Fi, battery from the sprite. Takes no space. |
| `.l-hero` + `.l-title` | Large title with brand at the right | Asistir header. |
| `.l-topbar` + `.l-title--sm` | Brand left, avatar right, title below | Reuniones header. |
| `.l-brand`, `.l-tagline`, `.l-avatar` | Logo and word, two-line tagline, round glass avatar | Brand and avatar toggle the theme (`data-theme-toggle`). |
| `.l-listen` | Listening pill | `data-start="12:48"` starts the live timer; tap pauses (`aria-pressed`). |
| `.l-card` + `.l-tag` + `.l-say` + `.l-asked` + `.l-actions` | The Dilo card | `data-dilo` on the card, `data-copy` and `data-again` on its buttons. |
| `.l-btn--accent`, `.l-btn--neutral` | Pill buttons | Per-instance `--w`, `--pl`, `--iw`, `--ih`, `--gap` reproduce the measured widths. |
| `.l-group` + `.l-list` + `.l-row` + `.l-tile--{blue,green,purple}` | Inset grouped list with icon tiles and chevrons | Separators come from `.l-row + .l-row`. |
| `.l-search` | Glass search field | Focus ring in the accent color. |
| `.l-chips` + `.l-chip` | Filter chips | `aria-pressed="true"` is the selected one; `data-topic` filters `.l-mcard`. |
| `.l-section` | Section header (HOY, AYER) | Hidden automatically when its cards are filtered out. |
| `.l-mcard` + `.l-topic--{product,client,team}` + `.l-meta` + `.l-sum` | Meeting card | `data-topic` and its text drive filtering and search. |
| `.l-stage` | Everything on the screen except the side menu | Recedes (moves right, scales to 93 %, rounds its corners) as the menu opens. |
| `.l-dock` = `.l-menubtn` + `.l-tabs` (`.l-pill`, `.l-tab`, `.l-badge`) | Floating dock: round menu button plus a 5-tab glass bar | Same on every screen. The pill sizes itself to the label. `.is-compact` while scrolling down. |
| `.l-scrim` + `.l-drawer` | Side menu | Header with the Higgsfield logo, live status (`.l-live`), device card with the clip render (`.l-device`), sections (`.l-navrow`, with `.l-badge` or `.l-soon`), recent meetings (`.l-recent`), theme switch (`.l-seg`). Rows with `data-row` enter staggered. |
| `.l-toast` | Status toast | Created on demand by `toast()`. |

Icons live in one sprite in `lente-kit.js` (`#i-sig`, `#i-wifi`, `#i-bat`, `#i-copy`, `#i-check`, `#i-again`, `#i-video`, `#i-people`, `#i-doc`, `#i-chev`, `#i-cal`, `#i-cal-fill`, `#i-checkc`, `#i-brain`, `#i-wave`, `#i-ask`, `#i-search`, `#i-person`), drawn for this kit. Use them as `<svg class="ico"><use href="#i-cal"/></svg>`; they take `currentColor`.

## Interactions

- Entrance: elements with `data-enter` rise in, staggered 60 ms.
- Listening pill: the timer counts every second; tap pauses with a grey dot, "En pausa", a toast and a haptic pattern; the red dot pulses while listening.
- Dilo card: "Otra" blurs the line out, brings the next one in word by word, spins its icon and flashes the card; "Copiar" copies the line, turns into "Copiado" with a check, vibrates and shows a toast.
- Tab bar: the pill slides to the tapped tab with a spring and stretches mid-way; the tab's icon dips and pops back as the pill lands; then the page navigates (260 ms later). Tabs without a page yet say "pronto".
- Side menu: opens from the menu button, Reuniones' avatar, or a swipe from the left 24 px; follows the finger 1:1 with a rubber band past fully open; a release faster than 0.35 px/ms decides the direction, otherwise the halfway point does. Closes with the ✕, a tap outside, a swipe left, Esc, or choosing a section. While open the rest of the screen is `inert`; focus goes to the current section and comes back to the button that opened it. Its live status and "Pausar" share one state with the listening pill.
- Dock: compacts (labels fold away, 56 → 46 px) while scrolling down; returns on the way up or near the top.
- Reuniones: chips and search filter the cards (accents and case ignored) with FLIP motion; empty sections hide; "Sin resultados" when nothing matches.
- Press states: buttons, chips and cards scale to 0.96–0.985 while pressed.
- Theme: `?theme=dark|light`, else the saved choice, else the system; switching uses a View Transition when available and persists across pages.
- `prefers-reduced-motion: reduce` turns every animation off. `?static` also stops timers and entrance motion (used for pixel checks).

## Motion rhythm

Curves are CSS `linear()` sampled from a damped spring (mass 1), so motion settles like a physical object instead of a fixed bezier. Exits are faster than entrances.

| Moment | Curve | Timing |
|---|---|---|
| Press down (buttons, tabs, rows) | ease-out | 90 ms to 0.86–0.97 scale |
| Release | `--spring-bouncy` (k 380, c 24, 8.4 % overshoot) | 590 ms |
| Tab change: pill | `--spring-snappy` (k 520, c 40, 0.2 % overshoot) + stretch 1.22 × 0.92 at 40 % | 410 ms / 380 ms |
| Tab change: icon | dip to 0.84, then `--spring-bouncy` | starts 110 ms in, when the pill lands |
| Side menu open | `--spring-drawer` (k 300, c 32, critically damped) | 455 ms, shorter after a drag or a fling |
| Side menu rows | `cubic-bezier(.22, 1, .36, 1)` | 320–420 ms each, 70 ms + 26 ms × row |
| Side menu close | `cubic-bezier(.3, 0, .2, 1)`, rows out together | 240 ms |
| Theme switch thumb, dock compaction | `--spring-snappy` | 410 ms |

`prefers-reduced-motion` removes all of it: the menu and pages switch instantly.

## Navigation (AAA)

Measured contrast for every navigation text. Light: inactive tabs 9.6:1, selected tab 8.1:1, badges 8.2:1, menu text 18.9:1, secondary 8.4:1, selected row 8.4:1, "Pronto" 7.5:1, live status 7.0:1. Dark: inactive tabs 11.2:1, selected 11.8:1, badges 9.2:1, menu text 18.7:1, secondary 12.3:1, selected row 11.8:1, live status 9.6:1. The previous light tab bar measured 3.2–4.4:1 with 9.6 px labels and was replaced. The bar is 94 % opaque with a 24 px blur, and a fade above it keeps content from showing through behind the labels.

## Dark mode (AAA)

Measured contrast on its surface: primary text 17:1, secondary 11.2:1, tertiary 10.1:1, accent 9.6:1, black on accent buttons 11.8:1, topic tags 8.8–9.2:1, inactive tabs 10.1:1, chevrons 7.7:1. State is never color only: the pill says "Escuchando" or "En pausa", the selected tab has a filled pill and bold label.

## Method: how to clone a screen pixel by pixel

The goal is a render that lands on the reference within 1 CSS px per element, then components that keep those numbers in flow layout.

1. **Fix the artboard.** References are 1520 × 2688. Work at 380 × 672 CSS px rendered at 4×, so every measured pixel divides by 4.
2. **Measure, don't guess.** With Pillow, find each text's ink box (pixels darker than a threshold), each surface's edges (luminance steps along a row or column), corner radii (first white pixel per row near a corner) and colors (darkest pixel inside a glyph, flat pixel inside a surface). Cap height ÷ 0.705 gives the SF Pro font size; baseline − line-box top ≈ 0.862 × font size with `line-height: 1`.
3. **Build, then render the same way every time.** `tools/render.sh page.html out.png [light|dark]` uses a headless Chromium at 380 × 672 × 4 with reduced motion and `?static`. Use the headless shell, not desktop Chrome in headless mode: at 4× the latter tiles the screenshot, and its window cannot be narrower than about 500 px.
4. **Compare by element.** `python3 tools/compare.py ref.png out.png tools/spec-<screen>.json sheet.png` prints each element's offset (render − reference) and the mean pixel difference, and writes reference | render | amplified diff. Under 4 px at 4× is under 1 CSS px.
5. **Fix what the numbers say.** Vertical offsets → `top`/margins. Width off at the same cap height → `letter-spacing`. Medium text 3–11 % too wide → the reference uses SF's Display optical size: add `.disp` (`font-variation-settings: "opsz" 32`). Small subtitles fit the default Text size.
6. **Judge the rest by eye.** `python3 tools/zoom.py ref.png out.png x0 y0 x1 y1 crop.png` puts the same crop side by side for shadows, glass, weights and icons.
7. **Turn the clone into components.** Rebuild the screen with flow layout using the measured paddings and gaps, render it, and compare it against the verified clone render: any offset is a component bug (for example, an `inline-block` tag that picks up the parent's line height and pushes everything 1 px down).
8. **Test the behavior.** `tools/interact.mjs` drives every interaction with Playwright and asserts the result (28 checks, plus no console errors). To judge rhythm, record a video (`recordVideo` in Playwright), cut 30 fps strips of each moment with `ffmpeg -vf fps=30,crop=…`, and look for elements that move before their cause (for example an icon reacting before the pill reaches it). It needs `playwright-core` installed next to it: `cd tools && npm init -y && npm i playwright-core`, then `node interact.mjs <kit-dir> <frames-dir> <path-to-chrome-headless-shell>`.

Results on 2026-10-30 (content only: the tab bar was redesigned on purpose and is no longer compared): Asistir worst element offset 2.0 CSS px (row heights in the reference are irregular; the kit uses one row height), mean difference 6.03/255. Reuniones mean difference 8.07/255; one card title in the reference is drawn smaller than the others, and the kit keeps one title size. The CLI capture sits 0.75 CSS px lower than a Playwright capture of the same page; compare renders made the same way.

## Limits

- Type matches only where SF Pro is the system font (Apple devices). On Android the stack falls back to Roboto; for an identical look there, ship a font such as Inter and re-tune letter-spacing with the same tools.
- The two references come from different generations, so their type scales differ (Reuniones' title is 31 px, Asistir's 36.3 px). The kit keeps both as measured.
