# Proposal

Depends on: `add-sight-mode` (the companion persona, `/tts` voices, `look`), `add-voice-mode`, `add-android-app`

## Why

Lente already hears and sees what its wearer does, remembers it, and talks back. A meeting is one room where that helps. Practicing an instrument at home is another, and it shows the same device in a new light for the demo: a clip on your glasses and your phone on the piano become a patient teacher that listens to every note, sees your hands, and remembers how you did yesterday.

This is not a chatbot that explains music theory. The phone hears which note you actually played, in real time, without sending audio anywhere. Muse Spark 1.3 turns your attempt into spoken coaching, looks at your hands through the clip when you ask, and keeps your practice in Lente's memory, so «¿cómo voy con el piano?» has a real answer.

## What Changes

- **«Practicar» on the phone.** A fourth choice in the recording options, beside Asistir, Solo grabar and Ver. It opens the Practice screen:
  - the lesson's notes as large note names (Do Re Mi…), the next one highlighted;
  - the note the phone hears right now, live;
  - a check or a cross per note as you play;
  - «Otra vez» and «Siguiente lección».
- **Pitch on the phone.** A pure Kotlin pitch tracker (YIN) on the phone's microphone at 16 kHz turns sound into notes: name, octave and cents, with an onset when a key is struck, including repeated notes. Audio never leaves the phone for this, and no transcription is billed.
- **Lessons.** Three short public-domain lessons, served by the hub at `GET /practice/lessons`:
  - the C major scale up;
  - «Estrellita» (first phrase);
  - «Himno de la alegría» (first phrase).
- **The attempt and the coach.** When a lesson ends, the phone posts the attempt (expected notes, played notes with their times, the matching per note) to `POST /practice/attempt`. The hub:
  - keeps it in the day record as one text line (a `practice` entry, so the memory can answer about it);
  - asks Muse Spark 1.3 for one or two warm, specific sentences of coaching («Muy bien. Te saltaste el Fa en la cuarta nota; tócala otra vez más despacio.»);
  - returns the line, which the phone speaks in the companion's Colombian voice (`/tts` voice `sight`).
- **Talk to the teacher (P1).** In the voice session, `persona: "piano"`: a warm teacher with tools.
  - `start_lesson` opens a lesson on the phone.
  - `last_attempt` reads the latest result.
  - `look_hands` uses the clip's camera to comment on hand position.
  - `ask_memory` answers «¿cómo me fue ayer?».

  While the person plays, the voice session is paused, so the piano is not taken for speech.
- **Measured.** A pitch test set in unit tests (synthetic tones with harmonics). A bench on the real piano (`scripts/bench-practice.ts`, reading the app's logcat timing lines) reports:
  - note accuracy per lesson;
  - onset → note shown latency;
  - attempt → coaching line latency.

## Priority (cut lines for 2026-11-04)

- **P0:** pitch tracker, lessons, Practice screen, attempt + coaching line spoken. This alone is the demo.
- **P1:** the piano persona in the voice session (`start_lesson`, `last_attempt`, `ask_memory`).
- **P2:** `look_hands` through the clip.

## Not in this change

- Sheet music reading, chords, rhythm scoring beyond note order, or any instrument other than piano/keyboard.
- Sending practice audio to any server.
- Copyrighted songs: only public-domain melodies.

## Impact

- Hub: `src/practice.ts` (pure: lessons, attempt summary text, coaching prompt), routes in `src/pilot.ts`, `piano` persona and tools in `src/voice-agent.ts` / `src/voice-tools.ts` / `src/voice-hub.ts`, `DayEntry` kind `practice` in `src/day-log.ts`.
- Android: `core/Pitch.kt`, `core/NoteTracker.kt`, `core/Lesson.kt` (pure, JVM-tested), `platform/PitchListener.kt` (AudioRecord), `ui/Practice.kt`, the record options.
- `scripts/bench-practice.ts`, `docs/benchmarks.md`, `docs/kb/decisions.md`, `README.md`.
