---
name: lente-ui-clone
description: Clone a Lente screen mockup (PNG) into HTML/CSS pixel by pixel with the Lente iOS kit, in light and AAA dark, with interactions, and verify it by measurement. Use when asked to "replicate", "clone", "make pixel perfect", "build this screen from the image", or to add a screen or component to docs/design/ios-kit.
---

# Clone a screen with the Lente iOS kit

The kit and the full method live in `docs/design/ios-kit/` (read its `README.md` first). This skill is the checklist.

## Rules

- Write everything fresh for Lente; never copy components, icons or CSS from other repositories or UI libraries.
- Reuse kit components and tokens; add a new component only when no existing one fits, and add it to `components.css`, the README table and (if interactive) `lente-kit.js`.
- Every number comes from a measurement of the reference; never eyeball a size.
- Dark mode keeps the geometry and meets 7:1 for all text; state is never color only.

## Steps

1. Put the reference in `refs/<screen>.png` (1520 × 2688 = 380 × 672 CSS px at 4×).
2. Measure with Pillow: ink boxes for every text, row/column luminance steps for surfaces, corner profiles for radii, colors from flat pixels and glyph cores. Font size ≈ cap height ÷ 0.705 (SF Pro); with `line-height: 1`, baseline ≈ top + 0.862 × size.
3. Write `tools/spec-<screen>.json` with one box per text element: `"name": [x0, y0, x1, y1, threshold]` in 4× pixels.
4. Build `<screen>.html` from kit components (`<link>` tokens.css and components.css, `<script src="lente-kit.js">`, the pre-paint theme snippet in `<head>`).
5. Loop until every element is within 4 px at 4× (1 CSS px), except offsets that come from inconsistencies inside the reference (say which):
   - `tools/render.sh <screen>.html /tmp/out.png light`
   - `python3 tools/compare.py refs/<screen>.png /tmp/out.png tools/spec-<screen>.json /tmp/sheet.png`
   - Fix: vertical offset → margins; same height but wider → letter-spacing; medium text 3–11 % wide → add `.disp`; then `tools/zoom.py` for shadows, glass and icons.
6. Render dark (`... dark`) and check contrast of every new color pair (≥ 7:1).
7. Add the interactions the screen implies, wire them in `lente-kit.js`, extend `tools/interact.mjs` with assertions, run it, and require all PASS and no console errors.
8. Save `renders/<screen>-{light,dark}.png`, update the README tables and results, and report the measured worst offset and mean difference.
