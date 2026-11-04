# Proposal

Depends on: `add-voice-mode`, `add-sight-mode` (`look`, `/tts` voices, personas), `add-android-app`. «Tradúceme» also waits for `add-consent` (it shows what other people say).
Works with: `add-lens-apps`. The coach is written as the manifest `apps/builtin/idiomas.json` from day one and runs as a built-in (`engine: "coach"`) without the catalog. When `add-lens-apps` lands it becomes the catalog's fourth listing. Either can ship first.

## Why

Lente exists for people who work in their second language. Today it helps them get through the moment: one line to say, with what it means. It does not help them need it less.

The same clip can teach. It hears what the wearer says and what is said to them, it sees what is in front of them, and it remembers their day. A Spanish speaker who wants Portuguese or French can learn on the glasses while they live their day:
- ask how to say something and hear it;
- look at a thing and hear its name;
- have what someone says to them translated;
- get one gentle correction when they try.

Lente knows their level because it measured it in a short spoken conversation, and it remembers every word they met, so a two-minute review at night uses their own day.

This is not a chat window that explains grammar: the hackathon lists «simple AI for Education chatbots» as an anti-project (`docs/kb/hackathon.md`). The coach lives on the glasses, in real time: speech in, speech and the camera out, memory underneath.

## What Changes

