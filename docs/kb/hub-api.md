# Hub API (for any client)

The contract between the hub (`src/pilot.ts`) and its clients: the phone page (`src/pilot-page.ts`), the desktop page and the Android app (`android/`). Server-sent events down, JSON `POST` up, and the clip protocol v2 over a WebSocket for a device that stands in for the clip. Recorded with `add-android-app` from the code as of 2026-10-30; `scripts/android-e2e.ts` exercises it against the stubbed Meta API.

## Transport

- Web port `PILOT_WEB_PORT` (default 8080); HTTPS when `PILOT_TLS_CERT` and `PILOT_TLS_KEY` are set.
- `POST` bodies are raw JSON text (at most 10 000 characters); `Content-Type` is ignored and an empty body is `{}`. Unknown route: 404. A thrown error: 500, no body.
- `GET /health` is always open: 200 or 503 with the health snapshot.
- Cloud hub (`LENTE_CLOUD=1`, `src/access-gate.ts`): everything but `/health` needs the `lente_session` cookie, got from `POST /pair {code}` (204 with `Set-Cookie`, or 403). Plain HTTP is redirected (308); anything else unpaired is 401. The `/device` WebSocket takes a device token (`Authorization: Bearer <t>` or `?token=`) or the paired cookie.

## Events: `GET /events`

One `data: <json>\n\n` per event, a `: keep-alive` comment every 15 s, no `id:` or `retry:`. On connect, in order: `status`, `history`, `partial` (only while listening and mid-turn), `meetings`, `actions`, `recorded`, `spend`. A reconnect replays the whole snapshot, so a client deduplicates turns by `at|text`.

### `status`

| field | type | notes |
|---|---|---|
| `clip` | boolean | a device is connected (clip or phone) |
| `device` | `""` \| `"clip"` \| `"phone"` | `"phone"` when the hello said `lente-phone` |
| `mode` | `"camera"` \| `"mic"` | |
| `listening` | boolean | the hub starts paused |
| `pause` | null \| `{reason:"start"}` \| `{reason:"manual"}` \| `{reason:"idle", at, basis:"wearer"\|"anyone", min}` | null while listening |
| `live` | boolean | live camera narration |
| `voice` | `"elevenlabs"` \| `"device"` | `elevenlabs`: `POST /tts` works |
| `audioLost`, `audioLate` | number | frame counters |
| `meeting` | null \| `{id, title, startedAt, turns, auto?}` | `auto`: a Solo grabar episode |
| `names` | string[] | the wearer's names and aliases |
| `everyQuestion` | boolean | testing switch |
| `assistMode` | `"assist"` \| `"record"` | Asistir or Solo grabar |
| `wearer` | string | the wearer's speaker label, `""` when unknown |
| `clipError` | string | why the last hello was refused |
| `asr` | string | `waiting for the clip…`, `no MODEL_API_KEY: audio level only`, `listening`, `listening · nothing sent in silence`, `paused`, `transcription closed (<code> <reason>)`, `transcription connection error`, `transcription error: <msg>` |
| `modelDown` | string | reason class when the model or transcription fails |
| `session` | null \| `{startedAt, listenedMs, running}` | taken at send time |

### Day entries (`history.items`, and live)

`history` is `{items}` with today's last 80 entries (`src/day-log.ts`); history entries carry no `id` and no `photo`.

- `turn`: `at, turnId?, speaker?, text, question?, audioStartMs?, audioEndMs?, spokeAt?`
- `cue`: `at, label, text, meaning?, ms?, asker?, why?, model?, provider?, stages?`, live ones also `id` (`s<n>`) when staged, `turnId` on a DILO, `photo` on ON SCREEN and PHOTO
- `live`: `at, text, stages?`, live ones also `id, ms, photo`; an unchanged or failed read is `{kind:"live", text:"", ms?, photo}`
- `summary`: `at, text, ms?`

Cue labels: `DILO` (legacy `SAY THIS`), `ON SCREEN`, `PHOTO`, and the help labels `Aportar`, `Pregunta`, `¿De qué hablan?`. `why`: `name` "dijeron tu nombre", `reply` "te respondían a ti", `model` "parece dirigida a ti", `testing` "modo todas las preguntas". `photo` is always `data:image/jpeg;base64,…`. A client acknowledges every event with an `id` with `POST /seen {id}`; the hub then sends `{kind:"stages", id, stages}` with `phone` added.

Stage order: `heard, turn, asked, firstToken, done, sent, phone`.

### Other events

