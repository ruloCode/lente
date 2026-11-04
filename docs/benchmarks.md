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
| _not run as a standalone bench; the eval below times the same path end to end_ | | | | |

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
| _not run as a standalone bench; the eval below times the same path end to end_ | | | | |

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

### The fast path (task 3.5)

`LENTE_RECALL=fast pnpm bench:ask 5 30` (2026-11-03): the same six questions on 30 synthetic days (43 meetings), five runs each, the fast path next to the production tiers. The fast path parses the question, retrieves in the runtime and makes one streamed Responses call (Muse Spark 1.3, minimal effort, 600-token cap). When retrieval is not confident or the question is an aggregate, it falls back to the tiers. "First text" runs from the question to the first text the phone would show; the tiers show their whole answer at once.

| Path | n | First text p50 | First text p90 | Answer p50 | Answer p90 | Right | Leaks | Model calls | Cost |
|---|---|---|---|---|---|---|---|---|---|
| Fast | 30 | 2,662 ms | 7,276 ms | 3,059 ms | 7,276 ms | 25/30 | 0/10 | 35 | US$ 0.106 |
| Production tiers | 30 | 8,562 ms | 10,746 ms | 8,562 ms | 10,746 ms | 30/30 | 0/10 | 60 | US$ 0.255 |

- Retrieval took at most 4 ms (p95 2.3 ms).
- 5 of 30 took the deep path: all five were the out-of-project question, where nothing in PROBE-Atlas matched. Those five set the p90 (7.3–8.0 s).
- The 5 wrong answers were «¿Qué prometí entregar esta semana?», answered «No lo encuentro» every time. Nothing in it matches the words of a commitment, and the week's range only fed retrieval when nothing else matched. Now a named time range always brings that range's meeting notes, cards and facts. On a re-run (`--only promised --paths fast`, n = 5): 5/5 right, first text 3.2 s p50, answer 4.5 s p50, US$ 0.017.

**Target missed: first text ≤ 1.2 s p50.** Measured: 2.7 s. The time is the model's, not Lente's:
- Spark 1.3 at minimal effort wrote 140–340 output tokens for answers of 9–26 words. About 150–250 of them are reasoning before the first visible word, and the model's own first token took 1.7–4.3 s.
- A probe with rules cut to two sentences did not help: 2.1–3.1 s, against 2.1–3.3 s for the full rules (n = 6 each, US$ 0.03).
- The reply cue reaches its first token in about 1.1 s with a 300-token prompt. The fast path's prompts are 1,100–3,700 tokens.

The answer is still 2.8 times faster than the production path at the median.

The next levers are outside this group:
- the fast lane (`add-fast-reply-lane`, Muse Spark Open on Baseten);
- a smaller «RECUPERADO» budget for short questions;
- a voice-style preload that keeps the prefix cached (group 5).

### Voice memory questions in one step (task 5.4)

`pnpm bench:voice 2 --days 30 --memory` (before) and the same with `--fast` (after), 2026-11-03. The hub runs on 30 synthetic days (43 meetings, two PROBE- projects). Three memory questions and one task request, as the control, are spoken with `say -v Paulina` and streamed at real time to `/voice`. Times run from the end of the question's audio. Real Muse Voice Transcribe (`ENDPOINTING`) and Muse Spark 1.3 (minimal).

| Memory question | Before: first answer sentence (2 runs) | After (fast recall, 2 runs) | Tool calls after |
|---|---|---|---|
| «¿Qué se decidió sobre la beta?» | 9.2 s, 7.7 s | 5.3 s, 3.3 s | `ask_memory` in run 1, none in run 2 |
| «¿Qué dijo Ana sobre el presupuesto de marketing?» | 13.2 s, 10.3 s | 2.6 s, — (the transcription returned no turn) | none |
| «¿A quién entrevistamos para diseño?» | 11.0 s, 9.7 s | 3.1 s, 3.1 s | none |
| **p50 of the memory questions** | **10.0 s** (n = 6) | **3.1 s** (n = 5) | |

