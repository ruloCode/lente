# Meta Model API and partners

Verified against the docs on 2026-10-26. Items marked **unverified** need a real call before code depends on them.

## Meta Model API

- **Base URL:** `https://api.meta.ai/v1`
- **Auth:** `Authorization: Bearer $MODEL_API_KEY`. Keys: dev.meta.ai → API keys → Create API key. Rate limits are per team, not per key.
- **Docs:** https://dev.meta.ai/docs/models.md (append `.md` to doc URLs for plain text).
- **Protocols:** Responses (`POST /v1/responses`, documented in the quickstart), Chat Completions (`/v1/chat/completions`, OpenAI-compatible), Messages (`/v1/messages`, Anthropic format). Also `/v1/images/*`, `/v1/asr/transcribe`, Files API, `GET /v1/models`.
- **OpenAI SDK:** set `baseURL` to the URL above and pass the key explicitly (the SDK doesn't read `MODEL_API_KEY`).

### Models

| Model ID | Use in Lente | In | Out |
|---|---|---|---|
| `muse-spark-1.3` | Deep layer: meeting context + screen frames | text, image, video, PDF | text |
| `muse-spark-1.3-contributor` | **Never** (Meta may train on the content) | | |
| `muse-wonder-1.0` | Optional: long post-meeting analysis | | text |
| `muse-voice-transcribe-1.0` | Realtime ASR with diarization | audio | text |
| `muse-image-1.0` | Not planned | text, image | image |
| `sam-3.1` | Not planned | image, video, text prompt | boxes, masks |

Spark supports function calling, structured output, prompt caching and web-search grounding. Reasoning effort ranges `minimal` → `xhigh`; over Chat Completions the field is `reasoning_effort` (verified 2026-10-28: accepted, and it cut reasoning tokens from 1,381 to 214 on a one-line reply). Reasoning tokens count as output tokens and show in `usage.completion_tokens_details.reasoning_tokens`.

Structured output over Chat Completions (verified 2026-10-28): `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` is accepted and the reply content is the JSON string. Schema `enum`s are honored for ids, but free-text fields may still carry extra text (a cited id came back as `t1 'quote'`), so validate server-side.

Images over Chat Completions use the OpenAI shape, `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…" } }` (verified 2026-10-28 with a 640×480 JPEG from the clip).

### Responses API shape

`POST /v1/responses` with `{ "model": "muse-spark-1.3", "input": "…" }`. The `output` array holds a `reasoning` item and a `message` item; the text is in the message's `output_text` content. `usage` has `input_tokens`, `output_tokens`, `total_tokens`, `output_tokens_details.reasoning_tokens`.

Streaming (verified 2026-10-28): over Chat Completions, `stream: true` works but no `usage` ever arrives, even with `stream_options: { include_usage: true }` (accepted, ignored). Over the Responses API, `stream: true` sends typed events (`response.output_text.delta` with `delta`, then `response.completed` whose `response.usage` includes `input_tokens_details.cached_tokens`; a repeated 2,132-token prefix came back 2,033 cached). Effort is `reasoning: { effort }`, the cap is `max_output_tokens`, images are `{ "type": "input_image", "image_url": "data:image/jpeg;base64,…" }` and text parts are `input_text`.

### Prices and limits (standard mode)

| Model | Input / 1M | Cached input / 1M | Output / 1M | RPM | TPM |
|---|---|---|---|---|---|
| `muse-spark-1.3` | $1.25 | $0.15 | $4.25 | 3,000 | 4M |
| `muse-wonder-1.0` | $4.00 | $0.20 | $20.00 | 3,000 | 4M |
| `muse-voice-transcribe-1.0` | $0.18 per audio hour (per second) | | | 256 concurrent streams, 16,000 streams/hour | |
| `sam-3.1` | $2.50 / 1k images · $0.20 / 1k video frames | | | 3,000 | |

Budget sense: a 1-hour meeting costs ~$0.18 of transcription; with the USD 150 credit the LLM is the only real cost.

## Realtime transcription (`muse-voice-transcribe-1.0`)

- **URL:** `wss://api.meta.ai/v1/asr/realtime` (optional `?sessionId=`).
- **Auth goes in the handshake, not an HTTP header.** First text frame, within 10 s:

```json
{
  "authorization": { "accessToken": "Bearer <MODEL_API_KEY>" },
  "audioEncoding": "PCM_24KHZ",
  "model": "muse-voice-transcribe-1.0",
  "mode": "DIARIZATION",
  "languageBias": ["English", "Spanish"],
  "keywords": ["Lente", "Muse Spark"]
}
```

- **Ack:** the only server frame without `type`; contains `sessionId`.
- **Audio:** binary frames, signed 16-bit little-endian mono PCM. `PCM_24KHZ` (native, preferred) or `PCM_16KHZ` (resampled server-side). 80 ms per frame = 3,840 bytes at 24 kHz. Send at about real time: falling below real time closes with `1008`.
- **End:** send `{"type":"endStream"}` and keep reading until close `1000`. Closing yourself can drop pending events.
- **Modes** (fixed for the session):
  - `PUSH_TO_TALK` (default): you mark turns; done = `transcript` with `final: true`.
  - `ENDPOINTING`: the model finds turn boundaries; done = `speechComplete` per `turnId`.
  - `DIARIZATION`: endpointing plus speaker attribution; done = `speechComplete` per `turnId`. Docs warn it is "not tuned for low-latency voice commands".
- **Server events:** `speechStart` (`turnId`, `audioProcessedMs`) · `transcript` (`transcript`, `final`, `audioProcessedMs`; partials have no `turnId`, they belong to the latest `speechStart`) · `speechEnd` (boundary, not the text) · `speechComplete` (`turnId`, `transcript`) · `speaker` (`label`, e.g. `A`; session-scoped) · `audioProgress` · `error` (`message`, `sessionId`).
- **Languages:** 25 validated, including English and Spanish. `languageBias` takes English names ("Spanish"), not codes; it's a hint. `keywords` biases recognition.
- **Limits:** 60-minute sessions, no resume token; reconnect before the limit (new session = new speaker labels).
- **Close codes:** `1000` done · `1008` bad config or pacing (don't retry as-is) · `1011` backend failure, retry with backoff ("Max session duration reached" → new session) · `1013` rate limited.
- **Unverified:** whether `speaker` arrives before or after `speechComplete`, and how fast in `DIARIZATION`. `scripts/bench-asr.ts` measures both.

Batch: `POST /v1/asr/transcribe`, up to 10 minutes of audio per request, 32 MB body; returns `turns[]` with `turnId`, `startMs`, `endMs`, `transcript`, `speaker`.

## Baseten (Muse Spark Open, open weights)

- **Endpoint:** `POST https://inference.baseten.co/v1/chat/completions`, OpenAI-compatible, `Authorization: Bearer $BASETEN_API_KEY`.
- **Model:** `meta-models/muse-spark-open-1026` for the hackathon (the docs say `meta-models/muse-spark-open`; the guide says use the `-1026` one).
- Accepts text, image, audio and video; returns text and a reasoning output (see Baseten's "Reasoning" guide before parsing).
- Counts toward **Best Build on Meta Open Weight Models**: the partner verifies the project runs on it.
