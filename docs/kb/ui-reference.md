# UI reference: the Meta AI app

Measured on 2026-10-28 from the Meta AI app (`com.facebook.stella` 296.1.0.25.165) on a Galaxy S25 (1080×2340, 480 dpi, so 1 dp = 3 px, font scale 1.0), dark theme, no glasses paired. Bounds come from `uiautomator` dumps and colours from pixel samples of screenshots. The screenshots stay off the repo because they show the author's photos and other people.

We borrow the system (spacing, radii, surfaces, hierarchy, component shapes), never the brand: no Meta logo, gradient ring, the Optimistic typeface, the name or its exact palette. Lente keeps its "Calibre" identity (see [decisions.md](decisions.md)).

## Screens covered

Home with no glasses (empty state + gallery), side drawer, new chat (suggestions + composer, keyboard open), mode popover (Instantáneo / Reflexivo), attach sheet, Contenido multimedia (segmented control + masonry grid), Artefactos (preset tiles), Tareas programadas (suggested scheduled tasks), Vibes intro, Notificaciones (empty), Configuración (grouped settings), Apps (connectors), Aspecto de la app (radio group).

## Layout grid (dp, screen 360 wide)

| Thing | Value |
|---|---|
| Side gutter | 20 for grouped cards and full-width buttons; 16 for outlined list cards and the composer |
| Header | top 40, height 48; circular icon button 48 at x 18; title starts at x 76 (button + 10) |
| Header right action | pill 110×48 with icon + label ("Lentes"), or 44–48 circular icon buttons side by side |
| Touch targets | 48 everywhere (icons, chips, send, radios), even when the visible shape is smaller |
| Section label → its card | 8 below the label; 30 between the end of one group and the next label |
| Section label inset | 16 from the card edge, so it lines up with row content |
| Single-line row | 56 tall; icon at 16 from the card edge; text at 56 from the card edge; chevron at the right with 16 padding |
| Two-line row | 59–84 tall; 21 dp title line, 16 dp secondary line |
| Profile row | 68 tall, 44 avatar |
| Outlined list card | 328×71, 12 gap between cards, icon tile at 16, text at 62, trailing "+" |
| Preset tile | 150×150, 12 gap, horizontal scroll with the next tile peeking at the edge |
| Media grid | two columns edge to edge, 2 gutter, tall 177×314 and square 177×177 |
| Drawer | 288 wide (rest is scrim); items 268×46 inset 10; search pill 196×48 + 48 circle |
| Empty state | 24 sp title, 16 sp muted subtitle 4 below, one 48 pill button 36 below |

## Type scale (sp, from text box heights)

| Role | Size | Colour |
|---|---|---|
| Greeting ("¿En qué puedo ayudarte?") | ~30, two lines, muted | secondary |
| Empty-state title | ~24 | primary |
| Header title | ~17–18, semibold | primary |
| Row label, composer text | ~16 | primary |
| Card title | ~15, medium | primary |
| Section label | ~15, medium | secondary |
| Card subtitle, schedule | ~13 | secondary |
| Tile caption over image | ~12–13, two lines, white on image | primary |

Sentence case everywhere, no uppercase labels, no letter-spacing tricks. Hierarchy comes from size and grey level, not from weight or colour.

## Colour (dark theme, sampled)

| Token | Hex | Used for |
|---|---|---|
| Canvas | `#111112` | main screens, drawer |
| Canvas, modal page | `#181819` | settings, which open as a full-screen modal with a close X instead of a menu |
| Surface | `#28292B` | grouped cards, circular buttons, composer, popover |
| Surface, pill | `#2E2E2F` | secondary pill buttons; also the 1 px outline of list cards |
| Sheet | `#202020` | bottom sheet |
| Surface in sheet | `#3B3B3B` | grouped list inside a sheet (one step up again) |
| Divider | `#424345` | 1 px between rows inside a card, inset 16 both sides |
| Scrim | `#080809` | behind drawer and sheets |
| Text primary | `#FFFFFF` | |
| Text secondary | `#888B8F` | subtitles, section labels, greeting |
| Placeholder | `#93969B` | |
| Action | `#1793FF` | links, the one filled CTA, selected radio, caret, send |
| AI accent | `#644DF6` on a ~10 % tint (`#181624`) | icons of suggestion tiles |

Rules seen: one saturated colour for action and one for "AI made this"; everything else is grey. Filled surfaces have no border; only list cards that are suggestions (not yet yours) use a 1 px outline.

## Shape

Corners are continuous (squircle-like), so these are visual estimates from zoomed crops.

| Element | Radius |
|---|---|
| Buttons, chips, search, ask bar | full pill |
| Grouped card, radio group | ~24 |
| Composer (two rows) | ~28 |
| Bottom sheet top corners | ~28–32 |
| Outlined list card, preset tile, photo thumbnails | ~12–16 |

## Components worth copying as patterns

- **Ask bar that grows into a composer.** Idle: "+" circle (48) and a pill "Preguntar a Meta AI…" (264×48) pinned to the bottom. Focused: a ~100 dp card with the text row on top and an action row below: "+" left, an outlined mode chip ("Instantáneo", 116×48) and a mic that turns into a filled blue send button once there is text.
- **Mode popover.** Anchored above the composer, full width, each option as title + one-line muted description, check mark on the selected one. Two options only: "Responde de inmediato" / "Razona durante más tiempo antes de responder".
- **Suggestion rows.** 64 tall, a 48 tinted icon tile with the AI accent, one line of text. No card around them.
- **Grouped settings.** Section label outside, rows inside one rounded surface, dividers inset, icon + label + chevron. Connectors (Google Calendar, Gmail, Outlook…) use the same rows with a "+" in a circle on the right.
- **Bottom sheet for attach.** Title row with "Ver todo" link, a row of 80×80 tiles (camera first, then recent photos with a selection circle), then a grouped list ("Subido recientemente", "Archivos").
- **Feature intro.** Image on top, title, three rows of icon + two-line text, one full-width blue "Continuar" at the bottom.
- **Empty states.** One short sentence, centred, nothing else ("No hay notificaciones para mostrar.").
- **Theme setting.** Automático / Claro / Oscuro radio group, Automático by default.

## Brand moves we can make our own

- The home hero is a product render of the device floating on the canvas with a soft shadow, then one sentence and one button. Lente has its own clip render (`hardware/clip-v1`, GLB) for the same move.
- Restraint: black canvas, white type, one action colour. Calibre already has this; the lesson is to keep cyan for the line to say and amber for measured numbers, and not add more colours.
- Scheduled tasks are suggested as ready-made cards with their schedule underneath ("Todos los días a las 8:00"). Useful shape for `add-closing-agent` actions waiting for approval.
- Connectors live in Settings → Apps as a plain list, not a store. That fits the "MCP, no plugin store" decision.

## What this means for Lente's phone page

`src/pilot-page.ts` today: surfaces `#121a1f`/`#18222a` on `#0b1013` separated by 1 px `--line` borders, radii 8–16, uppercase mono labels. Changes that would move it toward this system while keeping Calibre:

1. Fewer borders: give `--raised` more contrast against `--bg` (Meta's step is about 23 levels of lightness) and drop the outline on filled cards; keep outlines only for proposals the wearer has not accepted yet.
2. Radii: 24 on cards, full pill on buttons and inputs, 28 on sheets.
3. Rows of 56 dp with 16 inset and inset dividers for lists (past meetings, vocabulary, settings).
4. Section labels in sentence case at body size and muted grey; keep the uppercase mono label only for the DILO card, where it is the brand.
5. 48 dp targets and a bottom-pinned primary action.
