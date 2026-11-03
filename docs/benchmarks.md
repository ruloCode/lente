# Benchmarks

Lente lives or dies on latency: a cue that arrives after the moment has passed is noise. These numbers decide which model runs each layer. Every number here comes from a real run of the scripts in `scripts/`; nothing is estimated.

## Targets

| Metric | Target | Why |
|---|---|---|
| Fast cue, time to first token | ≤ 1.5 s p50 | Someone asked you something; ~2 s of silence already feels long |
| Turn finalization (end of speech → final transcript) | ≤ 1.0 s p50 | The fast layer can't start until it knows the question ended |
| Speaker labels | Stable A/B across a 30-min meeting | "Was I asked?" and "don't answer my own lines" depend on it |

## 1. LLM time to first token

```bash
pnpm bench:llm 10
```

Same five meeting moments, streamed through `/chat/completions` on each target:

- `muse-spark-1.3` on the Meta Model API with `reasoning_effort: "minimal"`
- `muse-spark-1.3` with the default effort
- Muse Spark Open on Baseten (`meta-models/muse-spark-open-1026`)

To verify on the first run: that `/chat/completions` streams on the Meta Model API (the quickstart documents `/responses`; `pnpm ping` uses that one), and that `reasoning_effort` is accepted there.

| Target | OK | TTFT p50 | TTFT p95 | Total p50 |
|---|---|---|---|---|
| _pending first run_ | | | | |

## 2. Realtime transcription with diarization

```bash
ffmpeg -i meeting.m4a -ac 1 -ar 24000 -c:a pcm_s16le meeting.wav
pnpm bench:asr meeting.wav DIARIZATION English,Spanish
pnpm bench:asr meeting.wav ENDPOINTING English,Spanish
```

Protocol (from the Meta docs): handshake as the first text frame with `authorization.accessToken`, `audioEncoding: PCM_24KHZ`, `model`, `mode` and optional `languageBias`; audio as binary 80 ms frames (3,840 bytes at 24 kHz) paced at real time; `{"type":"endStream"}` to finish. Server events: `speechStart`, `transcript` (partials), `speechEnd`, `speechComplete` (per `turnId`), `speaker` (`label`), `error`. Sessions cap at 60 minutes.

Open questions this run answers:

1. Does `DIARIZATION` emit `speaker` labels fast enough to use live, or only after the turn? (The docs say the mode "is not tuned for low-latency voice commands".)
2. Is `ENDPOINTING` noticeably faster? If so, run both: endpointing for the cue trigger, diarization for who spoke.
3. How does it handle Spanish–English code-switching with `languageBias`?

| Mode | Partial lag p50 | Finalize p50 | Finalize p95 | Speakers seen |
|---|---|---|---|---|
| _pending first run_ | | | | |

Recordings and results stay local (`recordings/`, `results/` and `*.wav` are git-ignored). Only meetings recorded with everyone's consent are used.

## Prompt cache on the memory prefix

`pnpm bench:cache 12 14` (2026-10-28): Muse Spark 1.3, effort minimal, not streamed (streamed replies carry no `usage`; `stream_options.include_usage` is ignored). Memory: 12 synthetic meetings, 6,333 characters, about 1,620 prompt tokens. Each call keeps the memory and changes only the conversation and the question; the last call of a run is a briefing, which shares the memory but not the task text.

| Run | Calls counted | Cached / prompt tokens | Hit rate |
|---|---|---|---|
| 1 (`12 6`) | 2–6 | 1,521 / 8,178 | 18.6% |
| 2 (`12 14`) | 2–14 | 6,084 / 21,167 | 28.7% |

When the cache hits, 1,521 of about 1,620 tokens are served from it (93.8%); the rest is the changing tail. Hits are not steady: in run 2 calls 1, 5, 7, 8 and 9 hit and the others missed, in no pattern tied to the gap between calls (1.5 s). The briefing call never hit in either run. So the cache is a discount that sometimes applies, not something a latency budget can rely on. A real week of meetings will give a longer prefix; the number above is for the synthetic one.

## Eval on the synthetic set — 2026-10-28

Set: 10 synthetic dialogues, 68 lines, 28 questions (16 aimed at the wearer). Replayed at real time through the hub with the clip emulator.
Models: spark-1.3-minimal (reasoning effort minimal); transcription `muse-voice-transcribe-1.0` in DIARIZATION mode; wearer name "Rulo"; cues only when addressed.

