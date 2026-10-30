# Lente iOS kit

A dependency-free HTML/CSS/JS kit for Lente's phone app in the iOS 26 style, and a fully navigable demo built with it. It started as a pixel-by-pixel clone of two reference renders; those measurements became the components. Light and dark both meet WCAG AAA (7:1) for text.

**Open the demo:** `index.html` (the introduction the first time, then Ahora). Reset it from Ajustes → «Reiniciar el demo». Recorded run: [renders/demo.mp4](renders/demo.mp4). All screens: [renders/pantallas-light.png](renders/pantallas-light.png), [renders/pantallas-dark.png](renders/pantallas-dark.png).

## Screens

| File | Screen | What works |
|---|---|---|
| `bienvenida.html` | Introduction, 6 steps | Swipe or buttons, progress bar, clip pairing (next waits for it), nicknames you add or remove, voice enrollment with a live waveform, consent switches (saved), greeting by name. |
| `asistir.html` | Ahora | **At rest** (Lente starts paused): greeting, Asistir / Solo grabar, «Empezar a escuchar», clip, next meeting with «Prepárame» (briefing sheet, read aloud), pending items, today's numbers. **Listening**: pill with live timer, waiting state, then the Dilo card (Copiar, Otra); Solo grabar shows no suggestions; «Terminar» needs two taps. |
| `vivo.html` | Live view | Transcript that types itself in, the Dilo card when you are asked, Aportar / Pregunta / ¿De qué hablan?, pause, stop with a second tap → the meeting's notes. |
| `reuniones.html`, `reunion.html?id=` | Meetings, meeting detail | Topic chips and accent-insensitive search; notes whose every item opens the transcript at its turn; share; delete with a second tap. |
| `preguntar.html` | Ask | Suggested questions, typed or «voice» questions, answers with citations that open the exact turn, «No lo encuentro en tus reuniones» when nothing supports an answer. |
| `acciones.html`, `correo.html` | Actions, draft mail | Approve / edit / reject with evidence; editable mail with the quoted turns and the agent's steps; tasks that tick. |
| `memoria.html` | Memory | Facts to keep or drop (kept ones join the list), search, glossary, and a 3D map (drag to rotate, tap a point). |
| `agentes.html`, `agente.html?id=` | Tu equipo, one agent | A row of characters drawn for Lente (the lead, Lente, first), each with a status badge and the status in words; an offline note for the Mac with «Reintentar»; what each agent is doing and when; a composer «Encárgale algo a tu equipo…» with dictation that hands the task to the right agent; the permission sheet for actions with effects. The agent page: large character, where it answers from, «¿En qué vas?» / «¿Qué te falta?», its recent steps and a composer (messages to an offline agent wait «En cola»). |
| `dispositivos.html`, `ajustes.html`, `accesibilidad.html` | Devices, settings, accessibility | Remembered switches, test buzz and light, pairing code, auto-pause value, text size with live preview, reduced motion. |

State is shared and remembered (localStorage): listening state and timer across screens, approved actions, reviewed facts, permissions, switches and theme. Counts in the tab bar, the side menu and the menu button follow it.

## Files

- `tokens.css`: colors, type stack, elevation and motion, for `:root` (light) and `[data-theme="dark"]`.
- `components.css`: the components below, in flow layout.
- `lente-kit.js`: icon sprite, theme (light, dark, auto), phone fit, shared listening state, Dilo card and meeting filters.
- `lente-data.js`: demo data (fictional meetings, actions, facts, agents, answers) and the remembered demo state.
- `lente-shell.js`: puts the same chrome on every screen from `data-*` on `<main>`: status bar, floating menu or back button, tab bar, side menu.
- `lente-pages.js`: one renderer per screen.
- `pages.css`: components of the demo screens.
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
| `.l-fab` | Floating round button, top left | Opens the side menu (a dot marks pending items); on detail screens it is the back button. |
| `.l-dock` + `.l-tabs` (`.l-pill`, `.l-tab`, `.l-badge`) | Centred glass capsule, 4 tabs: Ahora, Reuniones, Preguntar, Memoria | 52 px; the lens sits behind the icon only. Acciones, Agentes and the rest live in the side menu. `.is-compact` while scrolling down. |
| `.l-scrim` + `.l-drawer` | Side menu | Header with the Higgsfield logo, live status (`.l-live`), device card with the clip render (`.l-device`), sections (`.l-navrow`, with `.l-badge` or `.l-soon`), recent meetings (`.l-recent`), theme switch (`.l-seg`). Rows with `data-row` enter staggered. |
| `.l-toast` | Status toast | Created on demand by `toast()`. |