- Before, every memory question took two voice steps around `ask_memory`, and `ask_memory` was a full answer call over 30 days. After, 4 of 5 were answered in the first step from the lines attached while the wearer spoke, with no tool.
- The control «Agrega que llame a Ana el viernes» got no memory lines and added its task: 5.0 s before, 6.8–8.9 s after. The preloaded prefix makes the session's first message longer; with two runs that difference is within noise, and it is the cost to watch.
- **Target missed: first spoken answer sentence ≤ 1.5 s p50.** Measured: 3.1 s. As on the chat path, the time is Spark's own first token on the first step (2.5–3.3 s here), not retrieval.
- **Partials in `ENDPOINTING` mode:** a third run (one round, `--fast`) counted 5–6 partial transcripts per question before `speechComplete`. Speculative recall runs on them as decision 9 says.
- Spend: US$ 0.037 before, US$ 0.030 after, US$ 0.012 for the partials run (tokens, searches and transcription).

### Opening a runtime with and without snapshots (task 7.5)

`pnpm bench:ask --index-only --open` (2026-11-03). Synthetic all-day meetings: 8 a day of 450 turns, 20 Zipf words each, 6 s apart, two projects. A runtime opens on them three ways:
- with no snapshots, indexing the hot months (this one and the two before) from the records;
- writing the snapshots;
- opening a second runtime from those snapshots.

Laptop file store, so the times leave out the sealing and the database round trip.

| Days of records | Turns | Units indexed (3 hot months) | Open without snapshots | Write snapshots | Open with snapshots | Snapshot bytes | RSS added |
|---|---|---|---|---|---|---|---|
| 30 | 107,550 | 18,527 | 879 ms | 104 ms | 137 ms | 16.2 MB | 111 MB |
| 365 | 1,313,550 | 40,865 | 2,463 ms | 249 ms | 311 ms | 35.6 MB | 198 MB |

- With snapshots, a runtime opens about 6–8 times faster, and no meeting needed replaying.
- At 365 days only the 3 hot months are indexed at open. Older months load when a question names a time in them, and their snapshots are written when they are dropped.
- Snapshot size is about 12 MB a month of all-day speech, text included. In the database that is one sealed `bytea` row per month per wearer. That figure goes to the capacity measure (`add-accounts` 6.3/6.4), next to the RSS of task 2.4.

### Vectors (tasks 8.4 and 8.6)

The encoder bake-off is recorded with the choice in `docs/kb/decisions.md` ("The encoder", 2026-11-03). B (`multilingual-e5-small`, int8 ONNX, in the hub) against the A baseline:
- recall@10 0.686 against 0.524;
- cross-lingual 0.600 against 0.400;
- query embedding 3.9 ms p95.

`scripts/bench-ask.ts 5 90 --paths fast --encoder-module @huggingface/transformers` (2026-11-03): the fast path with vectors on 90 synthetic days (5,344 units, embedded in 12.4 s before timing).

