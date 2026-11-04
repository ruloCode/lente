# Design

## Context

Live reads exist (`describeLive` in `src/pilot.ts`): the device sends XGA JPEG frames (1024×768, quality 12), the hub shows each frame as it arrives, asks for the next 600 ms later (`LIVE_FRAME_GAP_MS`), and Muse Spark 1.3 describes the newest frame whenever it is free, with `LIVE_PROMPT` and the previous description. A changed description goes out as a `live` entry; the phone speaks it when «Narrar» is on (`platform/Speech.kt`, Voice priority rules). «Mirar» (`onScreen`) describes one still with `ON_SCREEN_PROMPT`.

The voice agent (`src/voice-agent.ts`) is a Muse Spark 1.3 tool loop over the Responses API with function calling. Its tools live in `src/voice-tools.ts` behind a `VoiceBackend` that the hub builds per runtime (`serveVoiceSession` in `src/voice-hub.ts`, wired at `src/pilot.ts` near `serveVoiceSession(ws, …)`). It has no tool that sees.

Production logs on 2026-11-03 show live read calls of 1.4–2.7 s with two over 10 s. These are not measurements (rule 5); task 1 measures them.

## Decisions

### 1. Sight is an assist mode, not a new pipeline

`AssistMode` becomes `"assist" | "record" | "sight"`. In `sight`, the hub:
- uses `SIGHT_LIVE_PROMPT` instead of `LIVE_PROMPT`;
- turns live reads on with the camera, and the cue pipeline (Dilo, addressing) off;
- keeps writing the day record as text, as today, unless the guest switch (decision 6) is on.

Rejected: a separate `/sight` endpoint. It would duplicate frame pacing, the device link and the runtime.

### 2. The prompt and its parser are pure (`src/sight.ts`)

`src/sight.ts` exports:
- `SIGHT_LIVE_PROMPT`, `SIGHT_LOOK_PROMPT(question)`, `SIGHT_READ_PROMPT`;
- `parseSight(text)`: `=` or empty → `undefined` (say nothing); otherwise the text trimmed to `SIGHT_LIVE_MAX_CHARS = 300`, cut at a sentence end;
- `spokenChunks(text)`: sentences of at most 200 characters for the phone's voice;
- `movementGuard(question)`: true for questions about crossing, walking, stairs, cars, "is it safe", "puedo pasar". When true, the look prompt adds the rule to describe only and to say it cannot judge safety.

Prompt content (Spanish output, instructions in English like the others):
1. Text first, read verbatim. More than 300 characters: say how long it is and offer to read it.
2. What is held close to the camera. Banknotes: say the denomination in pesos when it is legible; say «no estoy seguro» when not.
3. People: how many and where, never names or guesses about identity, age or health.
4. The rest in a few words; positions relative to the wearer (izquierda, al frente, derecha, cerca, lejos).
5. Never tell the person to move, cross, step or stop. If asked, describe and say it cannot judge whether it is safe.
6. Nothing changed since the previous description: answer exactly `=`.

### 3. `look` in the voice agent

A new tool `look({ question: string, mode: "describe" | "read" })`:
- The backend asks the device for a fresh still (`P` to the clip, or the phone camera's `photo` request when the phone is the device). It uses the newest live frame instead if one arrived less than 1.5 s ago.
- It times out after `LOOK_TIMEOUT_MS = 8_000` with «No pude ver: la cámara no respondió».
- With no device: «No hay cámara conectada».
- It calls Muse Spark 1.3 (minimal effort, streamed) with `SIGHT_LOOK_PROMPT(question)` or `SIGHT_READ_PROMPT`, then returns `{ text }` to the loop. The agent speaks it.
- `read` returns up to 1,500 characters, and the agent reads it whole.

The agent's instructions gain one line: use `look` whenever the person asks about what is in front of them, in their hands, or asks to read something.

Rejected: sending the image to the agent's own Responses call. The tool loop runs at minimal effort with function calling and web search; one focused vision call with its own prompt is simpler to test, and its time shows separately in the trace.

### 4. The Ver screen on Android

`ui/Sight.kt`: one full-screen surface with a single focusable node for TalkBack, whose content description says what the gestures do. The state («Narrando», «En pausa», «Mirando…») sits in a polite live region. Gestures:
- tap → look (describe);
- long press → open «Hablar con Lente»;
- two-finger tap → pause or resume narration.

With TalkBack on, a single tap is a double tap. Use `Modifier.semantics { onClick(...); customActions = [...] }` so the three actions are also reachable from TalkBack's actions menu.

### 5. Speech and TalkBack

`Speech.say` checks `AccessibilityManager.isTouchExplorationEnabled`:
- On: send the text with `announceForAccessibility` (or a live-region update) and do not use `TextToSpeech`, so TalkBack's own voice and rate apply.
- Off: `TextToSpeech` as today, with the locale picked from the engine's available voices, `es-CO`, then `es-US`, then `es-ES`, and the rate from `Prefs.speechRate` (default 1.05, range 0.8–2.0).

The `/narrated` report to the hub (the echo guard) is sent in both cases.

### 6. A guest switch

Ajustes → «Sesión de invitado». While on:
- media storage is off (same path as «Guardar audio/fotos» off);
- live descriptions are not written to the day record or the memory index;
- the status line says «Invitado: no se guarda nada».

It turns off by hand or after 3 hours. This is what the INCI session runs with.

### 7. Measuring

`scripts/bench-sight.ts` opens `/events` on a hub the script does not start (local `pnpm pilot` with the clip connected), turns on Ver over the hub's control routes, and records for `--seconds` (default 120):
- live: frame received → description sent (the `stages` the hub already logs), the interval between spoken descriptions, and the share of `=` (silences);
- look: the same with `--looks N`, triggering a look every 10 s.

It prints p50/p90 and n, and writes raw events to `results/` (git-ignored).

`scripts/eval/sight-set.ts` is a guided run. It says out loud «Muestra: billete de 20.000», waits for Enter, takes a look, prints the answer, and asks the owner to score it `y/n`. The set:
- the six current Colombian banknotes (2.000, 5.000, 10.000, 20.000, 50.000, 100.000);
- a printed page of public text;
- a printed «SALIDA» sign;
- a cup, keys and a phone held up;
- one empty room.

The output is accuracy per kind and time p50, with no images saved.

## Risks

- **Latency.** Each live description is one vision call, about 1.5–2 s by the unmeasured logs. With the phone's voice on top, the spoken description trails the scene by 2–3 s. The bench decides what the video may say.
- **Low resolution and glare** on banknotes and paper. The eval says how often it is right; the video shows only kinds that scored well.
- **Two voices at once with TalkBack.** Decision 5.
- **Consent.** People at INCI are not the author. The session follows `docs/kb/inci-session.md`: written consent, media off, guest mode, no footage or transcripts in the repo.