- `partial {text}`: the turn in progress.
- `speaker {turnId, speaker}`: a label arrives late for a turn (ids restart per transcription session).
- `address {turnId, verdict, rule, ms?}`: why a turn was or was not for the wearer.
- `level {rms}`: at most every 200 ms; the page draws `min(1, rms / 3000)`.
- `recorded {ms}`: audio received today.
- `usage {label, model, provider, ms, promptTokens, cachedTokens, completionTokens}`.
- `spend {day, audioSeconds, models: {[model]: {calls, input, cached, output}}, usd, unpriced[]}`.
- `meetings {items, language}`: `items` newest first, each `{id, title, topic?, auto, startedAt, endedAt?, status: running|extracting|done|too-short|failed, turns, notes?, stats?: {asked, answered}, dropped?}`; `language` is `{glossary: [{term, meaning, count, example}], phrases[], asked, answered}`.
- `actions {pending, decided, tasks}`: `pending` cards `{id, meetingId, tool, proposedArgs, args, evidence[], status, createdAt, meetingTitle, quotes: [{id, at?, speaker?, text}]}`; `decided` the last 10 `{id, tool, status, meetingId}`; `tasks` `{id, title, due?, meetingId, evidence[], done, createdAt, meetingTitle}`.

## Routes

| route | body | answer |
|---|---|---|
| `GET /meetings/search?q=` | q ≤ 200 chars | `{results: [{id, title, startedAt, matches: [{where, turnId?, line}]}]}` |
| `GET /meetings/get?id=` | | meeting summary + `share` (notes as text) + `turnList: [{id, at, speaker?, wearer, text}]`, or 404 |
| `GET /traces/get?id=` | | `{steps: [{at, kind, label, detail}]}` |
| `GET /facts` | | `{facts: [{id, text, status: proposed|kept, meetingId, evidence[], createdAt}]}` |
| `POST /facts/keep`, `/facts/discard` | `{id}` | 204 or 404 |
| `POST /actions/decide` | `{id, decision:"approve", args?}` or `{id, decision:"reject"}` | 200 `{status, outcome}`; 400, 404, 409 `{error}` |
| `POST /tasks/done` | `{id, done}` | 204 or 404 |
| `POST /meeting/start` | `{title}` | 204 |
| `POST /meeting/end` | | 204 |
| `POST /meetings/delete` | `{id}` | 204, or 404 (also for the running meeting) |
| `POST /meetings/delete-all` | | 204; also traces, actions, facts and glossary |
| `POST /briefing` | `{title, names: "a, b"}` | `{title, names[], at, remembered, items: [{kind: owed|open|term|phrase, text, sources[]}], sources: [{id, title, startedAt}], dropped}`, or 500 |
| `POST /profile` | `{names: "a, b"}` | 204 |
| `POST /seen` | `{id}` | 204 |
| `POST /narrated` | `{text}` | 204; the hub drops turns that repeat it |
| `POST /tts` | `{text}` | 200 `audio/mpeg`, 404 without an ElevenLabs key, 502 |
| `POST /help` | `{kind: aportar|pregunta|tema}` | 200 `{ok, kind, label, text, meaning?, ms}` (the card also arrives as a `cue`); `{ok:false, reason, message}` with 400, 409 or 502 |

Body-less `POST`s, all 204: `/listen/on`, `/listen/off`, `/session/stop` (ends the session clock, pauses, ends the meeting), `/look`, `/live/on`, `/live/off`, `/mode/camera`, `/mode/mic`, `/assist-mode/assist`, `/assist-mode/record`, `/summary`, `/cues/all`, `/cues/addressed`.

Meeting notes: `{title?, topic?, summary, decisions: [{text, evidence[]}], commitments: [{what, owner ("you" is the wearer), due?, evidence[]}], openQuestions: [{text, evidence[]}], glossary?: [{term, meaning, evidence[]}]}`; evidence holds meeting turn ids (`t1`, `t2`…).

Action tools: `create_task {title, due?}`, `create_reminder {title, date (YYYY-MM-DD), note?}`, `draft_email {to[], subject, body}` (its outcome carries a `mailto`).

## Device WebSocket: `/device`

Binary messages carrying clip protocol v2 (`docs/PROTOCOL.md`): the first frame is the `H` hello (`{"proto":"2.0","device":"lente-phone","fw":…,"codec":"pcm16","rate":16000,"rssi":0,"camera":false}`), then `A` audio (u32 sequence, u32 capture ms, 1280 PCM16 samples = 80 ms) and `J` JPEG stills. Downlink is single bytes in binary messages: `M`/`m` send or stop sending audio, `P` take a still (the page sends at most 1024 px on the long side, JPEG quality 0.8), `B` signal a card, `C`/`c` camera mode, `T` another device took over (the hub then closes). On connect the hub sends `C` or `c`, then `M` or `m`. One device at a time: the newest connection wins.