| Metric | p50 / p95 or value | Detail |
|---|---|---|
| Transcription finalize (line end → turn) | 1.66 s / 1.94 s | n=68 |
| Cue (question end → card on the phone) | 3.02 s / 4.75 s | n=17 |
| Reply model time | 1.29 s / 1.86 s | n=17 |
| Addressing precision | 76% | 13 right of 17 cues |
| Addressing recall | 81% | 13 of 16 questions for the wearer |
| False cue rate | 33% | on questions for someone else; 0 cue(s) on statements |
| Questions heard | 28 of 28 | 6 turn(s) merged two lines |
| Vision (Look → card) | 1.26 s / 1.51 s | 5 of 5; model 1.25 s / 1.50 s |
| Tokens per meeting | 299 in (0 cached) / 564 out | 2 model calls |

How to read it: one run (`pnpm eval`, under ten minutes), synthetic macOS voices, the clip emulator over the real protocol, real Meta models. Times are counted from the end of each scripted line (the clip's audio clock); the clip's connection time is the zero, so they carry a few tens of milliseconds of error. A turn that the transcription merged from two lines is timed from its last line. Raw events and per-line results stay local in `results/eval-2026-10-28/`.

What the run showed (4 false cues, 3 missed, from 16 questions aimed at the wearer and 12 aimed elsewhere):

- Three of the four false cues came from the `reply` rule: someone speaks right after the wearer and asks a question that names another person ("Luis, did the deploy go through…", "Ana, could you update the slide?"). The rule does not look at a name for someone else. The fourth is a group question after the wearer spoke.
- Of the three misses, two were one-to-one questions without the wearer's name that the model judged as not aimed at them (d07), and one was a named question ("Rulo, how did the testing go…") that the transcription attached to the previous sentence.
- The transcription joined two lines into one turn 6 times with a 0.9 s pause between them; a real meeting has fewer clean pauses than this set.
- Hub calls are no longer streamed so each one reports `usage`; the cue path waited for the whole answer before, so only first-token timing is lost.
- Cached tokens were 0 in this run: the prompts here carry no memory, so they are below what the cache keeps (see the cache section above).

## Reply with a Spanish meaning — 2026-10-28

The DILO reply now asks Muse Spark 1.3 for a second line, `ES: …`, with the sentence's meaning in Spanish when the question is not in Spanish (`add-spanish-first`, task 1.2). Two `pnpm eval --vision 0` runs on the same set, back to back, both with the Spanish-first transcription bias, so the only difference is the reply prompt and parser. Models: spark-1.3-minimal (reasoning effort minimal), `muse-voice-transcribe-1.0`. Raw results stay local in `results/eval-spanish-before/` and `results/eval-spanish-after/`.

| Metric | Before (sentence only) | After (sentence + meaning) |
|---|---|---|
| Cue, question end → card on the phone, p50 / p90 | 2.94 s / 3.74 s (n=19) | 3.25 s / 3.77 s (n=17) |
| Model first token, p50 / p95 | 1.06 s / 1.65 s | 1.36 s / 1.94 s |
| Rest of the reply, p50 / p95 | 0.11 s / 0.26 s | 0.16 s / 0.39 s |
| Reply model time, p50 / p95 | 1.28 s / 1.91 s | 1.52 s / 2.13 s |
| English questions whose card carried a meaning | 0 of 16 | 14 of 14 |
| Spanish questions whose card carried a meaning | 0 of 3 | 0 of 3 |
| Completion tokens per meeting | 615 | 711 |

What the runs showed:

- The cue got about 0.3 s slower at the median and stayed the same at p90. Most of the median gap is in the first token (+0.30 s), not in the extra line (+0.05 s): the longer instruction costs more than writing the meaning. One run each, so a 0.3 s difference is within what two runs of the same code can differ by; it is a cost to watch, not a settled one.
- Every English card carried a meaning, including the English question in the code-switching meeting (d10). The two Spanish cards (d09, three Spanish questions, two of them merged into one turn) came back as a sentence alone. Example: "I can share an estimate by tomorrow morning." / "Puedo dar la estimación mañana por la mañana."
- Addressing differs between the runs (19 vs 17 cues) because the addressing call is a model call too; it does not use the reply prompt.

## Help on demand — 2026-10-28

One real call per kind with `pnpm bench:help` (`add-live-transcript`, task 1.3): the hub's own prompts, parsing and streamed Responses call (`requestHelp` in `src/help.ts`), on a synthetic six-turn English meeting about a deadline (invented, no real meeting) and an empty memory. Model: spark-1.3-minimal (reasoning effort minimal). Time is from the request to the parsed card on the laptop; the phone and the Wi-Fi hop are not in it.

| Kind | Model first token | Card ready | Card |
|---|---|---|---|
| Aportar | 1.69 s | 2.02 s | "We can update the client about the CSV issue now." / "Podemos avisar al cliente del problema CSV ahora." |
| Pregunta | 1.34 s | 1.64 s | "What if we tell the client about the CSV delay now?" / "¿Avisamos al cliente ahora del retraso del CSV?" |
| ¿De qué hablan? | 1.00 s | 1.34 s | "Están hablando de la exportación de facturación. El CSV falla y la entrega del viernes está apretada." |

What the runs showed:

- One call each, so these are single samples, not percentiles; they sit in the same range as the DILO reply above (first token 1.0–1.7 s).
- Two earlier runs shaped the prompts: in the first, Aportar offered to "deliver PDF now", a deliverable nobody mentioned, so Aportar and Pregunta now say to use only what the conversation says; in the second, Aportar came back as a question, so it now asks for a statement. The table is the third run, with the prompts as committed.
- Both English cards carried a Spanish meaning; the topic came back in Spanish, in two sentences, 101 characters (cap 160).

## Live transcript on the phone

Measured on 2026-10-29 for `add-live-transcript` (task 2.4): the Samsung SM-S931B over USB (`adb reverse`, Chrome on `localhost:8080`), the clip hearing six English test sentences from `say -v Samantha` through the Mac speakers, the live view open in Solo grabar. A second `EventSource` injected through Chrome DevTools stamped each `partial` and `turn` event on arrival, and a `MutationObserver` stamped each final `.lv-line` row. The phone clock runs 129 ms ahead of the Mac (three DevTools round trips, ±3 ms), subtracted from the hub-to-phone figures.

| Measure | n | p50 | p90 | Max |
|---|---|---|---|---|
| Hub publishes a completed turn → event on the phone | 5 | 6 ms | 38 ms | 38 ms |
| Event on the phone → row final on the page | 5 | under 5 ms | under 5 ms | under 5 ms |
| Interval between partial updates | 56 | 258 ms | 655 ms | 897 ms |

What the run showed:

- Only five of the six sentences came out as turns in the window I read; the sixth was not counted. Five samples, so read the p90 as the max.
- The row-render figure sits below what this method can resolve: the page's own handler draws the row before the injected listener sees the same event, so the stamps came out between -5 and 0 ms. Treat it as "no visible delay", not as zero.
- Partial intervals measure the speech service's pace (the hub forwards each update as it arrives), not the page; gaps over 2 s (pauses between sentences) are left out.
- USB `adb reverse` has no Wi-Fi hop, so over Wi-Fi the hub-to-phone figure will be larger; this run does not measure that.

## Cloud hub on Modal — 2026-10-31

The hub deployed with `deploy/modal/hub.py` (one container, `us-east`), driven from the Mac on home Wi-Fi by the clip emulator over `wss://` (`node scripts/fake-clip.ts <wav> --ws --tls --host <modal host> --token <token>`) with an event stream open on `/events` (`curl -N` with a paired session). Speech: one Spanish question from `say -v Paulina`, 7.3 s, 16 kHz. No real clip yet (task 3.1), so there is no clip→hub latency here (task 3.2).

| Measure | n | Value |
|---|---|---|
| WebSocket held open, idle (no reconnect) | 1 | 30 min |
| Event stream held open (keep-alive every 15 s, no reconnect) | 1 | 30 min, 120 keep-alives |
| Completed turn → DILO cue sent by the hub (Baseten `muse-spark-open-1026`) | 1 | 2,956 ms (first token at 2,930 ms) |
| Day spend after the run (hub's own meter) | 1 | USD 0.0025 |
| Native app on the Samsung SM-S931B paired with the cloud hub over home Wi-Fi: turn → card shown, as the card reports it | 1 | 2,209 ms total, of which first token 1,838 ms and hub → phone 319 ms |

One sample for the cue: read it as a smoke check that the cloud path works, not as a latency figure. The cue's stages come from the hub's `cue` event (`turn`, `asked`, `firstToken`, `sent`), all on the container's clock.

## Talking with Lente (voice mode) — 2026-11-02

`node --env-file=.env scripts/bench-voice.ts 2` (`add-voice-mode` 4.1). Five synthetic Spanish questions are spoken with `say -v Paulina`, converted to 16 kHz with `afconvert`, and streamed at real time to `/voice` on a hub the script starts on a scratch data folder. The folder holds one synthetic meeting and never touches `data/`.

- Transcription: Muse Voice Transcribe in `ENDPOINTING` mode.
- Agent: Muse Spark 1.3, minimal effort, function calling plus web search.
- Each question is asked twice, in two sessions: 10 turns, 10 answered.

Times run from the end of the question's audio, on the Mac's clock. They include the Mac → hub → Meta path on home Wi-Fi.

| Measure | n | p50 | p90 |
|---|---|---|---|
| End of speech → `speechComplete` (endpointing) | 10 | 323 ms | 344 ms |
| End of speech → first sentence of any kind (often the commentary «Lo anoto en tu lista») | 10 | 2,150 ms | 3,167 ms |
| End of speech → first sentence of the answer | 10 | 3,207 ms | 4,783 ms |
| Cost per turn (tokens, web searches, transcription) | 10 | US$ 0.0044 | US$ 0.0075 |

By kind (p50 over 2 turns each):

| Question | Tool | First text | First answer sentence | Cost |
|---|---|---|---|---|
| «Hola Lente, ¿qué puedes hacer por mí?» | none | 1,668 ms | 1,668 ms | US$ 0.0031 |
| «Agrega que llame a Ana el viernes.» | `add_task` | 2,014 ms | 3,311 ms | US$ 0.0048 |
| «¿Qué tareas tengo pendientes?» | `list_tasks` | 1,497 ms | 2,631 ms | US$ 0.0026 |
| «¿Qué se decidió sobre la beta en la reunión de planeación?» | `ask_memory` (plan and answer calls) | 1,430 ms | 3,446 ms | US$ 0.0026 |
| «Busca en internet cuál es la capital de Australia.» | `web_search` | 2,688 ms | 2,840 ms | US$ 0.0063 |

What this says:
- Endpointing is not the bottleneck: the turn is ready about a third of a second after the wearer stops.
- The model is the bottleneck. A turn with a tool takes two model steps, and the commentary sentence is what the wearer hears first, about a second before the answer.
- The first-answer target of 1.5 s is met only by a reply without tools.
- Moving the first step to the fast lane (Muse Spark Open) is the next thing to measure. Its function calling is not verified.
- "First text" is when the sentence is ready for the phone's voice. The phone's text-to-speech start is measured on the phone (task 3.3).

## Asking the memory (add-memory-engine) — 2026-11-03

`pnpm bench:ask 2 14` (task 1.1). `scripts/eval/memory-set.ts` builds a synthetic bilingual memory: two projects (PROBE-Atlas in Spanish, PROBE-Orion in English), invented PROBE- people, one meeting per project per weekday (24 turns each), 40 ambient lines and 6 camera descriptions a day, day, week and month digests, a profile and two kept facts. At 14 days that is 19 meetings and 14 day digests. Six questions, two of them inside PROBE-Atlas, one of those about something only PROBE-Orion discussed. Muse Spark 1.3 at minimal effort, structured, not streamed, home Wi-Fi.

"Right" means the answer has the planted fact (18,000 dollars, 20 November, PROBE-Lucía…), or, for the out-of-project question, that it was declined. "Leaks" counts the project questions whose prompt held any PROBE-Orion text.

**Before** (the code at `37a55f1`, loaded with `--src`; one run, n = 6 per path):

| Path | p50 | p90 | Right | Leaks | Prompt tokens per call (avg) | Cached (avg) | Cost |
|---|---|---|---|---|---|---|---|
| Production, plan + answer (`askTiers`) | 6,339 ms | 13,323 ms | 6/6 | 2/2 | 3,148 | 0 | US$ 0.063 |
| Laptop, one call (`ask`) | 3,249 ms | 4,051 ms | 6/6 | 2/2 | 16,499 | 19 | US$ 0.130 |

This reproduces the 2026-11-03 probe within noise (production 6.8 s / 13.6 s, laptop 3.5 s / 5.3 s). The plan call alone took 2.5–7.7 s. Every project question sent the other project's text to the model: the profile and digests in production, the kept facts on the laptop.

**After** tasks 1.2–1.4 (two runs, n = 12 per path):

| Path | p50 | p90 | Right | Leaks | Prompt tokens per call (avg) | Cached (avg) | Cut at length | Cost |
|---|---|---|---|---|---|---|---|---|
| Production, plan + answer | 6,866 ms | 10,841 ms | 12/12 | 0/4 | 2,989 | 254 | 0 | US$ 0.121 |
| Laptop, one call | 2,989 ms | 4,275 ms | 12/12 | 0/4 | 16,493 | 11,106 | 0 | US$ 0.114 |

Prompt cache on the production path (task 1.4): the memory is now the first message of both calls. Before, all 12 calls showed 0 cached tokens. After, on the second run, the answer call was served 1,905 of 1,954 prompt tokens from the cache for «¿Qué se decidió sobre la beta?» and 625 of 739 for the project question. The plan call hit for two questions (1,777 of 1,837). The other calls missed, as the cache section above already found: a hit is a discount, not something the latency budget can count on. On the laptop the 21k-token whole-memory prompt was served from the cache on 6 of 8 calls.

What this says:
- Latency did not change; it is still two sequential calls. The model's time is the whole cost, and group 3 removes the plan call.
- The out-of-project question was declined both before and after. Now that holds in the data, not only in the model's obedience.
- No reply hit the length cap in this run. Before, the laptop's cap was 500 tokens and the 2026-11-03 probe hit it on «¿Qué prometí entregar esta semana?». Now the cap is 1,500, and a cut-off reply is retried once at 3,000 or reported as a failure (task 1.2, unit-tested).
- Spend: US$ 0.19 before, US$ 0.23 after.

### The memory index alone (task 2.4)

`pnpm bench:ask --index-only` and `pnpm bench:ask --index-only --vectors` (2026-11-03, MacBook, Node 22). Each size is built in its own process from synthetic all-day segments: 1,200 a day of about 60 words, content words drawn from a 30,000-word Zipf vocabulary, two projects. Each of 300 queries runs the fast path's retrieval: 4–6 words of a real segment, a project filter on a third, a one-week window on a third, a named person on a fifth, BM25, the people list, with `--vectors` a random 384-dimension int8 vector per unit and a vector search (bit-code prefilter to 200, int8 rescoring), then fusion and neighbour expansion. RSS is measured after a forced GC, before and after the build, and includes the units' text.

| Days | Units | Vectors | Build | Query p50 | Query p95 | Target p95 | RSS added | per 100k units |
|---|---|---|---|---|---|---|---|---|
| 30 | 36,000 | — | 0.8 s | 0.6 ms | 3.5 ms | — | 135 MB | 374 MB |
| 90 | 108,000 | — | 2.6 s | 2.5 ms | 12.2 ms | ≤ 30 ms, met | 267 MB | 247 MB |
| 365 | 438,000 | — | 12.4 s | 10.3 ms | 48.3 ms | ≤ 150 ms, met | 884 MB | 202 MB |
| 30 | 36,000 | 384 | 1.3 s | 3.5 ms | 6.6 ms | — | 151 MB | 418 MB |
| 90 | 108,000 | 384 | 3.8 s | 10.6 ms | 20.9 ms | ≤ 30 ms, met | 339 MB | 314 MB |
| 365 | 438,000 | 384 | 18.6 s | 45.7 ms | 93.1 ms | ≤ 150 ms, met | 865 MB | 198 MB |

The first version missed: 90 days lexical took 55 ms p95. Three changes brought it to 12 ms: document frequencies are kept as units come and go instead of being recounted per query; scores accumulate in typed arrays instead of maps; and a top-k heap replaces sorting every candidate. Decision 3 (three hot months) stands on latency.

Memory is the cost to watch. A hot quarter with vectors adds about 340 MB per listening wearer. Decision 3 estimated about 47 MB for the vectors alone; the rest is postings and the units' text. The container runs every listening runtime (`add-accounts` 6.4). Before more than a few wearers record all day at once, the hot window shrinks to one month (about 150 MB), or hot shards drop their text and reopen it from the sealed records, as cold shards already plan to. This goes to the capacity measure, not to group 3.
