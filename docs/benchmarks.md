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
