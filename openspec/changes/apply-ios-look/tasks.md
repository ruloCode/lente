# Tasks

## 1. Phone

- [x] 1.1 Kit tokens (light and dark from the system), system font, no web fonts, logo and theme colors; verify screenshots at 360 and 390 px in both themes with no horizontal overflow
- [x] 1.2 Components: header, listening pill, cards, Dilo card, grouped rows, switches, segmented control, action dock, side menu, live view; verify screenshots of Ahora, the live view and the menu in both themes, `pnpm typecheck && pnpm test`
- [x] 1.3 Contrast of every text color pair at 7:1 or more in both themes; verify with a measurement script
- [x] 1.4 On the phone against the hub: a live cue, listening and paused [phone]
  - 2026-11-02, the owner's Samsung (SM-S931B, 1080 × 2340, dark theme), Chrome on `localhost:8080` over `adb reverse`, against a hub from `integrate/2026-11` (`9fc22e7`) with the stubbed Meta API (`pnpm stub`), no Supabase and a scratch data folder. The clip was `scripts/fake-clip.ts` streaming a `say -o` WAV; nothing played aloud.
    - Paused, no clip: «En pausa», «Sin clip», «Empezar a escuchar». A tap on it gave the red «Escuchando» pill and «Clip conectado».
    - Live cue: the stub's question as turn B and a DILO card «Yes, Friday works if QA signs off Thursday.» with «dijeron tu nombre · en 8 ms»; the hub logged `sent→phone 15 ms`.
    - Paused while listening (`POST /listen/off`): the pill turned grey «En pausa · 1:40» with the play button.

## 2. Mac

- [x] 2.1 `/desktop` with the kit's tokens in a macOS window layout; verify screenshots at 1440 × 900 in both themes

## 3. Agents in the kit ("Tu equipo")

- [x] 3.1 `agentes.html`: title "Tu equipo" with how many are working, a row of characters (lead agent first) with status badges, an offline note, the agent list with what each one is doing, and a composer; drawn new for Lente; verify renders in both themes
- [x] 3.2 `agente.html`: the agent's character, "Escríbele a …", where it answers from, suggested questions and a composer; verify renders in both themes and `tools/interact.mjs` passes
