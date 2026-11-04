# Design

## Context

- **What the models are documented to do** (`docs/kb/meta-api.md`, verified 2026-10-26 to 11-02):
  - Muse Voice Transcribe: «25 validated» languages, «including English and Spanish». Portuguese and French are not named. `languageBias` takes English names («Spanish») and is a hint.
  - The realtime events carry `audioProcessedMs` per `speechStart` and `transcript`. Batch turns carry `startMs`/`endMs`. No word-level timings are documented.
  - Muse Spark 1.3: function calling, structured output (`json_schema`, enums honored, free text to validate server-side), image input. No list of supported languages is documented.
  - There is no text-to-speech in Meta's API (`docs/kb/decisions.md`, 2026-10-28). The hub's `/tts` uses ElevenLabs `eleven_flash_v2_5` with two voices, the default and `sight` (`src/pilot.ts` `speak`), and the phone falls back to its own voice, which picks Spanish or English by the text (`voice-narration`).
- **What exists to build on**:
  - the voice session with personas (`start { persona }` in `src/voice-session.ts`, instructions and functions per persona in `src/voice-hub.ts`);
  - `look` with its own prompt, the 6 s stale rule and Ver's rules on people (`src/sight.ts`);
  - the reply cue with its Spanish meaning in one call (`src/briefing.ts`);
  - `DayEntry` kinds indexed by the memory (`practice` is the latest, `src/day-log.ts`, `src/memory-index.ts`);
  - the wearer identified by voice in meetings (`src/self-voice.ts`, `src/wearer.ts`);
  - the glossary in `language-profile`, which already explains English terms in Spanish.
- **Test speech:** the Mac has Brazilian Portuguese and French system voices (`say -v Luciana`, pt_BR; `say -v Jacques`, fr_FR; listed by `say -v '?'` on 2026-11-04), so benches can speak synthetic phrases, as `bench-voice.ts` does with `say -v Paulina`.

## Goals / Non-Goals

**Goals:**
- Every language claim backed by a documented model capability and a real call.
- Every live mode is one existing path (voice session, look, meeting pipeline, reply cue) with a coach prompt, not a new pipeline.
- The level estimate is reproducible enough to be useful, and says how sure it is.

**Non-Goals:**
- Teaching from a curriculum. The day is the curriculum.
- Grading pronunciation.
- Any language pair other than Spanish → Portuguese or French.

## Decisions

### 1. Portuguese (Brazil) and French (France), each behind a check

`COACH_LANGUAGES` in `src/coach.ts`: `pt` (`pt-BR`, ASR name «Portuguese») and `fr` (`fr-FR`, «French»). Each is enabled only once task 1.1 records in `docs/kb/meta-api.md`:
- that dev.meta.ai lists the language for Muse Voice Transcribe, and the exact `languageBias` name it accepts («to check at dev.meta.ai»);
- a real `ENDPOINTING` session on synthetic speech (`say -v Luciana`, `say -v Jacques`) that transcribes it, with the words right out of ten phrases;
- whether dev.meta.ai documents languages for Muse Spark 1.3, and a real call that answers in the language at a requested level;
- the ElevenLabs model's support for the language, from ElevenLabs' docs, and one `/tts` call heard on the phone;
- whether the owner's Samsung has a `pt-BR` and a `fr-FR` text-to-speech voice.

A language that fails a check stays «Pronto» in the app, as the companion app marks planned features.

Brazilian Portuguese first: most of Latin America's Portuguese speakers and most of the work the wearer meets are Brazilian.

Rejected: European Portuguese first. Rejected: listing the language and hoping, because `languageBias` is only a hint and an unsupported language would fail silently.

### 2. Speech in the target language

- `/tts` gains voices `coach-pt` and `coach-fr` (`ELEVENLABS_COACH_PT_VOICE_ID`, `ELEVENLABS_COACH_FR_VOICE_ID`). Unset, they use the same multilingual model with the default voice, if task 1.1 shows it speaks the language.
- The phone's fallback picks the engine's `pt-BR` or `fr-FR` voice. When neither exists, the text is shown and Lente says in Spanish «No tengo voz en portugués en este teléfono».
- In a coach session each reply sentence is tagged with its language by `likelyLanguage(sentence)` (pure): counts of short function words written fresh for es, pt, fr and en, about thirty per language, with ties going to Spanish. The `reply` event gains `lang`, and the phone speaks each sentence in its voice.
- «Más despacio» repeats the last target-language sentence at the phone's rate 0.8× (the slowest `Prefs.speechRate` allows), or with the hub voice's speed setting if ElevenLabs documents one (to check).

Rejected: asking the model to mark languages with tags. It costs output tokens, and a missed tag reads Portuguese in a Spanish voice; the word counts are testable.

