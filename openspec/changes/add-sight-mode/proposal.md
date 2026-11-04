# Proposal

Depends on: `add-voice-mode`, `add-android-app` (both built, waiting on one check each)

## Why

Lente already sees what the wearer sees: the clip sends a frame, Muse Spark 1.3 describes it, and the phone can read the description aloud («Narrar»). That is built for someone in a meeting who wants the slide read. A person who is blind or has low vision needs the same eyes, with three differences:

- **The order of what matters.** Text to read first and in full, then what is in their hands, then people and where they are. A meeting-oriented sentence under 120 characters cuts a letter in half.
- **Hands-free questions.** They can't tap «Mirar» on a screen they can't see. They need to ask out loud: «¿qué tengo en la mano?», «léeme este papel», «¿cuánto es este billete?».
- **An app they can use with TalkBack.** Every control must have a name, and the app's own voice must not talk over the screen reader.

For the hackathon, this lets the demo show a second group of people the same device serves, recorded with consent at the Instituto Nacional para Ciegos (INCI) in Bogotá. Everything it shows must be built and measured before it is filmed.

## What Changes

- **«Ver» on the phone.** A third choice in the recording options, beside Asistir and Solo grabar. It turns on the camera's live reads with a sight prompt, turns on «Narrar», and opens a screen that is one large target:
  - one tap: «¿Qué hay frente a mí?» (a fresh look);
  - a long press: talk to Lente;
  - two-finger tap: stop or resume narration.
- **A sight prompt for live reads.** In Spanish, in this order: any text, read whole (up to 300 characters, or "hay un texto largo, pídeme que lo lea"); what is held up close; people (how many, where, never who they are); the rest of the scene in a few words; positions as «a tu izquierda», «al frente», «a tu derecha». When the view has not changed, the model answers `=` and nothing is spoken.
- **A `look` tool for the voice agent.** «Hablar con Lente» can look through the clip (or the phone's camera when no clip is connected): it takes a fresh frame, asks Muse Spark 1.3 the wearer's own question about it, and answers out loud. A `read` mode returns all the text in the frame, spoken a sentence at a time.
- **It describes; it never guides movement.** Asked «¿puedo cruzar?» or «¿hay alguien detrás?», Lente says what it sees and that it cannot tell whether moving is safe. This is in the prompt, in a test, and in the README.
- **TalkBack.** Every control in Ver and in the voice screen has a content description. When TalkBack is on, descriptions are announced through the accessibility service instead of the app's own text-to-speech, so the two never speak at once. The Spanish voice prefers `es-CO`, then `es-US`, then `es-ES`, and the speech rate is a setting (0.8× to 2.0×).
- **Measured.** A bench times live reads and looks on the real clip (frame → spoken text, interval between descriptions), and a small sight eval scores the answers on a fixed set of objects (the six Colombian banknotes, a printed page, a sign, objects in hand).

## Not in this change

- Navigation, obstacle warnings or any instruction to move.
- Face recognition or naming people.
- Reading medicine labels for dosage, or any medical advice (a hackathon anti-project and a real risk).
- Storing audio or photos of anyone at INCI: the session runs with «Guardar audio» and «Guardar fotos» off.

## Impact

- `src/pilot.ts` (live prompt by mode, `look` backend), `src/voice-agent.ts`, `src/voice-tools.ts`, `src/profile.ts` (`assistMode: "sight"`), a new pure `src/sight.ts` (prompt, `=` handling, text splitting, the movement guard).
- Android: `ui/` (Ver screen, record options), `platform/Speech.kt` (TalkBack routing, locale, rate), `platform/Prefs.kt`.
- `scripts/bench-sight.ts`, `scripts/eval/sight-set.ts`; `docs/benchmarks.md`, `docs/kb/decisions.md`, `README.md`.