| Measure | Value | Target |
|---|---|---|
| Right answers | 30/30 (none took the deep path; the out-of-project question was declined on the fast path) | — |
| Leaks into project questions | 0/10 | 0 |
| Retrieval p95 (lexical + vector + fusion; the question's embedding runs in parallel) | 10.3 ms | ≤ 30 ms at 90 days, met |
| First text p50 / p90 | 2,451 ms / 4,280 ms | ≤ 1.2 s p50, missed (the model's first token, as in 3.5) |
| Answer p50 / p90 | 2,907 ms / 5,551 ms | — |
| Process peak RSS (encoder, index and the bench) | 612 MB | — |
| Cost | US$ 0.105 for 30 answers | — |

At 365 days the index microbench with 384-dimension vectors (task 2.4) gave 93 ms p95 for retrieval. Add 3.9 ms p95 for the query's embedding: about 97 ms, against the ≤ 150 ms target, met. The RSS at 365 days is in 2.4's table; only the three hot months stay loaded at once (7.5).

## Media archive (add-media-archive) — 2026-11-03

### Audio codec (task 1.2, measured; the choice waits for the owner)

`node scripts/bench-media.ts`: IMA ADPCM (pure TypeScript, `src/media-chunks.ts`) on 60 minutes of synthetic speech (the `say` lines of `scripts/bench-consolidation.ts`, looped), cut into 30-second chunks as segments would be. Measured on the owner's Mac, not the Modal container.

| Codec | Bytes per hour of speech | Encoder CPU per audio hour | Round-trip SNR | Dependency |
|---|---|---|---|---|
| PCM16 (reference) | 115.2 MB | — | — | — |
| IMA ADPCM | 28.8 MB | 472 ms | 28.4 dB | none |
| Opus (WASM) | not measured | — | — | one runtime dependency |

Opus is not measured: measuring it means adding a WASM build of libopus, and the handoff asks for the owner's listening check before choosing it. ADPCM is the default until then. Decision 3's rule says Opus ships only if it at least halves storage at acceptable CPU. The design's arithmetic puts Opus at 7–11 MB an hour, which would qualify on size. The ADPCM number is a ceiling, because only speech that passes the silence gate is kept.

### Grounding eval: fast path against the tiers (task 9.1)

`scripts/eval/grounding.ts --encoder-module @huggingface/transformers` (2026-11-03): the recall set (105 answerable questions, 15 out of memory), plus 10 facts asked inside the project they are not in. Each question went through both paths with Muse Spark 1.3 at minimal effort:
- **fast:** local retrieval with vectors, one streamed answer, the deep path when not confident;
- **deep:** `askTiers` (plan, lookup, answer).

"Accurate" means found, with a cited source in the meeting that holds the fact. Cost: US$ 1.89 for 260 answers.

| Measure | Fast | Deep (tiers) |
|---|---|---|
| Accuracy | **90/105** | 17/105 |
| — paraphrase / cross-lingual / exact / time | 26/30 · 23/30 · 26/30 · 15/15 | 2/30 · 0/30 · 3/30 · 12/15 |
| Citation accuracy (answers whose every chip is in the right meeting) | 88/93 | 15/30 |
| Refusals, out of memory | 15/15 | 15/15 |
| Refusals, out of project | 10/10 | 10/10 |
| First text p50 / p90 | 2,591 / 3,574 ms | 8,575 / 10,922 ms |
| Answer p50 / p90 | 3,010 / 4,296 ms | 8,575 / 10,922 ms |
| Cost | US$ 0.89 | US$ 0.99 |

How to read the deep path's number:
- It is low partly because of the set. The tiers find older meetings through day digests, and here each day's digest is a thin stand-in: its meetings' titles and first card fact, with their ids, not a real nightly digest.
- In production the digests are written by the model and are richer, so this table overstates the gap. It does not reverse it: the deep path also failed every cross-lingual question, which is what the plan call was meant to solve.
- The fast path's misses were 7 cross-lingual, 4 paraphrase and 4 exact questions. Its refusals were perfect on both kinds of trap question.

### Consolidation while recording (task 6.6)

`scripts/bench-consolidation.ts`: Solo grabar on a scratch hub with `LENTE_RECALL=fast`. `scripts/fake-clip.ts --loop` streams 16 minutes of synthetic bilingual speech at real time, looped. Real Muse Voice Transcribe and Muse Spark 1.3. Each window card is written 10 minutes into an episode.

| Run (2026-11-03) | Audio the hub received | Window cards | Window close → card | Failed card calls | Cost per recorded hour (cards / all model calls / with transcription) |
|---|---|---|---|---|---|
| 120 min, before the card timeout (`1bc37b0`) | **21.9 min**: the clip emulator stopped sending at minute 22 | 2 | 11–12 s | 0 | US$ 0.014 / 0.018 / 0.049 (over 120 min with 22 min of speech: not a real hourly rate) |
| **120 min, with the timeout** | **96.6 min**: Lente paused itself at minute 96.6 (below) | **10** (2 episodes; the first ended at its 60-minute limit) | 10–23 s, p50 13 s | 0 | US$ 0.082 / 0.093 / **0.267** per hour of audio received (US$ 0.43 for the run) |
| 32 min, with the timeout | 30.9 min (1,855 s billed by transcription) | 3 | 9 s, 11 s, 222 s | 1 (retried: the 222 s card) | US$ 0.091 / 0.096 / 0.270 |

What the first run showed:
- **The stall was not a hung card call.** Both card calls finished in about 12 s.
- **The hub stopped receiving audio.** Turns stop at minute 22, and so does the hub's recorded time.
- **The emulator exits on the first closed link and does not reconnect, unlike the clip's firmware.** Its output was discarded, so the cause of the drop is not recorded.
- **The bench now keeps the emulator's link lines and reports `clipExit` and `recordedAudioMin`.**
- **The 32-minute rerun passed minute 22 without a drop.**

The 2-hour rerun (bold row) measures 6.6. It also found a problem in the idle pause (`add-idle-pause`), which production has too:
- **At minute 96.6 the hub paused itself: «1203 s without the wearer speaking».** Speech never stopped.
- **The wearer label kept getting lost.** It was found nine times («speaker A is the wearer») and was lost again 10–25 s later each time («not identified»). Every transcription session the silence gate reopens after a pause starts its speaker labels again.
- **Once a wearer has been seen, the idle watch counts only the wearer's turns.** So a wearer who is not re-identified for 20 minutes pauses Solo grabar while people are still talking.
- **What the clip does:** it stops sending, and the phone shows the pause («En pausa»).

In the bench the "wearer" is one of two synthetic voices. On the glasses the wearer's voice is the loudest, which should be re-identified more often, but nothing guarantees it.

### On the phone (add-memory-engine 4.3)

2026-11-03, Samsung S25 (SM-S931B), Chrome. The web app's chat ran against a laptop hub from this branch with `LENTE_ENCODER=hub`, through `adb reverse`. The memory was the 2-hour Solo grabar run's synthetic speech: 2 episodes, 11 cards, 277 indexed units. A second project with no meetings («Lanzamiento Lima») was added for the probe. The questions were asked through Chrome DevTools, and each screenshot is of the page itself. Times come from the hub's `[ask]` lines.

| Question | Scope | Answer | Retrieval | First text | Answer total |
|---|---|---|---|---|---|
| «¿Qué temas quedaron en pausa hasta la otra semana?» | All memory | The eight paused topics, with chips to both episodes | 5.8 ms | 3,193 ms | 3,883 ms |
| «¿Qué tengo que revisar antes de seguir?» | Piloto Bogotá | The six items to review before continuing, 3 chips | 3.8 ms | 4,490 ms | 5,242 ms |
| «¿Qué se decidió sobre el piloto en Bogotá?» | Lanzamiento Lima (out-of-project probe) | «No lo encuentro en lo que viste y escuchaste.»: no lines in scope, so the deep path, no chips | 0.6 ms | — | 3,102 ms |

The first text missed the 1.2 s target, as in 3.5: the time goes to the model before its first token, not to retrieval.

### Media storage per recorded hour (add-media-archive 4.3, partly)

The 2-hour Solo grabar run kept the speech audio of every closed segment as ADPCM: 188 objects, **36 MB for 96.6 minutes of audio received**, about **22 MB per recorded hour**. That is below the 28.8 MB an hour of continuous speech takes (1.2), because the silence gate keeps only speech. The run had no frames: the clip emulator sends no photos. Battery with frames on and off is still to measure on the clip, on battery.

## Sight mode (add-sight-mode) — 2026-11-04

`modal app logs lente-hub -f </dev/null | node scripts/bench-sight.ts --seconds 120 --skip 5 --label baseline` (task 1.2). The bench reads the hub's own timing lines (`[live] … ms` per model call, `[stages] live …` per description shown) and stamps them as they arrive; it keeps lengths and times only. The real clip (XIAO ESP32-S3 Sense, XGA JPEG, about 33 KB a frame) connected to the hub on Modal over home Wi-Fi, looking at the owner's desk; the owner's Samsung showing the descriptions. Model: Muse Spark 1.3, minimal effort, streamed over the Responses API, with the meeting's `LIVE_PROMPT` (before any sight change). One run of 125 s.

| Measure (baseline, `LIVE_PROMPT`) | n | p50 | p90 | Max |
|---|---|---|---|---|
| Live: model call | 36 | 2.30 s | 5.82 s | 11.80 s |
| Live: frame on the hub → shown on the phone | 35 | 3.36 s | 6.84 s | 12.11 s |
| Live: between descriptions shown | 34 | 2.76 s | 6.09 s | 12.51 s |

What this says:
- A description reaches the phone about 3.4 s after its frame at the median. The model call is most of it (2.3 s); the rest is the frame waiting while the previous call finishes.
- The tail is long: one in ten descriptions took over 6.8 s, the slowest 12 s. For someone who cannot see, a description of what was there 10 s ago is worse than silence, so Ver drops any description that arrives more than 6 s after its frame (`SIGHT_STALE_MS`) and logs it as `stale`.
- The meeting prompt never stays silent (0 of 36 unchanged): it always says something, even when the view did not change. Ver's prompt answers `=` then, and nothing is spoken.

### With Ver's first prompt, the checklist (task 1.2, second run)

The same bench, `--label sight`, 155 s, after Ver's own live prompt replaced the meeting's: the checklist prompt (text first, then what is held up, then people, then the rest, or `=` when nothing changed). Same clip, desk, phone and model.

| Measure (`sight`, checklist prompt) | n | p50 | p90 | Max |
|---|---|---|---|---|
| Live: model call | 33 | 4.14 s | 6.17 s | 9.61 s |
| Live: frame on the hub → shown on the phone | 13 | 5.33 s | 6.27 s | 6.31 s |
| Live: between descriptions shown | 12 | 8.05 s | 22.19 s | 28.03 s |
| Look: model call | 3 | 6.28 s | 7.84 s | — |
| Look: frame on the hub → shown on the phone | 3 | 6.69 s | 8.18 s | — |

- Silent live reads (unchanged, `=`): 11 of 33.
- Stale live reads dropped (over 6 s after their frame, `SIGHT_STALE_MS`): 9 of 33.
- Stage split of the live reads shown: asked → first token **3.92 s** p50, against **1.94 s** in the baseline.

What this says:
- The silence works: a third of the reads found nothing new and said nothing, where the meeting prompt never stayed quiet.
- The checklist made Spark reason about twice as long before its first token (3.92 s against 1.94 s). The model call went from 2.30 s to 4.14 s at the median, so more descriptions crossed the 6 s limit and were dropped (9 of 33). Only 13 of 33 reads reached the phone, one every 8 s at the median.
- A description arrives 5.3 s after its frame, and the stale guard now bounds the tail (6.3 s at most) instead of the baseline's 12 s.
- That is why the live prompt became one sentence, the most important thing first, and the detail moved to a look, which the person asks for. The A/B below measures the two prompts on the same frames. The run on the clip with the one-sentence prompt is `ship-hackathon` 6.3.

### Live prompt A/B: checklist against one sentence (ship-hackathon 6.2)

`node --env-file-if-exists=.env scripts/bench-sight-prompts.ts` (2026-11-04, 10:15 Bogotá, from the Mac over home Wi-Fi). Both prompts go through the hub's own live-read call: Muse Spark 1.3, minimal effort, streamed over the Responses API, 800-token cap, the prompt as the system message and "First frame." with the image as the user message. The checklist is Ver's first live prompt as committed in `5ee0323`; the one sentence is today's `SIGHT_LIVE_PROMPT`. Three frames from `docs/promo/`, nobody in them but a hand:
- the clip on glasses (a render, 1920×1085, 141 KB);
- the ecosystem infographic (text to read, 1920×1085, 254 KB);
- the real photo of the clip rig held between the fingers (529×589, 341 KB).

Each prompt × frame twice, interleaved: 12 calls.

| Prompt | n | First token p50 | First token max | Total p50 | Output tokens p50 (mean) | Input tokens p50 | Unchanged | Cut at cap | Cost |
|---|---|---|---|---|---|---|---|---|---|
| Checklist | 6 | 5.50 s | 8.65 s | 5.82 s | 327 (405) | 3,064 | 0 | 0 | US$ 0.0208 |
| One sentence | 6 | 3.08 s | 3.29 s | 3.35 s | 174 (201) | 2,859 | 0 | 0 | US$ 0.0141 |

Per frame, both calls in run order:

| Frame | Checklist: first token · output tokens | One sentence: first token · output tokens |
|---|---|---|
| Clip on glasses | 3.91 s, 5.50 s · 294, 323 | 2.48 s, 3.29 s · 139, 174 |
| Ecosystem infographic | 5.97 s, 3.28 s · 446, 327 | 3.08 s, 3.19 s · 265, 239 |
| Clip rig in hand | 8.65 s, 5.52 s · 705, 333 | 3.08 s, 2.75 s · 234, 157 |

Spend: US$ 0.035 at list prices. Percentiles are nearest rank over 6 calls. Output tokens include the reasoning the model does before it answers.

What this says:
- One sentence halves the work: about half the output tokens (174 against 327 at the median) and 2.4 s less to the first token (3.08 s against 5.50 s). Its slowest call (3.29 s) was faster than the checklist's median.
- The checklist's tail is what hurts Ver: 8.65 s and 705 tokens on the photo of the rig in the hand, a read that would be dropped as stale.
- The one sentence still reads text: on the infographic it said «un diagrama que dice LENTE ECOSYSTEM». The checklist said there was a lot of text and offered to read it. Reading all of it is the look's job (`SIGHT_READ_PROMPT`).
- These are the model's own times, measured from the Mac. On the clip, a frame also waits for the previous call to finish (the gap between the baseline's model call and its frame → phone time).