### 3. The tutor is a voice-session persona

`start { persona: "coach", lang: "pt", mode: "tutor" | "placement" | "review" }`:
- **The transcription bias** for the session becomes `[<target>, "Spanish"]`. The phone sends `start` before the first audio, and if the ASR session is already open the hub restarts it, which `AsrSession` already does after an idle close.
- **`coachInstructions(ctx)`:** a warm Colombian tutor who:
  - explains in Spanish and practices in the target language;
  - keeps to the wearer's band (A1 if none);
  - says one to three short sentences;
  - never lectures on grammar unless asked;
  - follows Lente's rules on movement, faces and medical advice.

Tools (`COACH_FUNCTIONS`):

| Tool | What it does | Priority |
|---|---|---|
| `pronounce({ text, meaning })` | Sends a `pronounce` event (big text, the target voice, «Más despacio», «Repetir»), keeps a `language` item | P0 |
| `look({ question })` | The existing look with `coachLookPrompt(lang, band)` | P0 |
| `check_repeat({ expected })` | Compares the wearer's last turn with the expected phrase: key words present after normalizing case, accents and articles. Returns `understood` or `missed` | P0 |
| `finish_placement()` | Ends the placement and runs the estimate (decision 4) | P0 |
| `language_progress({ lang })` | The band and its date, items this week, reviews (decision 9) | P0 |
| `ask_memory` | As everywhere | P0 |
| `review_due({ lang })`, `review_result({ term, right })` | Decision 8 | P2 |

`language_progress` is also added to the default voice's functions, so «¿cómo voy con el portugués?» works without opening the tutor.

**The wire, as built on 2026-11-04 (the demo slice).** These fields add to the contract above and change none of it.
- **The phone sends** `{ "type": "start", "persona": "coach", "lang": "pt", "mode": "tutor" }` first. A `lang` that has not passed task 1.1 (today: anything but `pt`), or a missing one, opens the default Lente, and the hub logs why. `mode` defaults to `tutor`. With `intro: true` the tutor speaks first, as Ver's welcome does.
- **`reply` in a coach session** is `{ type: "reply", turn, text, commentary, lang }`.
  - `lang` is `"es" | "pt" | "fr" | "en"`: the target when `likelyLanguage` says so, else `"es"` («unsure» counts as Spanish).
  - Every sentence is in one language. The tutor is told never to mix them in one sentence.
  - The default and `sight` personas send no `lang`, as before.
- **`pronounce`** is `{ type: "pronounce", turn, text, meaning, lang }`, for example `{ text: "o garfo", meaning: "el tenedor", lang: "pt" }`.
  - It is the card: the phrase large, the meaning, and «Más despacio» and «Repetir».
  - The phone does **not** speak it when it arrives. The hub sends the phrase as a `reply` sentence with the same `lang` right after, and that sentence is what is spoken and counted in `spoken`.
  - «Repetir» says `text` again in the `lang` voice, and «Más despacio» says it at 0.8×.
  - A coach look sends one `pronounce` per name, each followed by its sentence (for the first name in Portuguese, «Isso é um garfo. O garfo.»).
- **`/tts`** takes `{ text, voice: "coach-pt" }` for a sentence whose `lang` is `pt`: Keren, a Brazilian voice (`ELEVENLABS_COACH_PT_VOICE_ID` overrides it), with `language_code: "pt"`. A Spanish sentence in a coach session uses the voice the phone already uses for the voice session. `coach-fr` waits for French's check.
- **`check_repeat`** needs no event. The tutor says whether it understood. A repeat of the phrase just pronounced is not dropped as Lente's own echo once the phone has finished speaking it (`REPEAT_ECHO_TAIL_MS`).

### 4. Placement and the estimate (`src/placement.ts`, pure)

**The conversation.** `mode: "placement"`. The tutor:
- opens in Spanish: three to five minutes, «di "para" cuando quieras», «es un estimado, no un examen»;
- then asks in the target language, climbing one rung at a time while the answers hold up: name and where from; a typical day; something that happened; an opinion with reasons; a hypothetical.

The hub keeps the clock:
- at `PLACEMENT_MIN_MS = 180_000` the tutor may close;
- at `PLACEMENT_MAX_MS = 300_000` the hub tells it to close;
- with fewer than `PLACEMENT_MIN_WORDS = 60` words from the wearer, no band is given.

These are policy constants. Their fit is checked by the agreement bench (decision 11).

**Timing, measured not judged** (`fluency(turns, prompts)`):
- words per minute over the wearer's turns, using each turn's audio span. The voice session's `onTurn` gains `audioStartMs`/`audioEndMs`, as meeting turns already carry;
- the median time to start answering: from the phone's `narrated` report for the tutor's last sentence to the wearer's `speechStart`;
- words per turn.

