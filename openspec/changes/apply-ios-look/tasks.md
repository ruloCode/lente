# Tasks

## 1. Phone

- [x] 1.1 Kit tokens (light and dark from the system), system font, no web fonts, logo and theme colors; verify screenshots at 360 and 390 px in both themes with no horizontal overflow
- [x] 1.2 Components: header, listening pill, cards, Dilo card, grouped rows, switches, segmented control, action dock, side menu, live view; verify screenshots of Ahora, the live view and the menu in both themes, `pnpm typecheck && pnpm test`
- [x] 1.3 Contrast of every text color pair at 7:1 or more in both themes; verify with a measurement script
- [ ] 1.4 On the phone against the hub: a live cue, listening and paused [phone]

## 2. Mac

- [x] 2.1 `/desktop` with the kit's tokens in a macOS window layout; verify screenshots at 1440 × 900 in both themes

## 3. Agents in the kit ("Tu equipo")

- [x] 3.1 `agentes.html`: title "Tu equipo" with how many are working, a row of characters (lead agent first) with status badges, an offline note, the agent list with what each one is doing, and a composer; drawn new for Lente; verify renders in both themes
- [x] 3.2 `agente.html`: the agent's character, "Escríbele a …", where it answers from, suggested questions and a composer; verify renders in both themes and `tools/interact.mjs` passes
