# Tasks

Depends on: `add-sight-mode`, `add-voice-mode`, `add-android-app`

Schedule (Bogotá, 2026-11-04; the closing plan is `openspec/changes/ship-hackathon/`): P0 (groups 1–4) by **15:00**, the real-piano check (group 5) by **16:00**, P1/P2 (group 6) only if group 5 is green, code freeze **18:00**. Lane names refer to `docs/handoff-closing.md`.

## 1. Hub: lessons and attempts (lane B)

- [x] 1.1 `src/practice.ts` (pure): `LESSONS` (design decision 3), `validateAttempt`, `practiceSummary` (Spanish one-liner with solfège names, design decision 5), `COACH_PROMPT`; unit tests: the three lessons' notes, validation (unknown lesson, > 64 notes, out-of-range numbers), the summary for a perfect attempt, one wrong note, a missed note (`pnpm test`)
  - 2026-11-04: `src/practice.ts` with 13 tests in `test/practice.test.ts`: the lessons, solfège names (sharps spelled «sostenido»), 16 malformed or out-of-range bodies refused, the summary for perfect / wrong / missed / extra notes, today's earlier attempts, the coach's messages. The contract's optional `matched` array and the bounds are written into design decision 5.
- [x] 1.2 `practice` kind in `DayEntry` (`src/day-log.ts`) and in the memory index's text extraction, so a summary is searchable; test that a practice line is found by a recall query (`pnpm test`)
  - 2026-11-04: `DayEntry` kind `practice` (`lessonId`, `text`, `right`, `total`). The memory reads it on all three paths: index units of kind `practice` (`d<day>:<n>`, numbered with the camera's moments; appended to the snapshot's kinds so older snapshots still read), the deep ask (`P<n>` lines) and the tiered ask; chips say «Practicaste · hh:mm». `test/practice-memory.test.ts` (5): reload from disk, the units, «¿Cómo me fue ayer en el piano?» retrieves both of yesterday's attempts, a snapshot round trip, the deep ask's lines. 763 tests, smoke green.