Pauses inside a turn need word timings, which are not documented («to check at dev.meta.ai»; task 1.1). Until then they are left out, not guessed.

**The estimate.** One Muse Spark 1.3 call, minimal effort, with structured output:

```json
{ "band": "A1|A2|B1|B2|C1",
  "confidence": "low|medium|high",
  "vocabulary": { "note": "…", "quotes": ["…"] },
  "grammar": { "note": "…", "quotes": ["…"], "patterns": ["…"] },
  "plan": ["…", "…", "…"] }
```

The input is the tutor's questions, the wearer's turns and the timing numbers. Then:
- `checkEvidence()` drops any quote that is not a substring of the wearer's own normalized turns, as the hub already validates cited ids;
- `confidence` is lowered to `low` when fewer than three rungs were reached;
- the spoken line always ends with «No es un examen oficial».
- The result is a `language` entry (`item: "placement"`, band, confidence, the numbers, the plan).

Rejected:
- **Band thresholds on words per minute.** No measured source in the repo, and the numbers differ by language; they are shown, and the model weighs them.
- **Muse Wonder as the scorer.** Slower and priced at US$ 4 / US$ 20 per million tokens against Spark's US$ 1.25 / US$ 4.25 (list prices, `docs/kb/meta-api.md`). It is kept as an A/B in the agreement bench, not the default.
- **Scoring inside the tutor's loop.** A separate call has its own prompt and schema, is testable on transcripts, and the bench can repeat it.

### 5. «Nombra lo que veo»

`coachLookPrompt(lang, band)`: name at most three things in view, the most prominent first, each as `<article + noun in target> = <Spanish>`, one per line, never people's identity, age or health. Count people only if asked. `parseNames()` (pure) keeps well-formed lines.

The agent says them through `pronounce`. Each becomes a `language` item (`item: "seen"`). A tap on the Ver-style surface while the coach is on runs the same look.

The 6 s stale rule does not apply to a look the wearer asked for, as in Ver.

### 6. «Tradúceme» on the meeting pipeline (P1, after `add-consent`)

- **On:** a switch on the coach's screen; it implies listening in Asistir with `languageBias [<target>, "Spanish", "English"]`.
- **For each completed turn not attributed to the wearer**, with three or more words, and where `likelyLanguage` says target (or is unsure):
  - one streamed Muse Spark 1.3 call at minimal effort, `TRANSLATE_PROMPT`: the Spanish meaning in at most 160 characters, or `=` when the turn is already Spanish;
  - a `translation` event: the phone shows a card «TRADUCCIÓN» with the original line small and the Spanish large, and speaks the Spanish in the earbud when Voz is on, below a Dilo cue in priority.
- **A newer turn wins**, as with cues.
- **Kept:** each translation is a `language` item (`item: "heard"`, the original and the meaning).
- **The bench A/B's Muse Spark Open** (Baseten) for this call. Muse Spark Open's language coverage is not documented in the repo either (to check).
- **Consent:** available only when `add-consent`'s room notice exists; before that, only to the owner, as media is today. The first use each day shows «Avisar a la sala». Never in a guest session.

Rejected: translating every turn, including the wearer's. That doubles the calls, and the wearer knows what they said.

### 7. «Corrígeme» (P1)

- **Which turns:** the wearer's own, in the target language, with at least four words.
  - In meetings, «the wearer's» is the speaker label matched to their voice (`src/self-voice.ts`); with no label known, nothing is corrected.
  - In the tutor, every turn is the wearer's.
- **The pacer:** `CorrectionPacer` (pure) allows one correction per `CORRECTION_GAP_MS = 60_000` and checks before the model call, so a paced-out turn costs nothing.
- **The call:** `CORRECT_PROMPT` returns `=` or `{ said, better, why }`. `why` is at most 60 characters in Spanish. `said` must be a substring of the turn, or the correction is dropped.
- **In a meeting:** a «MEJOR» card on the phone and one buzz of the clip, never spoken; the wearer is mid-conversation.
- **In the tutor:** the agent may say it, within the same pacer.
- **Kept:** a `language` item (`item: "corrected"`).

Rejected: correcting every mistake. One a minute keeps the wearer talking; more would teach them to stop.

### 8. The Dilo card at the wearer's level (P1)

When the coach is on for `lang`, and the question is in that language (`likelyLanguage`), the reply call in `src/briefing.ts` gains one line: «Escribe la frase con vocabulario y gramática de nivel <band>.»
- The Spanish meaning comes in the same call, as today.
- The cue keeps its 90-character cap.
- No second call is made.

### 9. `language` entries and progress

The new day entry:

```
{ at, kind: "language", lang: "pt"|"fr",
  item: "asked"|"seen"|"heard"|"corrected"|"placement"|"review",
  text, meaning?, example?, band?, right? }
```