- **Target languages: Portuguese (Brazil) and French (France) first**, each only once `docs/kb/meta-api.md` documents Muse Voice Transcribe and Muse Spark support for it. Today it documents «25 validated» ASR languages and names only English and Spanish, and lists no languages for Spark. Meta's API has no text-to-speech (`docs/kb/decisions.md`, 2026-10-28), so speech out is the hub's ElevenLabs voice or the phone's own voice, each checked per language. The wearer's base language is Spanish (`language-profile`).
- **«¿Qué nivel tengo?»: a spoken placement.** A 3–5 minute conversation with a tutor persona in the voice session, from easy questions to harder ones. It ends with:
  - an estimated CEFR band (A1–C1);
  - what the estimate is based on: vocabulary range and grammar accuracy, with quotes from what the wearer said, and fluency (words per minute and the time to start answering, from the transcript's timing);
  - a three-step plan.

  It always says it is an estimate, not an exam («No es un examen oficial»). A new placement is offered once a week.
- **Live on the glasses, each mode opt-in:**
  - **«Dime cómo se dice»:** the wearer asks in Spanish and hears the answer in the target language at their level, spoken in a native voice, slowly the second time, then «repítelo»; Lente says whether the transcription understood them.
  - **«Nombra lo que veo»:** a look names up to three things in front of the wearer, with their article, in the target language (`look` with a coach prompt).
  - **«Tradúceme»:** when someone speaks to the wearer in the target language, the Spanish meaning shows on the phone and can be spoken in the earbud: Dilo in reverse, on the meeting pipeline. It follows `add-consent`'s room rules.
  - **«Corrígeme»:** when the wearer speaks the target language, at most one gentle correction a minute, on the screen with a buzz, never spoken over them.
  - **A Dilo card at their level:** when they are asked something in the target language, the line to say uses words at their band, with its Spanish meaning as today.
- **Memory and practice.**
  - Words and phrases met during the day (asked, looked at, translated, corrected) are kept as text in the day record: a new `language` entry kind, like `practice`.
  - «Repasemos» in the voice session runs a short spaced-repetition review of the words that are due.
  - «¿Cómo voy con el portugués?» is answered from the memory: the band and its date, words met this week, reviews done.
- **Measured** (rule 5): benches for time to translation on screen, look → word spoken, placement agreement across two runs, and correction precision. No number goes into the docs or the video before its bench has run.

## Priority (cut lines)

- **P0:** the language checks; the tutor persona with «Dime cómo se dice» (pronunciation spoken) and «Nombra lo que veo»; the placement with its estimate; `language` entries in the memory and «¿cómo voy?». Portuguese first; French follows on the same code once its checks pass.
- **P1:** «Tradúceme» (after `add-consent`), «Corrígeme», the Dilo card at the wearer's level.
- **P2:** «Repasemos» (spaced repetition), the weekly re-placement, a progress card on the phone.

## A demo slice for today (optional)

The smallest piece that could be built and shown before the 18:00 freeze, using only what exists:
- `persona: "coach"` with `lang: "pt"` in the voice session: a Colombian tutor who explains in Spanish and practices in simple Portuguese, with the transcription biased to Portuguese and Spanish;
- `look` with the coach's prompt: «¿Qué es esto?» → «Isso é um garfo. *O garfo.*», spoken;
- a level estimate at the end of the conversation, said as an estimate;
- a «Idiomas · Portugués» choice on Android that opens it.

It is tasks 1.1–1.2 and 2.1–2.4 in `tasks.md`, each marked «Demo slice» (a label, not one of the auto lane's tags).

- **Reuses:** the voice session and its tool loop, `look`, the `/tts` hub voice with the phone's voice as fallback, the Ver screen's pattern for opening a persona from the record sheet, and the stub for tests.
- **Effort, estimated (not measured):** about 2.5 h of hub work, 1–1.5 h on Android and 1 h of checks on the phone with the clip, so 4.5–5 h. The cut that fits a shorter window: the persona and look in Portuguese without the level estimate, about 3 h.
- **The video may show it only if** the task 1.1 check passes (Portuguese is transcribed and spoken acceptably) and the slice is built, checked and logged in the README.

The orchestrator and owner decide whether to build it.

## Placement in the build order

Phase 3, product. P0 needs no one but the wearer: the voice session hears the person talking to Lente, as voice mode does today. «Tradúceme», and «Corrígeme» in a meeting, run on the meeting pipeline that hears other people, so they come after `add-consent`.

## Not in this change

- Certification-grade testing or any official CEFR claim. The band is Lente's estimate.
- Pronunciation scoring. The transcription returns text, not phonemes, so Lente can say only whether it understood the word.
- Languages beyond Portuguese and French, or either of them before its checks pass.
- Storing audio of the wearer or anyone else. Words and results are text.
- Grammar lessons, courses, streaks or gamification.

## Capabilities

### New Capabilities

- `language-coach`: learning a target language on the glasses: the placement and level estimate, the live modes (how to say it, name what I see, translate for me, correct me, the Dilo card at my level), the words kept as text, review and progress.

### Modified Capabilities

<!-- none: reply-cues, scene-vision and voice-narration keep their requirements; the coach adds its own on top while it is on -->

## Impact

- **Meta models:**
  - Muse Voice Transcribe: `ENDPOINTING` for the tutor, `DIARIZATION` for «Tradúceme» and «Corrígeme» in meetings, with `languageBias` naming the target language.
  - Muse Spark 1.3: the tutor's tool loop; the coach's look; the placement estimate as structured output; translations and corrections at minimal effort.
  - Muse Spark Open on Baseten as an A/B for «Tradúceme» latency in the bench.
- **Hub:**
  - new pure modules: `src/coach.ts` (persona instructions, prompts, `likelyLanguage`, the correction pacer) and `src/placement.ts` (timing measures, the estimate's schema and evidence check);
  - `src/srs.ts` (P2, the review schedule as a fold over entries);
  - `coach` persona and tools in `src/voice-agent.ts`, `src/voice-tools.ts`, `src/voice-hub.ts`;
  - the language bias per session in `src/asr-session.ts`;
  - «Tradúceme» and «Corrígeme» in `src/pilot.ts`;
  - `DayEntry` kind `language` in `src/day-log.ts`, and unit kind `language` in `src/memory-index.ts`;
  - `/tts` voices per language.
- **Android:** the «Idiomas» choice in the record sheet, speech by language in `platform/Speech.kt`, the translation and correction cards.
- **Scripts:** `scripts/bench-coach.ts`, `scripts/eval/coach-set.ts` (synthetic learner transcripts and sentences, written fresh).
- **Docs:** `docs/kb/meta-api.md` (the language checks), `docs/benchmarks.md`, `docs/kb/decisions.md`, `README.md`.
- **Privacy:** no audio is kept. The day record gains short text items (a word, its meaning, the sentence it came from). «Tradúceme» shows text derived from other people's speech, so it follows `add-consent`'s room notice and never runs in a guest session's memory.