- [x] 1.3 Routes in `src/pilot.ts`: `GET /practice/lessons`, `POST /practice/attempt` (validate → day entry unless guest → one streamed Spark call with today's last 3 summaries of that lesson → `{ line, summary }`, a `practice` broadcast); stub answer in `scripts/stub-meta.ts` for `COACH_PROMPT`; hub test on the stub: lessons listed, a valid attempt kept and coached, an unknown lesson 400 and nothing kept, a guest attempt coached and not kept (`pnpm test`, `pnpm smoke`)
  - 2026-11-04: `practiceRoute` in `src/pilot.ts`, its own block before `handle` and one line at its top. `GET /practice/lessons` → `{ lessons: [{ id, title, notes }] }`; `POST /practice/attempt` → 400 `{ error }` (keeps nothing, calls no model) or 200 `{ line, summary }` and a `{ kind: "practice", at, lessonId, text, right, total, line }` event. A guest's coach gets no earlier attempts. `test/practice-hub.test.ts` on the stub (`STUB_COACH`, `STUB_COACH_BETTER` when the request carries an earlier attempt): lessons listed, an attempt kept and coached, the second sees the first, an unknown lesson / 65 notes / a non-JSON body refused with no model call, a guest coached and not kept. 764 tests, smoke 14.4 s.

## 2. Android: hearing notes (lane C)

- [x] 2.1 `core/Pitch.kt` (YIN, design decision 2) with JVM tests on synthetic tones: sine and 3-harmonic C3/A4/C6 within ±20 cents, silence → no pitch, white noise → no confident pitch (`pnpm android:test`)
  - 2026-11-04: `PitchTest` (8 tests, `pnpm android:test`): sine and 3-harmonic C3/A4/C6 and the range ends C2/C7 within ±20 cents at confidence ≥ 0.8, A4 = 440 ± 1 Hz, a +30-cent tone reads +30 ± 5, silence and a tone under `MIN_RMS` give no pitch, white noise (5 seeds) no confident pitch. `rms` is the newest 32 ms hop, not the whole window, so a damper drop shows at once (found by the 2.2 damper test).
- [x] 2.2 `core/NoteTracker.kt` with JVM tests: a decaying note → one event; repeated note with decay → two events; a one-frame octave glitch → no extra event; solfège names (`pnpm android:test`)
  - 2026-11-04: `NoteTrackerTest` (11 tests): a decaying note → one event with an offset; Mi Mi with the first still ringing, cut by the damper, and after a gap → two events each, second onset within 160 ms of the strike; a held note → one; the scale from struck tones → its 8 notes; one- and two-frame octave glitches → no extra event, a real octave jump → a new note at its first frame; noise, silence, unconfident frames → none; solfège names, «Fa sostenido» for TalkBack, octave 4 for middle C.
- [x] 2.3 `core/Lesson.kt`: the alignment and marks (design decision 4) with JVM tests: perfect scale, Fa→Sol substitution, a missed note, an extra note, octave-up playing counts right (`pnpm android:test`)
  - 2026-11-04: `LessonTest` (12 tests): the three built-in lessons; perfect scale; Fa→Sol is the 4th wrong with Sol played, 7 right; a missed note; an extra note; an octave up counts right; Estrellita with a repeated note missing; the open (live) alignment leaves unreached notes out; an attempt ends on the last note or after 4 quiet s; the `POST /practice/attempt` body; lessons parsed from the hub's JSON.
- [x] 2.4 `platform/PitchListener.kt`: `AudioRecord` at 16 kHz mono (`MediaRecorder.AudioSource.MIC`), a background thread feeding the tracker, released when the Practice screen closes; logcat tag `LentePractice` with numbers only (design decision 7)
  - 2026-11-04: `platform/PitchListener.kt` reads 512-sample hops from `AudioSource.MIC` into a sliding 2048 window on `lente-practice-mic`, a session counter keeps a stopped thread out of the next attempt, and `stop()` releases the `AudioRecord` (called when an attempt ends and when the Practice screen leaves). `PracticeLog` writes the three lines L3's bench parses under `LentePractice`, numbers and the lesson id only. Compiles in `pnpm android:apk`; heard on the Samsung in 3.3.

## 3. Android: the Practice screen (lane C)

- [ ] 3.1 «Practicar» in the recording options; `ui/Practice.kt`: lessons from `GET /practice/lessons` (with the three built in as a fallback when the hub is unreachable), the notes large in solfège with the next one highlighted, the live heard note, a check or cross per note, «Otra vez», «Siguiente lección», «Terminar»; TalkBack descriptions on every control
- [ ] 3.2 End of attempt → `POST /practice/attempt` → speak `line` through `/tts` voice `sight` (fallback the phone's voice) and show it; the screen shows «Lente está escuchando» only while an attempt runs
- [ ] 3.3 `pnpm android:test` and `pnpm android:apk` pass; APK installed on the owner's Samsung [phone]

## 4. Together (lanes B + C)

- [ ] 4.1 Deploy the hub with groups 1 (owner, `pnpm deploy:hub` from a clean `main`) and check on the phone against Modal: lessons load, one attempt is coached aloud [phone] [human]

## 5. On the real piano (owner)

- [x] 5.1 `scripts/bench-practice.ts` (design decision 7) with a unit test for its line parsing and percentiles (`pnpm test`)
  - 2026-11-04: `node scripts/bench-practice.ts --seconds 600 --serial RFGYB098QCN --reference 3` follows `adb logcat -s LentePractice -T <now>` (checked on the Samsung: the epoch form is accepted) or `--stdin`; a note's onset belongs to the next `attempt` line, a `coach` line to the one before; accuracy is over each lesson's first `--reference` attempts; prints the Markdown table for `docs/benchmarks.md` and keeps the parsed lines in `results/practice-<date>/`. `test/bench-practice.test.ts` (3): parsing (both arrows, the hub's own coach line, junk dropped), attribution and nearest-rank percentiles, the table.
- [ ] 5.2 Play the scale three times correctly, then once with a deliberate wrong note; run the bench; record accuracy, onset → shown p50/p90 and coach p50 in `docs/benchmarks.md` under «Practice (add-practice-mode)». Anything under 7 of 8 on the clean scale is not claimed in the video [hw] [human] [phone]

## 6. P1 and P2 (only if 5.2 is green by 16:00)

- [ ] 6.1 `persona: "piano"` in `parsePhoneMessage`, `pianoInstructions`, `PIANO_FUNCTIONS` (`start_lesson`, `last_attempt`, `ask_memory`), the `lesson` event; tests in `test/voice-*.test.ts` and a hub test on the stub: «ponme una lección» sends `lesson` (`pnpm test`)
- [ ] 6.2 Android: the Practice screen opens a voice session with `persona: "piano"`; `lesson` events open the lesson; `pause` during an attempt, `resume` after the coaching line; checked on the phone [phone]
- [ ] 6.3 P2: `look_hands` with `PIANO_LOOK_PROMPT` (no medical claims); a real call on a synthetic image of a keyboard (generated, no person) recorded in `docs/benchmarks.md` [key:MODEL_API_KEY]

## 7. Docs

- [ ] 7.1 `docs/kb/decisions.md`: «Pitch runs on the phone» and «Lessons are public domain»
- [ ] 7.2 README: «Practicar» under What runs today, its measured numbers (only from 5.2), the row for 2026-11-04