- Text only, at most 300 characters per field. Not written in a guest or trial session.
- The memory index reads it as unit kind `language`, so `ask_memory` cites it («Aprendiste · hh:mm»).
- `languageProgress(entries, lang, now)` (pure) folds the last 60 days into:
  - the latest band and its date;
  - items this week by kind;
  - reviews done and right;
  - items due.

### 10. Spaced review (P2, `src/srs.ts`, pure)

A Leitner schedule folded from the entries, with no new table:
- a new item enters box 1;
- `review` right moves it up one box, wrong sends it to box 1;
- boxes are due after 1, 2, 4, 8 and 16 days (`REVIEW_INTERVALS_DAYS`).

`review_due` returns at most `REVIEW_MAX = 7` items, oldest due first. The tutor asks each one («¿Cómo se dice "el tenedor"?»), checks the answer with `check_repeat`'s comparison, and calls `review_result`.

Rejected: SM-2 and its ease factors, which need a graded answer (0–5) that a spoken reply can't give reliably. Rejected: a review table; the day record already holds every item, and a fold is testable.

### 11. Measuring (rule 5)

`scripts/bench-coach.ts`, modes:

| Mode | What it measures | How |
|---|---|---|
| `translate` | End of a turn's audio → translation card on the phone, p50/p90; Spark 1.3 against Spark Open | Synthetic Portuguese and French phrases spoken by `say` into a scratch hub's `/device`, read on `/events` |
| `look` | Look requested → first name ready to speak, and → the phone's `narrated` report | On the clip with objects on the desk [hw]; or a still from `docs/promo/` for the model's share alone |
| `placement` | Agreement: the same transcript scored twice (exact band, within one band), and the band against the level each transcript was written at | `scripts/eval/coach-set.ts`: ten synthetic learner transcripts per language, two per band A1–C1, written fresh for this repo |
| `correct` | Precision and recall of «Corrígeme» on 20 synthetic sentences per language, half with one mistake | Same eval file |
| `tutor` | First sentence and first answer sentence p50/p90, cost per turn, in the coach persona | `bench-voice.ts --persona coach` with synthetic Spanish and Portuguese questions |

The closest measured paths today, for orientation only, not for claims (`docs/benchmarks.md`):
- the Dilo cue with its Spanish meaning, question end → card: 3.25 s p50 (2026-10-28, n = 17);
- a voice turn: 2,150 ms p50 to the first sentence and 3,207 ms p50 to the first answer sentence, US$ 0.0044 per turn (2026-11-02);
- a look on the clip with the checklist prompt: 6.69 s p50 frame → phone (n = 3, 2026-11-04).

The coach's own numbers replace these once measured.

### 12. The coach as an app

`apps/builtin/idiomas.json`:
- `engine: "coach"`;
- languages `es`, `pt`, `fr`;
- inputs `microphone`, `camera`, `room`;
- permissions `microphone`, `camera`, `memory.read`, `memory.write`;
- the tools of decision 3;
- `price: free`.

It is validated by `add-lens-apps`' validator when that lands, and by a shape test in this change until then. `room` (for «Tradúceme» and «Corrígeme» in meetings) is why it is an engine and not a third-party app.

## Risks / Trade-offs

- [Portuguese and Spanish share many words, so the ASR and `likelyLanguage` may mix them] → bias both languages, test `likelyLanguage` on mixed phrases, and when unsure let the translation call answer `=`.
- [A wrong band discourages the wearer] → confidence shown, quotes they can check, «No es un examen oficial» always, and the agreement bench decides whether the band is shown or only a range («entre A2 y B1»).
- [«Corrígeme» spends a call per eligible turn in a long meeting] → the pacer checks before the call, the four-word floor, and the daily caps. The bench reports the cost per hour before P1 opens to anyone but the owner.
- [ElevenLabs' accent in Portuguese or French] → heard and judged in task 1.1; the phone's native voices are the fallback.
- [It looks like an «AI for Education chatbot» to judges] → the demo shows the glasses: a look that names things, a translation of someone speaking, not a chat screen.
- [A synthetic eval set says little about real learners] → it measures agreement and drift, not truth. The owner's own two placements a day apart are the first real check, labelled as n = 1.

## Migration Plan

1. P0 offers only the languages that passed task 1.1: `COACH_LANGUAGES` in `src/coach.ts` marks each as `verified` (2026-11-04: `pt`), and the apps catalog shows the rest as «Pronto». No environment switch: a language is turned on by the commit that records its check in `docs/kb/meta-api.md`.
2. `language` entries are additive, like `practice`; task 3.1 checks that a day holding them loads and that the memory snapshot reads older snapshots without the new unit kind.
3. Rollback: revert the commit that verified the language. The entries stay in the memory as text.