Icons live in one sprite in `lente-kit.js` (`#i-sig`, `#i-wifi`, `#i-bat`, `#i-copy`, `#i-check`, `#i-again`, `#i-video`, `#i-people`, `#i-doc`, `#i-chev`, `#i-cal`, `#i-cal-fill`, `#i-checkc`, `#i-brain`, `#i-wave`, `#i-ask`, `#i-search`, `#i-person`), drawn for this kit. Use them as `<svg class="ico"><use href="#i-cal"/></svg>`; they take `currentColor`.

## Interactions

- Entrance: elements with `data-enter` rise in, staggered 60 ms.
- Listening pill: the timer counts every second; tap pauses with a grey dot, "En pausa", a toast and a haptic pattern; the red dot pulses while listening.
- Dilo card: "Otra" blurs the line out, brings the next one in word by word, spins its icon and flashes the card; "Copiar" copies the line, turns into "Copiado" with a check, vibrates and shows a toast.
- Tab bar: the pill slides to the tapped tab with a spring and stretches mid-way; the tab's icon dips and pops back as the pill lands; then the page navigates (260 ms later). 
- Side menu: opens from the floating button (top left) or a swipe from the left 24 px; follows the finger 1:1 with a rubber band past fully open; a release faster than 0.35 px/ms decides the direction, otherwise the halfway point does. Closes with the ✕, a tap outside, a swipe left, Esc, or choosing a section. While open the rest of the screen is `inert`; focus goes to the current section and comes back to the button that opened it. Its live status shares one state with the listening pill: «Empezar» when Lente is at rest, «Pausar» / «Seguir» while listening.
- Dock: compacts (labels fold away, 52 → 40 px) while scrolling down; returns on the way up or near the top. Content that scrolls under the floating top button gets a fade so it never collides.
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

Measured contrast for every navigation text. Light: inactive tabs 9.6:1, selected tab 8.1:1, badges 8.2:1, menu text 18.9:1, secondary 8.4:1, selected row 8.4:1, "Pronto" 7.5:1, live status 7.0:1. Dark: inactive tabs 11.2:1, selected 11.8:1, badges 9.2:1, menu text 18.7:1, secondary 12.3:1, selected row 11.8:1, live status 9.6:1. The previous light tab bar measured 3.2–4.4:1 with 9.6 px labels and was replaced. The navigation was then slimmed using references from matiz (Granola, Jitter, v0, Supabase mobile navbars: one quiet menu control, 40–56 px bars, no heavy chrome): 4 tabs instead of 5 plus a menu, a 52 px capsule at 88 % opacity with a 20 px blur, a lens only behind the icon, the menu as a floating button at the top left, neutral counts instead of red badges inside the menu, and the device shown as a row instead of a card. Contrast was re-measured after the change: «Conectado» moved to #0A5C27 (7.9:1).

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
8. **Test the behavior.** `tools/interact.mjs` drives every interaction with Playwright and asserts the result (56 checks across all 14 screens, including that every link leads to a real screen, plus no console errors; pass a fifth argument to record the run as video). To judge rhythm, record a video (`recordVideo` in Playwright), cut 30 fps strips of each moment with `ffmpeg -vf fps=30,crop=…`, and look for elements that move before their cause (for example an icon reacting before the pill reaches it). It needs `playwright-core` installed next to it: `cd tools && npm init -y && npm i playwright-core`, then `node interact.mjs <kit-dir> <frames-dir> <path-to-chrome-headless-shell>`.

Results on 2026-10-30 (content only: the tab bar was redesigned on purpose and is no longer compared): Asistir worst element offset 2.0 CSS px (row heights in the reference are irregular; the kit uses one row height), mean difference 6.03/255. Reuniones mean difference 8.07/255; one card title in the reference is drawn smaller than the others, and the kit keeps one title size. The CLI capture sits 0.75 CSS px lower than a Playwright capture of the same page; compare renders made the same way.

## Limits

- Type matches only where SF Pro is the system font (Apple devices). On Android the stack falls back to Roboto; for an identical look there, ship a font such as Inter and re-tune letter-spacing with the same tools.
- The two references come from different generations, so their type scales differ (Reuniones' title is 31 px, Asistir's 36.3 px). The kit keeps both as measured.
