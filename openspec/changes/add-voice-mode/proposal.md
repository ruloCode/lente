# Proposal

Depends on: `add-accounts`, `add-task-owners`, `add-record-sheet`

## Why

The wearer's hands are busy and the phone is in a pocket. Today, to ask Lente something or to add a task, they must open the app, type in the ask bar and read the answer. They want to talk to Lente the way they would talk to an assistant beside them:
- ask about what Lente knows (meetings, projects, tasks, memories);
- add, complete or reassign a task;
- start a recording in a project;
- look something up on the web;
- hand a job to an agent.

They should hear the answer as soon as they stop talking.

## What Changes

- **"Hablar con Lente" on the phone.** A screen opened from a button beside Inicio's ask bar, apart from the record button. It shows:
  - one large state: escuchando, pensando or hablando;
  - the live text of what the wearer says, and Lente's reply;
  - chips for the sources and for the tools Lente used.

  It is hands-free by default, with hold-to-talk as an option, and has Pausar and Terminar. It speaks each sentence of the reply with the phone's own voice as it arrives. It uses the clip when the clip is connected, and the phone's microphone otherwise.
- **A voice session in the hub.** A WebSocket `/voice` per user, behind the same credentials as `/device`. The phone sends PCM16 audio and gets JSON events: `listening`, `partial`, `thinking`, `reply` (one sentence at a time), `tool`, `sources`, `bargeIn` and `end`.
  - Transcription runs in `ENDPOINTING` mode, the mode Meta documents for voice commands. Each `speechComplete` runs one turn of the agent.
  - Barge-in: when the wearer speaks while Lente speaks, the phone cuts its voice and the hub cancels the reply in progress.
- **The voice agent** (`src/voice-agent.ts`, pure). A Muse Spark 1.3 tool loop over the Responses API. It answers in Spanish, short and spoken: one to three sentences, no lists, no markdown. Its tools reuse what exists:
  - `ask_memory`, through the tiered memory;
  - `list_projects`, `list_tasks`, `add_task`, `complete_task`, `delete_task`, `reassign_task`;
  - `start_recording`, which opens the record sheet with the choices filled in and never records without a tap;
  - Spark's own `web_search`, whose sources it names;
  - `delegate`, which without `add-agent-bridge` leaves a task for Lente.

  Completing or deleting asks for a spoken "sí". Nothing sends an email or a message.
- **History.** Each session is kept, sealed, in `chat_messages` (already in the schema) and shows in Inicio's chat. A voice session opens no meeting.
- **Measured.** `scripts/bench-voice.ts` speaks synthetic questions made with `say` and measures:
  - from the end of the question to the first reply text;
  - to the first sentence ready to speak;
  - the cost of each turn.

Out of scope:
- an agent bridge to outside agents (`add-agent-bridge`);
- ElevenLabs as the main voice (it is not Meta's, and the phone's voice needs no network);
- wake words;
- voice sessions on the web page.

Meta models:
- Muse Voice Transcribe in `ENDPOINTING` mode for the wearer's turns.
- Muse Spark 1.3 with function calling, web-search grounding and prompt caching for the agent.
- The tiered memory's Spark calls behind `ask_memory`.

Privacy:
- Audio is never stored.
- The session's text is sealed like the rest of the chat.
- Logs carry lengths and counts, never what was said.
- Web searches send only the query the model writes.

## Capabilities

### New Capabilities
- `voice-mode`: a spoken conversation with Lente about what it knows, with tasks, recordings, web search and delegation.

## Impact

- Hub:
  - `src/voice-agent.ts`: instructions, tool specs, the loop, sentences and confirmations; pure.
  - `src/voice-tools.ts`: the tools over the runtime's stores, with short ids and the pending confirmation; pure.
  - `src/voice-wire.ts`: the Responses adapter with function calls and web search.
  - `src/voice-session.ts`: one session's state machine over the ASR and the agent; pure apart from timers.
  - `src/asr-session.ts` takes a mode.
  - A chat store: files and Supabase.
  - `src/pilot.ts`: the `/voice` upgrade, the tools on the runtime's stores, `GET /chat/voice`.
- Stub: `scripts/stub-meta.ts` answers tool calls and endpointing.
- Bench: `scripts/bench-voice.ts`.
- Android:
  - `core/Voice*.kt`: the event reducer and sentence queue, pure and tested;
  - `platform/VoiceClient.kt`: the OkHttp WebSocket and the microphone;
  - `ui/Voice.kt`: the screen, and its button on Inicio.
  - No new dependency.
