# Proposal

Depends on: `add-meeting-library`, `add-ask-lente`, `add-accounts` (group 3 also needs `add-voice-mode`)

## Why

Lente already keeps the wearer's day as text with times: every turn heard, every camera description, every meeting with its turns and notes, every kept fact. The only ways back into it today are a meeting's detail page and a question to the chat. Neither lets the wearer simply go back to a moment ("what was happening at 10:40 on Tuesday?") and see it again as it unfolded.

"The Entire History of You" (Black Mirror, 2011, cited in README "Related work") imagined that interface: a timeline of rings and a way to re-watch any moment. The episode is a warning: re-watching without end destroys the person, and the harm comes from memories being shared and demanded. Lente takes the idea of going back to a moment and turns the ending around: **remember in order to let go**. Going back is private, it is text only, it nudges the wearer to act instead of looping, and any day can be forgotten. Only the general idea is taken; no image, layout or text from the series is used.

## What Changes

- **Moments index (hub).** A pure function turns meetings, the day record and kept facts into moments: a meeting, a stretch of talk heard outside meetings, a camera description, a kept fact or a note. Each moment has an id that the memory already uses (`m…` for meetings, `d<day>:<n>` for day entries), a start time and a source.
- **Highlights.** When the nightly day digest is written (`add-accounts` 5.1–5.2), the same Muse Spark 1.3 call also returns up to 5 highlights for the day. Each one names a real moment id and says why it matters in one line. Ids that don't exist are dropped, as `src/ask.ts` does. There is no extra model call.
- **Tu historia (Android).** A timeline screen: rings that turn with the finger (day → hour → minute) and a fan of moment cards for the selected time. The centre shows the relative day («HOY», «AYER», «MARTES 28»), the time and how often the selected moment was relived. Highlights are marks on the rings.
- **Revivir.** Opening a moment plays it back as **timed text**: the conversation as subtitles at its real pace, the camera description of that minute, and source chips that open the meeting at the turn. The player has play, pause, scrub and back to start. Lente keeps only text, never audio or video, so Revivir neither needs nor asks for anything more.
- **Notes on a moment.** The wearer marks a moment and writes a note. It is kept in the memory as a kept fact with the moment as its source, so the chat can find it.
- **Relive counter and a gentle brake.** The hub counts how often each moment was relived. On the third time, Lente offers the summary and an action («¿Lo anoto como tarea?») before playing again. It never blocks.
- **Forget a day.** «Olvidar este día» deletes the day's record, the meetings that started that day, the facts and notes sourced there and every digest that summarised it. The week and month digests are rebuilt without it.
- **By voice.** «Lente, revive la reunión del martes» opens that moment on the phone: a new `relive_moment` tool in voice mode, next to `ask_memory`.
- **Never shared.** No "send this moment" and no share sheet on anything relived. The account export stays (the wearer's right to their own data). It is the only way content leaves, and it goes only to the wearer.

Out of scope: audio or video playback (Lente doesn't keep either), sharing, the web app at `/app` (a later group once Android is checked), year and month rings.

Meta models: Muse Spark 1.3 for highlights, inside the existing day digest call, with structured output. Voice mode keeps its current model.

Privacy: moments are computed in the hub's memory from the sealed stores for the request that needs them. The relive counter stores only a moment id, a number and a time, with no content. Forgetting a day removes the day's content and every digest that summarised it.

## Capabilities

### New Capabilities
- `memory-timeline`: the moments index, highlights, replay as timed text, the relive counter, notes on a moment, the never-shared rule and the voice tool.

### Modified Capabilities
- `companion-app`: Tu historia and Revivir on Android (added requirements only).
- `day-record`: forgetting a day (added requirement).

The voice tool is specified in `memory-timeline` and not as a delta on `voice-mode`, because `add-voice-mode` is not archived yet. Once it is, the requirement can move there.

## Impact

- New: `src/moments.ts` (pure moments index and replay timeline) with tests, `GET /moments`, `GET /moments/<id>/replay`, `POST /moments/<id>/relived`, `POST /moments/<id>/note`, `POST /days/<day>/forget`. The highlight fields join the day digest schema in `src/digests.ts`.
- Android: a Tu historia screen and a Revivir player in `android/`, plus an entry in the menu.
- Database: a `relive_counts` table (user id, moment id, count, last time; no content) with RLS. Notes reuse the facts store (sealed JSON gains a `moment` field), so they need no migration.
- Voice: one more tool in `src/voice-agent.ts`.
- Docs: `docs/benchmarks.md` (moments and replay latency on a synthetic history), README "Related work" (the episode, cited).

## Later

Ideas that follow from the timeline. Each needs its own change:

- **"¿Dónde dejé las llaves?"** Search for objects in the camera descriptions of the day record and answer with the moment and the time it was last seen.
- **Personal commitments, not only work ones** («te llamo el viernes»), with evidence and approval like the closing agent's. They need an explicit opt-in, since they reach the wearer's private life.
- **Dictated details** (a phone number, an Instagram handle) become «Agregar a contactos» with one tap and a confirmation.
- **Pantry by camera.** When something is running out, it goes on a shopping list. Only from Mirar on demand, never from the live camera.
- **A physical privacy signal everyone understands** («no estoy grabando»), built on the pause that already exists (see `add-consent` for the recording light).
- **A warm, best-friend tone for proactive notices**, measured with evals on synthetic data before it ships.
