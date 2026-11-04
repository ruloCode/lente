# Design

## Context

- **Audio.** The clip streams 16 kHz PCM16 to the hub for meetings. The voice session (`/voice`) takes the clip's microphone while it is open (`clip.take` in `src/pilot.ts`) and uses the phone's microphone when no clip is connected.
- **Speech and vision.** The phone speaks through `platform/Speech.kt`, and in Ver through `/tts` voice `sight` (ElevenLabs, a neutral Colombian woman's voice). `look()` in `src/pilot.ts` takes a fresh frame and asks Muse Spark 1.3 a question about it.
- **Memory.** The day record (`src/day-log.ts`) feeds the memory index, so anything kept there can be asked about later.

Muse Voice Transcribe is a speech model; it does not output musical notes. Pitch must be computed ourselves.

## Decisions

### 1. Pitch runs on the phone, not the hub

The phone sits on the piano's music stand, close to the strings, and its microphone is free during practice. Running YIN on the phone gives:
- about 130 ms windows with no network hop, so a note shows as it is played;
- no audio sent anywhere for practice;
- no ASR cost.

The hub gets only the result of each attempt.

Rejected: pitch on the hub from the clip's audio. It needs a second consumer of the clip stream next to transcription and the voice session, adds the network hop to every note, and the clip's MEMS microphone is farther from the strings.

### 2. YIN, pure Kotlin, zero dependency

`core/Pitch.kt`:
- **Input:** a window of `PITCH_WINDOW = 2048` samples at 16 kHz (128 ms), hop `PITCH_HOP = 512` (32 ms).
- **YIN:** difference function, cumulative mean normalized difference, threshold `YIN_THRESHOLD = 0.12`, parabolic interpolation.
- **Range:** 65–2100 Hz (C2–C7).
- **Output:** `PitchFrame(hz, midi, cents, confidence, rms)`.
- **Silence:** below `MIN_RMS` the result is no pitch.

`core/NoteTracker.kt` turns frames into note events:
- **A note starts** when the same MIDI note holds for `STABLE_FRAMES = 3` frames (about 96 ms) with confidence ≥ 0.8.
- **Repeated notes** (Mi Mi) count as a new onset when RMS rises by `ONSET_RISE = 1.8×` over the previous frame's floor after a decay. A piano note decays, so a second strike shows as a jump.
- **Octave errors:** a jump of exactly ±12 for one or two frames is smoothed. The reported note is the stable one.
- **Event:** `NoteEvent(midi, name, octave, onsetMs, offsetMs?)`.

Names in Spanish solfège (Do, Re, Mi, Fa, Sol, La, Si), with the octave number available for the eval.

### 3. Lessons live on the hub

`src/practice.ts` holds `LESSONS`, served at `GET /practice/lessons` as JSON, so the teacher persona and the phone use the same list:

| id | Title | Notes (MIDI) |
|---|---|---|
| `escala-do` | Escala de Do | 60 62 64 65 67 69 71 72 |
| `estrellita` | Estrellita | 60 60 67 67 69 69 67 |
| `himno-alegria` | Himno de la alegría | 64 64 65 67 67 65 64 62 60 60 62 64 64 62 62 |

All are public domain (a scale; the traditional melody; Beethoven's Ninth, 1824).

Matching is octave-insensitive by default (pitch class): a beginner on a small keyboard may play an octave up.

### 4. Matching an attempt (Android `core/Lesson.kt`, pure)

The attempt is a sequence alignment of expected pitch classes against played note events: Needleman–Wunsch with match 0, substitution 1, insertion 1, deletion 1. Each expected note is one of:
- `right`;
- `wrong` (played another note), with the note played;
- `missed`.

Extra played notes are `extra`. The attempt ends when:
- the last expected note is matched;
- or 4 s pass without a new note;
- or the person taps «Terminar».

Summary: `right / total`, the first wrong position, and the time from the first note to the last.

### 5. Attempt → day record → coaching line (hub, P0)

`POST /practice/attempt` with JSON `{ lessonId, expected: number[], played: { midi, atMs }[], marks: ("right"|"wrong"|"missed")[], extra: number, durationMs }`. Validation:
- the lesson exists;
- the arrays are bounded (≤ 64 notes);
- the numbers are in range.

Contract details the hub settled (2026-11-04, lane L3; the phone follows them):
- `matched` is an optional fourth array, one per expected note: the played MIDI note the alignment paired with it, `null` when missed. With it, the summary names the wrong note («tocó Fa en vez de Sol»). Without it the hub walks `played` in order only when `extra` is 0; otherwise the summary says «falló la 4.ª (era Sol)».
- Bounds: `expected` 1–64 MIDI notes, `played` 0–64, MIDI 0–127 integers, `atMs` and `durationMs` 0–600,000 ms (10 min), `extra` 0–64, `marks` one per expected note. `expected` is not required to equal the lesson's notes (the phone's built-in fallback may lag the hub).
- A rejected attempt answers 400 `{ error }` and keeps nothing. A coach that fails answers 200 with `line: ""` (the attempt is still kept); the phone then shows the summary.

The hub then:
1. Writes a `practice` day entry with a one-line Spanish summary from `practiceSummary()` (pure), e.g. «Piano · Himno de la alegría: 13 de 15 notas bien; falló la 4.ª (tocó Fa en vez de Sol); 21 s». Guest mode: not written, like every other entry.
2. Calls Muse Spark 1.3, minimal effort, streamed, with `COACH_PROMPT` and the summary, plus the last 3 attempts at the same lesson today (from the day record) so it can say «mejoraste». Max 200 tokens; one or two sentences in Spanish, warm and specific, naming the note in solfège; never a medical or physical-pain claim.
3. Returns `{ line, summary }`, and broadcasts a `practice` event.

The phone speaks `line` with `/tts` voice `sight` (fallback: the phone's voice).

### 6. The piano persona (P1)

The voice session accepts `{"type":"start","persona":"piano","intro":true|false}`. `pianoInstructions(ctx)` describes a warm, patient Colombian piano teacher who:
- speaks one to three sentences;
- proposes the next lesson;
- encourages without lying about mistakes.

Tools (`PIANO_FUNCTIONS`):

| Tool | What it does |
|---|---|
| `start_lesson({ lesson })` | Sends `{"type":"lesson","id"}` to the phone, which opens it |
| `last_attempt()` | The latest attempt's summary from today's day record |
| `ask_memory` | Earlier practice («¿cómo me fue ayer?») |
| `look_hands({ question })` (P2) | `look()` with `PIANO_LOOK_PROMPT` (hand shape, which fingers, wrist height; never a medical claim) |

While an attempt runs, the phone sends `pause` on the voice session and `resume` after the coaching line, so the piano is never transcribed as speech.

### 7. Measuring

`scripts/bench-practice.ts` reads `adb logcat -s LentePractice` for `--seconds` while the owner plays. The app logs, numbers only:
- `[practice] onset→shown N ms` per note;
- `[practice] attempt lesson=… right=R total=T`;
- `[practice] coach N ms`.

The bench prints per lesson: accuracy (from a known reference played correctly three times), onset→shown p50/p90, and coach p50. JVM tests cover pitch on synthetic tones:
- sine and three-harmonic tones at C3, A4 and C6;
- a decaying note;
- repeated notes with a gap;
- an octave-glitch frame.

## Risks

- **Room noise and other instruments.** The demo plays alone in a quiet room. The eval says what the video may claim.
- **Two microphones on the phone.** If no clip is connected, the voice session also uses the phone's microphone. The phone pauses the voice session's capture during an attempt, and the pitch listener releases the microphone after.
- **Time.** P0 is a day's work split across two lanes. P1 and P2 ship only if P0 is green on the real piano by 16:00 Bogotá.
