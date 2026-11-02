# Design

## Context

- The parts already exist:
  - realtime transcription (`src/asr-session.ts`);
  - the tiered memory behind `POST /ask` (`src/ask-tiers.ts`);
  - tasks with owners, and projects;
  - the record sheet;
  - the phone's text-to-speech;
  - the self-voice guard (`src/self-voice.ts`).
- What is missing:
  - a conversation that is spoken;
  - an agent that acts on tasks;
  - web search.
- Verified on 2026-11-02 with real calls on synthetic text (recorded in `docs/kb/meta-api.md`):
  - Muse Spark 1.3 function calling over the Responses API, streamed, with `store: false`. The call arrives as a `function_call` output item with `call_id`, `name` and `arguments` (a JSON string); the result goes back as a `function_call_output` input item.
  - Before a tool call the model may stream a short `phase: "commentary"` message ("La agrego a tu lista."). It must be replayed with its phase, or the next request is rejected.
  - `web_search` is a built-in tool on the Responses API only (not Chat Completions). It can be offered together with function tools. It costs USD 2.50 per 1,000 queries on top of the tokens.
  - With `include: ["web_search_call.results"]`, each `web_search_call` item carries its `action.query` and `results[]` (`title`, `url`). In the probe the `url_citation` annotations came back empty, so the sources shown are the results.

## Decisions

1. **The Responses API, stateless.**
   - Every step resends the instructions, the session's turns and the current turn's tool items, with `store: false`, so Meta keeps no copy of the conversation.
   - Reasoning items are not replayed. At `minimal` effort they carry little, and dropping them keeps the input small.
   - Effort `minimal`, `parallel_tool_calls: false`, `max_output_tokens` 400.
   - At most 4 model steps per turn.
   - The instructions and tool list come first and never change within a session, so the prefix caches. The instructions go as the first `developer` message: the top-level `instructions` field was never served from the cache when measured.
2. **Sentences, not tokens.**
   - A pure splitter cuts the streamed text at `.`, `?`, `!` or `…` followed by a space, and at a line break. It strips markdown marks and list bullets, and holds back anything shorter than 12 characters so "Sr." does not become a sentence.
   - Each sentence goes to the phone as a `reply` event, which speaks it.
   - Commentary sentences are sent too, marked `commentary`, so the wearer hears "Busco en internet…" while the tool runs. The instructions say a preamble names what Lente is checking and never claims an action is done.
3. **Short ids for the model.**
   - Tasks and projects reach the model as `t1…` and `p1…`, mapped to real ids in the session.
   - `complete_task`, `delete_task` and `reassign_task` accept only ids the session showed (from `list_tasks` or `add_task`). Anything else comes back as an error telling the model to list first.
4. **Confirmation is deterministic.**
   - `complete_task` and `delete_task` do not act. They store one pending action and return the question to ask ("¿Marco como hecha «…»?").
   - The next turn is checked by a pure `confirmation()` before any model call:
     - a yes ("sí", "dale", "hazlo", "confirmo"…) runs the pending action and says so, with no model call;
     - a no drops it and says so;
     - anything else drops it and goes to the model as a new turn.
   - So a slip of the model cannot complete or delete anything.
5. **Delegation.** With no `add-agent-bridge` in the repository, `delegate` adds a task owned by Lente (`source: "agent"`) whose title is the instruction, with the agent's name when given. Nothing runs, and Lente says that it is waiting in Tareas.
6. **Barge-in on the hub, echo-proof.**
   - The phone keeps its microphone open while it speaks. The voice screen records with `VOICE_COMMUNICATION`, which turns on the platform's echo canceller.
   - Every sentence the hub sends is registered with the runtime's `NarrationGuard`.
   - A partial transcript counts as barge-in only if Lente is thinking or speaking, it has at least two words, and it is not an echo by `NarrationGuard.repeats`. A completed turn that is an echo is dropped, as in meetings.
   - On barge-in the hub aborts the turn's fetch (an `AbortSignal` through the loop), sends `bargeIn`, and ignores late deltas of the cancelled turn by its turn number.
   - The phone may also send `{"type":"bargeIn"}`, from holding the talk button while Lente speaks.
7. **Transcription.**
   - `AsrSession` takes the mode; `sessionRequest` sends `ENDPOINTING` for voice and `DIARIZATION` for meetings, as before.
   - A voice session sends audio only while not paused. The service closes an idle session (1008), and the next audio reopens it through `resume()`, as the silence gate does.
8. **The clip.**
   - When a clip (not the phone stand-in) is the runtime's device, the session taps the clip's conditioned audio instead of the phone's. It pauses meeting listening, sends the clip `M` so its microphone streams, and restores both at the end.
   - The `listening` event says which source is in use, and the phone records only when it is `phone`.
9. **History as chat.**
   - A `Chats` store (files: `chat.json`; Supabase: `chat_messages`, `text_enc` sealed per row, `refs` with kinds and ids only) keeps each session as one thread.
   - `GET /chat/voice` returns the latest threads, so Inicio's chat shows them.
   - The runtime's day record and meetings are not touched.
10. **Measurement.** `scripts/bench-voice.ts` makes the questions with `say` (Spanish voice) and converts them to 16 kHz PCM with `afconvert`. It streams them at real time to `/voice` on a running hub, then a second of silence, and times:
    - the end of the audio → `speechComplete` (endpointing);
    - the end of the audio → the first `reply` (first text);
    - the end of the audio → the first sentence ready for the phone's voice. The phone's own TTS start is measured on the phone, not here.

    Cost per turn comes from the `usage` the turn reports, priced from `docs/kb/meta-api.md`.

## Risks

- **Endpointing cuts a pause mid-sentence.** The turn is answered early. The wearer can barge in, and the new turn carries the previous one as history.
- **Web search is slow** (4.3 s for one question in the probe). The commentary sentence covers the wait, and the instructions keep searches to questions that need the web.
- **The echo canceller varies by phone.** The hub's echo guard is the second line, and hold-to-talk is the fallback.
- **ask_memory adds two structured calls.** Its latency is measured separately in the bench.
