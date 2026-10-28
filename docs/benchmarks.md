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
